<script lang="ts">
  import { blockElFor, BlockMap } from "$lib/domanchor";
  import { blockText } from "$lib/blocktext";
  import { addHighlight, newId, type HlColor } from "$lib/annotations.svelte";
  import { citeTarget, citationText, copyText } from "$lib/cite";
  import type { Chunk, Manifest } from "$lib/types";

  let {
    manifest,
    chunks,
    onnotecreated,
  }: {
    manifest: Manifest | null;
    chunks: Chunk[];
    onnotecreated?: (id: string) => void;
  } = $props();

  interface Pending {
    chunk: Chunk;
    blockIndex: number;
    start: number;
    end: number;
    exact: string;
    prefix: string;
    suffix: string;
    x: number;
    y: number;
  }

  let pending = $state<Pending | null>(null);
  let copied = $state(false);
  const COLORS: HlColor[] = ["amber", "green", "blue", "rose"];

  function computeSelection(): Pending | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startInfo = blockElFor(range.startContainer);
    if (!startInfo) return null;
    const chunk = chunks.find((c) => c.ref === startInfo.chunkRef);
    const block = chunk?.blocks[startInfo.blockIndex];
    if (!chunk || !block) return null;
    const canonical = blockText(block);
    const map = new BlockMap(startInfo.el, canonical);
    if (!map.ok) return null;
    let s = map.fromDom(range.startContainer, range.startOffset);
    if (s === null) return null;
    // end: clamp to this block if selection spans further
    const endInfo = blockElFor(range.endContainer);
    let e: number | null =
      endInfo && endInfo.el === startInfo.el
        ? map.fromDom(range.endContainer, range.endOffset)
        : canonical.length;
    if (e === null) e = canonical.length;
    if (e < s) [s, e] = [e, s];
    // trim whitespace edges
    while (s < e && /\s/.test(canonical[s]!)) s++;
    while (e > s && /\s/.test(canonical[e - 1]!)) e--;
    if (e <= s) return null;
    const rect = range.getBoundingClientRect();
    return {
      chunk,
      blockIndex: startInfo.blockIndex,
      start: s,
      end: e,
      exact: canonical.slice(s, e),
      prefix: canonical.slice(Math.max(0, s - 30), s),
      suffix: canonical.slice(e, e + 30),
      x: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
      y: Math.max(rect.top, 60),
    };
  }

  function onpointerup() {
    // let the browser finalize the selection first
    setTimeout(() => {
      pending = computeSelection();
      copied = false;
    }, 10);
  }

  function onselectionchange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) pending = null;
  }

  function saveHighlight(color: HlColor, withNote: boolean) {
    if (!pending) return;
    const id = newId();
    addHighlight({
      id,
      work: pending.chunk.work,
      ref: pending.chunk.ref,
      blockIndex: pending.blockIndex,
      start: pending.start,
      end: pending.end,
      quote: { exact: pending.exact, prefix: pending.prefix, suffix: pending.suffix },
      color,
      createdAt: new Date().toISOString(),
    });
    window.getSelection()?.removeAllRanges();
    pending = null;
    if (withNote) onnotecreated?.(id);
  }

  async function cite() {
    if (!pending || !manifest) return;
    const target = citeTarget(manifest, pending.chunk, pending.blockIndex, pending.start);
    const ok = await copyText(citationText(manifest, target, pending.exact));
    copied = ok;
    setTimeout(() => {
      window.getSelection()?.removeAllRanges();
      pending = null;
    }, 900);
  }
</script>

<svelte:document {onpointerup} {onselectionchange} />

{#if pending}
  <div
    class="menu ui"
    role="toolbar"
    aria-label="Selection actions"
    style:left={`${pending.x}px`}
    style:top={`${pending.y - 48}px`}
  >
    {#if copied}
      <span class="copied">Citation copied ✓</span>
    {:else}
      {#each COLORS as c}
        <button
          class={`dot dot-${c}`}
          aria-label={`Highlight ${c}`}
          onclick={() => saveHighlight(c, false)}
        ></button>
      {/each}
      <span class="sep"></span>
      <button class="act" onclick={() => saveHighlight("amber", true)}>Note</button>
      <button class="act" onclick={cite}>Cite</button>
    {/if}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    transform: translateX(-50%);
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 999px;
    padding: 0.4rem 0.7rem;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
    font-size: 0.85rem;
  }
  .dot {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.25);
    cursor: pointer;
    padding: 0;
  }
  .dot-amber {
    background: #e8b229;
  }
  .dot-green {
    background: #5cb85c;
  }
  .dot-blue {
    background: #4f9dd0;
  }
  .dot-rose {
    background: #d06079;
  }
  .sep {
    width: 1px;
    height: 1.1rem;
    background: var(--rule);
  }
  .act {
    border: none;
    background: none;
    cursor: pointer;
    font-weight: 600;
    color: var(--accent);
    padding: 0.1rem 0.2rem;
  }
  .copied {
    color: var(--accent);
    font-weight: 600;
    padding: 0 0.3rem;
  }
</style>
