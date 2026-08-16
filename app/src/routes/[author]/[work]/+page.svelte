<script lang="ts">
  import { page } from "$app/state";
  import BookmarkIcon from "$lib/components/BookmarkIcon.svelte";
  import { base } from "$app/paths";
  import { getWork } from "$lib/data";
  import { getPosition, getReadRefs, progressLabel } from "$lib/progress.svelte";
  import {
    highlightsFor,
    bookmarksFor,
    removeBookmark,
    exportJson,
    exportMarkdown,
    download,
  } from "$lib/annotations.svelte";
  import SearchPanel from "$lib/components/SearchPanel.svelte";
  import {
    offlineSupported,
    downloadWork,
    workDownloadState,
    removeWorkDownload,
    requestPersistence,
    isPersisted,
    formatBytes,
    type DownloadState,
  } from "$lib/offline";
  import type { Manifest } from "$lib/types";

  const slug = $derived(page.params.work!);
  const author = $derived(page.params.author!);

  let dl = $state<DownloadState | null>(null);
  let downloading = $state(false);
  let dlProgress = $state(0);
  let wantSearch = $state(false);
  let evictable = $state(false); // downloaded, but the browser may clear it

  // Resolve offline-download state once per work (getWork is cached).
  $effect(() => {
    dl = null;
    if (!offlineSupported()) return;
    let cancelled = false;
    getWork(slug, author).then(async ({ manifest }) => {
      const state = await workDownloadState(manifest);
      if (cancelled) return;
      dl = state;
      wantSearch = state.search;
      evictable = state.text && !(await isPersisted());
    });
    return () => {
      cancelled = true;
    };
  });

  async function toggleDownload(manifest: Manifest) {
    if (dl?.text) {
      await removeWorkDownload(manifest);
      dl = { text: false, search: false };
      evictable = false;
      return;
    }
    downloading = true;
    dlProgress = 0;
    // Ask to keep the download: without this the browser may evict it, which
    // defeats the point of downloading for a journey.
    const persisted = await requestPersistence();
    try {
      await downloadWork(manifest, {
        search: wantSearch,
        onProgress: (done, total) => (dlProgress = Math.round((done / total) * 100)),
      });
      dl = { text: true, search: wantSearch };
      evictable = !persisted;
    } catch {
      dl = await workDownloadState(manifest);
    } finally {
      downloading = false;
    }
  }
  const hls = $derived(highlightsFor(slug));
  const bms = $derived(bookmarksFor(slug));

  function doExport(manifest: Manifest, kind: "json" | "md") {
    if (kind === "json") download(`${slug}-annotations.json`, exportJson(manifest), "application/json");
    else download(`${slug}-annotations.md`, exportMarkdown(manifest), "text/markdown");
  }

  function chunkTitle(manifest: Manifest, ref: string): string {
    return manifest.toc.find((t) => t.ref === ref)?.title ?? ref;
  }
</script>

