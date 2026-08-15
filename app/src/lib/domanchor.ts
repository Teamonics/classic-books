// Maps between DOM positions inside a rendered top-level block element and
// character offsets in the block's canonical text (see blocktext.ts).
//
// The walk skips chrome (margin numbers, note markers, speaker labels) and
// tolerates template whitespace: DOM whitespace aligns to canonical
// whitespace ("\n" between verse lines matches any DOM gap), and stray DOM
// whitespace with no canonical counterpart is skipped.

const SKIP_SELECTOR = ".ln, .pn, .noteref, .speaker";

interface Seg {
  node: Text;
  domStart: number; // offset in node
  ciStart: number; // canonical index of first mapped char
  len: number;
}

export class BlockMap {
  private segs: Seg[] = [];
  readonly ok: boolean;

  constructor(
    private el: Element,
    private canonical: string,
  ) {
    this.ok = this.build();
  }

  private build(): boolean {
    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = (n as Text).parentElement;
        return p && p.closest(SKIP_SELECTOR) && this.el.contains(p.closest(SKIP_SELECTOR)!)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const c = this.canonical;
    let ci = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const data = node.data;
      let segStart = -1;
      let segCi = -1;
      for (let i = 0; i < data.length; i++) {
        const ch = data[i]!;
        let matched = false;
        if (ci < c.length && ch === c[ci]) {
          matched = true;
        } else if (/\s/.test(ch)) {
          // DOM whitespace: matches canonical whitespace if one is pending,
          // otherwise it is template chrome — skip it.
          if (ci < c.length && /\s/.test(c[ci]!)) matched = true;
          else {
            this.flush(node, segStart, i, segCi);
            segStart = -1;
            continue;
          }
        } else if (ci < c.length && /\s/.test(c[ci]!)) {
          // canonical expects whitespace (e.g. "\n" between lines) that the
          // DOM renders as an element boundary; consume canonical ws and retry.
          ci++;
          i--;
          this.flush(node, segStart, i + 1, segCi);
          segStart = -1;
          continue;
        }
        if (matched) {
          if (segStart < 0) {
            segStart = i;
            segCi = ci;
          }
          ci++;
        } else {
          // real mismatch: bail out, anchoring is unsafe
          return false;
        }
      }
      this.flush(node, segStart, data.length, segCi);
    }
    // allow trailing canonical whitespace to remain unconsumed
    while (ci < c.length && /\s/.test(c[ci]!)) ci++;
    return ci >= c.length * 0.98; // tolerate tiny tail loss but not truncation
  }

  private flush(node: Text, segStart: number, end: number, segCi: number) {
    if (segStart >= 0 && end > segStart) {
      this.segs.push({ node, domStart: segStart, ciStart: segCi, len: end - segStart });
    }
  }

  // DOM position -> canonical index (clamped to nearest mapped char).
  fromDom(node: Node, offset: number): number | null {
    if (!this.segs.length) return null;
    if (node.nodeType !== Node.TEXT_NODE) {
      // element position: resolve via child text
      const el = node as Element;
      const target = el.childNodes[Math.min(offset, el.childNodes.length - 1)] ?? el;
      const within = this.segs.filter((s) => target.contains?.(s.node) || s.node === target);
      return within.length ? within[0]!.ciStart : this.nearestFor(el);
    }
    const t = node as Text;
    const mine = this.segs.filter((s) => s.node === t);
    if (!mine.length) return this.nearestFor(t.parentElement ?? this.el);
    for (const s of mine) {
      if (offset < s.domStart) return s.ciStart;
      if (offset <= s.domStart + s.len) return s.ciStart + (offset - s.domStart);
    }
    const last = mine[mine.length - 1]!;
    return last.ciStart + last.len;
  }

  private nearestFor(el: Element): number | null {
    // position before/after chrome: snap to the first segment following it
    for (const s of this.segs) {
      const cmp = el.compareDocumentPosition(s.node);
      if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return s.ciStart;
    }
    const last = this.segs[this.segs.length - 1];
    return last ? last.ciStart + last.len : null;
  }
}

// Find the top-level block element and its index for a DOM node.
export function blockElFor(node: Node): { el: Element; blockIndex: number; chunkRef: string } | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const blockEl = el?.closest("[data-block]");
  const sect = blockEl?.closest("[data-ref]");
  if (!blockEl || !sect) return null;
  return {
    el: blockEl,
    blockIndex: Number(blockEl.getAttribute("data-block")),
    chunkRef: sect.getAttribute("data-ref")!,
  };
}
