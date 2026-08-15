<script lang="ts">
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { getWork, getChunk, prefetchChunk, resolveRef } from "$lib/data";
  import { savePosition, getPosition, markRead } from "$lib/progress.svelte";
  import BlockView from "$lib/components/BlockView.svelte";
  import SettingsPanel from "$lib/components/SettingsPanel.svelte";
  import SelectionMenu from "$lib/components/SelectionMenu.svelte";
  import AnnotationEditor from "$lib/components/AnnotationEditor.svelte";
  import { highlightsFor, repairAnchors, addBookmark, newId } from "$lib/annotations.svelte";
  import { anchorSnippet } from "$lib/cite";
  import type { HlRange } from "$lib/blocktext";
  import type { Chunk, Manifest, Note } from "$lib/types";

  const author = $derived(page.params.author!);
  const slug = $derived(page.params.work!);
  const refParam = $derived(page.params.ref!);

  let manifest = $state<Manifest | null>(null);
  let chunks = $state<Chunk[]>([]);
  let error = $state<string | null>(null);
  let settingsOpen = $state(false);
  let openNote = $state<{ chunk: string; note: Note } | null>(null);
  let container = $state<HTMLElement | null>(null);
  let sentinel = $state<HTMLElement | null>(null);
  let currentRef = $state<string>("");
  let editingHl = $state<string | null>(null);
  let bookmarked = $state(false);
  let loading = false;

  // Highlight ranges grouped chunk ref -> blockIndex -> ranges.
  const hlByBlock = $derived.by(() => {
    const all = highlightsFor(slug);
    const map = new Map<string, Map<number, HlRange[]>>();
    for (const h of all) {
      if (h.orphaned) continue;
      let m = map.get(h.ref);
      if (!m) map.set(h.ref, (m = new Map()));
      let arr = m.get(h.blockIndex);
      if (!arr) m.set(h.blockIndex, (arr = []));
      arr.push({ s: h.start, e: h.end, color: h.color, id: h.id });
    }
    return map;
  });

  // (Re)load when the route changes to a ref we don't already have on screen.
  $effect(() => {
    const target = refParam;
    const sameWork = chunks[0]?.work === slug;
    if (sameWork && chunks.some((c) => c.ref === target || target.startsWith(c.ref + ":"))) return;
    void load(target);
  });

  async function load(target: string) {
    error = null;
    try {
      const { manifest: m } = await getWork(slug);
      manifest = m;
      const resolved = resolveRef(m, target) ?? { chunkRef: m.toc[0]!.ref };
      const chunk = await getChunk(m, resolved.chunkRef);
      repairAnchors(chunk);
      chunks = [chunk];
      currentRef = chunk.ref;
      prefetchChunk(m, chunk.next);
      await tick();
      await restoreOrAnchor(resolved);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function restoreOrAnchor(resolved: { chunkRef: string; line?: number; para?: number }) {
    if (!container) return;
    const sect = container.querySelector(`[data-ref="${CSS.escape(resolved.chunkRef)}"]`);
    if (!sect) return;
    let el: Element | null = null;
    if (resolved.line !== undefined) el = sect.querySelector(`[data-line="${resolved.line}"]`);
    else if (resolved.para !== undefined) el = sect.querySelector(`[data-para="${resolved.para}"]`);
    else {
      const pos = getPosition(slug);
      if (pos && pos.ref === resolved.chunkRef && pos.blockIndex > 0) {
        el = sect.querySelector(`[data-block="${pos.blockIndex}"]`);
      }
    }
    if (el) {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -80);
      el.classList.add("anchored");
    } else {
      window.scrollTo(0, 0);
    }
  }

  async function appendNext() {
    if (!manifest || loading) return;
    const last = chunks[chunks.length - 1];
    if (!last?.next) return;
    loading = true;
    try {
      const next = await getChunk(manifest, last.next);
      repairAnchors(next);
      chunks = [...chunks, next];
      prefetchChunk(manifest, next.next);
    } finally {
      loading = false;
    }
  }

  // Bottom sentinel: append the next chunk as the reader approaches the end.
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void appendNext();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  // Track reading position: topmost visible block wins.
  $effect(() => {
    if (!container || chunks.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!container) return;
        const blocks = container.querySelectorAll("[data-block]");
        for (const el of blocks) {
          const r = el.getBoundingClientRect();
          if (r.bottom > 90) {
            const sect = el.closest("[data-ref]");
            const ref = sect?.getAttribute("data-ref");
            if (ref) {
              currentRef = ref;
              savePosition(slug, { ref, blockIndex: Number(el.getAttribute("data-block")) });
              const want = `/${author}/${slug}/${ref}`;
              if (location.pathname !== want) replaceState(want, {});
              // Reaching the last block of a chunk marks it read.
              const sectBlocks = sect!.querySelectorAll("[data-block]");
              if (el === sectBlocks[sectBlocks.length - 1]) markRead(slug, ref);
            }
            break;
          }
        }
      }, 250);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  });

  function onnote(noteRef: string) {
    for (const c of chunks) {
      const note = c.notes?.find((n) => n.id === noteRef);
      if (note) {
        openNote = openNote?.note.id === noteRef ? null : { chunk: c.ref, note };
        return;
      }
    }
  }

  async function gotoRef(ref: string | null | undefined) {
    if (!ref || !manifest) return;
    chunks = [];
    await tick();
    history.pushState({}, "", `/${author}/${slug}/${ref}`);
    void load(ref);
  }

  function bookmarkHere() {
    const chunk = chunks.find((c) => c.ref === currentRef) ?? chunks[0];
    if (!chunk) return;
    const pos = getPosition(slug);
    const blockIndex = pos?.ref === chunk.ref ? pos.blockIndex : 0;
    addBookmark({
      id: newId(),
      work: slug,
      ref: chunk.ref,
      blockIndex,
      label: `${chunk.title} — ${anchorSnippet(chunk, blockIndex)}`,
      createdAt: new Date().toISOString(),
    });
    bookmarked = true;
    setTimeout(() => (bookmarked = false), 1200);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowRight") void gotoRef(chunks[chunks.length - 1]?.next);
    else if (e.key === "ArrowLeft") void gotoRef(chunks[0]?.prev);
    else if (e.key === "s") settingsOpen = !settingsOpen;
    else if (e.key === "Escape") {
      settingsOpen = false;
      openNote = null;
    }
  }

  const currentTitle = $derived(
    manifest?.toc.find((t) => t.ref === currentRef)?.title ?? manifest?.title ?? "",
  );