<main>
  {#await getWork(slug, author)}
    <p class="ui muted">Loading…</p>
  {:then { manifest }}
    {@const pos = getPosition(slug)}
    {@const read = getReadRefs(slug)}
    <nav class="crumbs ui"><a href={`${base}/`}>← Bookshelf</a></nav>
    <header>
      <h1>{manifest.title}</h1>
      <p class="byline ui">
        {manifest.authorName}{manifest.translator ? ` · translated by ${manifest.translator}` : ""}
      </p>
      <p class="resume ui">
        {#if pos}
          <a class="button" href={`${base}/${author}/${slug}/${pos.ref}`}>
            Continue — {progressLabel(manifest, slug)}
          </a>
        {:else}
          <a class="button" href={`${base}/${author}/${slug}/${manifest.toc[0]!.ref}`}>Start reading</a>
        {/if}
        {#if offlineSupported()}
          <button class="offline" onclick={() => toggleDownload(manifest)} disabled={downloading || dl === null}>
            {#if downloading}
              Downloading… {dlProgress}%
            {:else if dl?.text}
              Available offline ✓
            {:else if manifest.bytes}
              Download for offline ({formatBytes(manifest.bytes.chunks + (wantSearch ? manifest.bytes.search : 0))})
            {:else}
              Download for offline
            {/if}
          </button>
        {/if}
      </p>
      {#if offlineSupported() && dl !== null}
        <p class="offlinenote ui">
          {#if !dl.text && manifest.search?.length && manifest.bytes}
            <label>
              <input type="checkbox" bind:checked={wantSearch} />
              Include search index (+{formatBytes(manifest.bytes.search)}) — only needed to
              search this work while offline
            </label>
          {:else if dl.text && !dl.search && manifest.search?.length}
            Text only; searching this work needs a connection.
          {/if}
          {#if evictable}
            <span class="warn">Your browser may clear downloads if you don’t visit for a while.</span>
          {/if}
        </p>
      {/if}
    </header>
    {#if manifest.search}
      <SearchPanel {manifest} {author} />
    {/if}
    {#if bms.length || hls.length}
      <section class="annots">
        <div class="annhead">
          <h2 class="ui">Your annotations</h2>
          <span class="grow"></span>
          <button class="exp ui" onclick={() => doExport(manifest, "md")}>Export Markdown</button>
          <button class="exp ui" onclick={() => doExport(manifest, "json")}>Export JSON</button>
        </div>
        {#if bms.length}
          <ul class="bml">
            {#each bms as b (b.id)}
              <li>
                <a href={`${base}/${author}/${slug}/${b.ref}`}>
                  <span class="bmi"><BookmarkIcon filled size="0.85rem" /></span>
                  <span class="bmlabel">{b.label}</span>
                </a>
                <button class="del ui" aria-label="Remove bookmark" onclick={() => removeBookmark(slug, b.id)}>×</button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if hls.length}
          <ul class="hll">
            {#each hls as h (h.id)}
              <li>
                <a href={`${base}/${author}/${slug}/${h.ref}`}>
                  <span class={`swatch sw-${h.color}`} class:orphan={h.orphaned}></span>
                  <span class="hlq">“{h.quote.exact.length > 90 ? h.quote.exact.slice(0, 90) + "…" : h.quote.exact}”</span>
                  <span class="hlwhere ui">{chunkTitle(manifest, h.ref)}{h.orphaned ? " · unanchored" : ""}</span>
                </a>
                {#if h.note}<p class="hlnote">{h.note}</p>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
    <ol class="toc">
      {#each manifest.toc as t}
        <li class:read={read.has(t.ref)} class:current={pos?.ref === t.ref}>
          <a href={`${base}/${author}/${slug}/${t.ref}`}>
            <span>{t.title}</span>
            <span class="words ui">{Math.round(t.words / 100) / 10}k words</span>
          </a>
        </li>
      {/each}
    </ol>
  {:catch e}
    <p class="ui muted">Not found: {e.message}</p>
  {/await}
</main>

<style>
  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  .crumbs {
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }
  .crumbs a {
    text-decoration: none;
  }
  h1 {
    margin: 0 0 0.2rem;
    font-weight: 600;
  }
  .byline {
    color: var(--muted);
    margin: 0 0 1.2rem;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--muted);
  }
  /* Inline-blocks on a wrapped line sit tight against each other, so these
     two buttons touched once the row wrapped on a narrow screen. */
  .resume {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .button {
    display: inline-block;
    background: var(--accent);
    color: var(--bg);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .offline {
    border: 1px solid var(--rule);
    background: var(--raised);
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .offline:disabled {
    opacity: 0.7;
    cursor: default;
  }
  /* The native control is painted by the OS, which drew it as a solid dark
     square. Draw it ourselves so it is an empty box in every theme, and
     fills with the accent only once it is actually ticked. */
  .offlinenote input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 0.95rem;
    height: 0.95rem;
    margin: 0 0.35rem 0 0;
    vertical-align: -0.15rem;
    border: 1px solid var(--muted);
    border-radius: 3px;
    background: var(--bg);
    display: inline-grid;
    place-content: center;
    cursor: pointer;
  }
  .offlinenote input[type="checkbox"]::before {
    content: "";
    width: 0.55rem;
    height: 0.55rem;
    transform: scale(0);
    background: var(--bg);
    clip-path: polygon(14% 46%, 0 60%, 40% 100%, 100% 20%, 86% 8%, 38% 72%);
  }
  .offlinenote input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .offlinenote input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .offlinenote {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
    line-height: 1.5;
  }
  .offlinenote label {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    cursor: pointer;
  }
  .offlinenote .warn {
    display: block;
    margin-top: 0.2rem;
    color: var(--accent);
  }
  .toc {
    list-style: none;
    margin: 2rem 0 0;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .toc a {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    padding: 0.55rem 0.25rem;
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid var(--rule);
  }
  .toc a:hover {
    background: var(--raised);
  }
  .toc .read a {
    color: var(--muted);
  }
  .toc .read a::before {
    content: "✓ ";
    color: var(--accent);
  }
  .toc .current a {
    color: var(--accent);
    font-weight: 600;
  }
  .words {
    color: var(--muted);
    font-size: 0.75rem;
    flex: none;
  }
  .annots {
    margin-top: 2rem;
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1rem 1.1rem;
    background: var(--raised);
  }
  .annhead {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .annhead h2 {
    font-size: 0.9rem;
    margin: 0;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .grow {
    flex: 1;
  }
  .exp {
    border: 1px solid var(--rule);
    background: var(--bg);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .bml,
  .hll {
    list-style: none;
    margin: 0.8rem 0 0;
    padding: 0;
  }
  .bml li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .bmi {
    display: inline-flex;
    color: var(--accent);
  }
  .bmlabel {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bml a {
    text-decoration: none;
    color: inherit;
    font-size: 0.9rem;
    padding: 0.25rem 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    overflow: hidden;
  }
  .del {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .hll li {
    margin: 0.55rem 0;
  }
  .hll a {
    text-decoration: none;
    color: inherit;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 3px;
    flex: none;
    align-self: center;
  }
  .swatch.orphan {
    opacity: 0.4;
  }
  .sw-amber {
    background: #e8b229;
  }
  .sw-green {
    background: #5cb85c;
  }
  .sw-blue {
    background: #4f9dd0;
  }
  .sw-rose {
    background: #d06079;
  }
  .hlq {
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hlwhere {
    color: var(--muted);
    font-size: 0.72rem;
    flex: none;
  }
  .hlnote {
    margin: 0.15rem 0 0 1.2rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
