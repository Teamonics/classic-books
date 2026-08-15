<script lang="ts">
  import { getChunk } from "$lib/data";
  import { blockText } from "$lib/blocktext";
  import { loadIndex, query, highlightWords, makeSnippet, type SearchHit } from "$lib/search";
  import { lineAt } from "$lib/cite";
  import type { Chunk, Manifest } from "$lib/types";

  let { manifest, author }: { manifest: Manifest; author: string } = $props();

  let q = $state("");
  let hits = $state<SearchHit[]>([]);
  let searched = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let shown = $state(30);
  let input = $state<HTMLInputElement | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  function oninput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 250);
  }

  async function run() {
    const term = q.trim();
    shown = 30;
    if (term.length < 2) {
      hits = [];
      searched = false;
      return;
    }
    busy = true;
    error = null;
    try {
      const index = await loadIndex(manifest);
      hits = query(index, term).hits;
      searched = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const words = $derived(highlightWords(q));

  async function resolveHit(hit: SearchHit): Promise<{ href: string; title: string; snippet: string }> {
    const ref = manifest.toc[hit.chunkIdx]!.ref;
    const chunk: Chunk = await getChunk(manifest, ref);
    const block = chunk.blocks[hit.blockIdx]!;
    const text = blockText(block);
    const { snippet } = makeSnippet(text, words);
    // deep-link to the block's first line / paragraph when the scheme allows
    let fineRef = ref;
    const scheme = manifest.refScheme.primary;
    const line = lineAt(block, 0);
    if (line !== undefined && (scheme.includes(":line") || scheme === "line")) fineRef = `${ref}:${line}`;
    else if (block.type === "para" && block.n !== undefined && scheme.includes("paragraph"))
      fineRef = `${ref}.${block.n}`;
    return { href: `/${author}/${manifest.slug}/${fineRef}`, title: manifest.toc[hit.chunkIdx]!.title, snippet };
  }

  export function focus() {
    input?.focus();
  }

  function markup(snippet: string): string {
    let safe = snippet.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const w of words) {
      if (w.length < 2) continue;
      safe = safe.replace(new RegExp(`(?<![\\w])(${w.replace(/[.*+?^${}()|[\]\\]/g, "")}[\\w’']*)`, "gi"), "<mark>$1</mark>");
    }
    return safe;
  }
</script>

<section class="search ui">
  <input
    bind:this={input}
    bind:value={q}
    {oninput}
    type="search"
    placeholder={`Search ${manifest.title}…`}
    aria-label={`Search ${manifest.title}`}
  />
  {#if busy}
    <p class="stat">Searching…</p>
  {:else if error}
    <p class="stat">Search unavailable: {error}</p>
  {:else if searched}
    <p class="stat">
      {hits.length === 0 ? "No matches." : `${hits.length} matching passage${hits.length === 1 ? "" : "s"}`}
    </p>
  {/if}
  {#if hits.length}
    <ol class="results">
      {#each hits.slice(0, shown) as hit (hit.chunkIdx * 100000 + hit.blockIdx)}
        <li>
          {#await resolveHit(hit)}
            <span class="loading">…</span>
          {:then r}
            <a href={r.href}>
              <span class="where">{r.title}</span>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- snippet is escaped before marking -->
              <span class="snip">{@html markup(r.snippet)}</span>
            </a>
          {:catch}
            <span class="loading">failed to load snippet</span>
          {/await}
        </li>
      {/each}
    </ol>
    {#if hits.length > shown}
      <button class="more" onclick={() => (shown += 50)}>Show more ({hits.length - shown} remaining)</button>
    {/if}
  {/if}
</section>

<style>
  .search {
    margin: 1.4rem 0 0;
  }
  input {
    width: 100%;
    font: inherit;
    font-size: 0.95rem;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 0.6rem 0.9rem;
  }
  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .stat {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0.5rem 0.2rem;
  }
  .results {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }
  .results a {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 0.55rem 0.4rem;
    border-bottom: 1px solid var(--rule);
    border-radius: 4px;
  }
  .results a:hover {
    background: var(--raised);
  }
  .where {
    display: block;
    font-size: 0.72rem;
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 0.1rem;
  }
  .snip {
    font-size: 0.88rem;
    line-height: 1.45;
  }
  .snip :global(mark) {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: inherit;
    border-radius: 2px;
    padding: 0 0.1em;
  }
  .loading {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .more {
    margin-top: 0.6rem;
    border: 1px solid var(--rule);
    background: var(--raised);
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
  }
</style>