</script>

<svelte:window {onkeydown} />

<svelte:head>
  <title>{manifest ? `${currentTitle} · ${manifest.title}` : "Classic Books"}</title>
</svelte:head>

<div class="bar ui">
  <a class="back" href={`/${author}/${slug}`} aria-label="Table of contents">☰ <span class="bartitle">{manifest?.title}</span></a>
  <span class="chunktitle">{currentTitle}</span>
  <button class="gear" aria-label="Bookmark this position" onclick={bookmarkHere}>
    {bookmarked ? "✓" : "🔖"}
  </button>
  <button class="gear" aria-label="Reading settings" onclick={() => (settingsOpen = !settingsOpen)}>Aa</button>
</div>

<SettingsPanel bind:open={settingsOpen} />

<!-- Delegated pointer affordance for highlight marks; full keyboard access
     to highlights lives in the work page's annotation list. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<main
  bind:this={container}
  onclick={(e) => {
    const m = (e.target as Element).closest?.("[data-hlid]");
    if (m) editingHl = m.getAttribute("data-hlid");
  }}
>
  {#if error}
    <p class="ui err">Could not load: {error}</p>
  {/if}
  {#each chunks as chunk (chunk.ref)}
    <section class="chunk" data-ref={chunk.ref}>
      <h2 class="chunkhead">{chunk.title}</h2>
      {#each chunk.blocks as block, i}
        <BlockView
          {block}
          index={i}
          hls={hlByBlock.get(chunk.ref)?.get(i)}
          {onnote}
        />
      {/each}
    </section>
  {/each}

  {#if chunks.length}
    {@const last = chunks[chunks.length - 1]!}
    <nav class="seam ui" bind:this={sentinel}>
      {#if last.next}
        <button onclick={() => appendNext()}>Continue: {manifest?.toc.find((t) => t.ref === last.next)?.title}</button>
      {:else}
        <p class="fin">The End</p>
        <a href={`/${author}/${slug}`}>Back to contents</a>
      {/if}
    </nav>
  {/if}
</main>

<SelectionMenu {manifest} {chunks} onnotecreated={(id) => (editingHl = id)} />

{#if editingHl}
  <AnnotationEditor work={slug} id={editingHl} {manifest} onclose={() => (editingHl = null)} />
{/if}

{#if openNote}
  <div class="note ui" role="dialog" aria-label="Translator's note">
    <button class="close" aria-label="Close note" onclick={() => (openNote = null)}>×</button>
    <div class="notebody">
      {#each openNote.note.blocks as b}
        <BlockView block={b} />
      {/each}
    </div>
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    inset: 0 0 auto 0;
    height: 2.8rem;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0 0.9rem;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--rule);
    z-index: 40;
    font-size: 0.85rem;
  }
  .back {
    text-decoration: none;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 40%;
  }
  .chunktitle {
    flex: 1;
    text-align: center;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gear {
    border: 1px solid var(--rule);
    background: var(--raised);
    border-radius: 8px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-weight: 600;
  }
  main {
    max-width: calc(var(--measure) + 8rem);
    margin: 0 auto;
    padding: 5rem 1.25rem 6rem 4.5rem;
  }
  .chunk {
    max-width: var(--measure);
    margin: 0 auto 3rem;
  }
  .chunkhead {
    font-weight: 600;
    font-size: 1.15rem;
    margin: 0 0 1.4rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--rule);
  }
  .seam {
    max-width: var(--measure);
    margin: 0 auto;
    text-align: center;
    padding: 1rem 0 2rem;
  }
  .seam button {
    border: 1px solid var(--rule);
    background: var(--raised);
    border-radius: 8px;
    padding: 0.6rem 1.2rem;
    cursor: pointer;
  }
  .fin {
    color: var(--muted);
    letter-spacing: 0.2em;
    font-variant-caps: all-small-caps;
  }
  .err {
    color: var(--accent);
  }
  .note {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: min(38rem, 100vw - 1rem);
    max-height: 40vh;
    overflow-y: auto;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-bottom: none;
    border-radius: 12px 12px 0 0;
    padding: 1rem 1.2rem;
    z-index: 60;
    box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
  }
  .note .close {
    position: absolute;
    top: 0.4rem;
    right: 0.6rem;
    border: none;
    background: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--muted);
  }
  :global(.anchored) {
    animation: flash 1.5s ease 1;
  }
  @keyframes flash {
    from {
      background: color-mix(in srgb, var(--accent) 18%, transparent);
    }
    to {
      background: transparent;
    }
  }
  @media (max-width: 40rem) {
    main {
      padding-left: 3.4rem;
    }
  }
</style>
