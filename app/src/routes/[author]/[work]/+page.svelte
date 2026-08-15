<script lang="ts">
  import { page } from "$app/state";
  import { getWork } from "$lib/data";
  import { getPosition, getReadRefs, progressLabel } from "$lib/progress.svelte";

  const slug = $derived(page.params.work!);
  const author = $derived(page.params.author!);
</script>

<main>
  {#await getWork(slug)}
    <p class="ui muted">Loading…</p>
  {:then { manifest }}
    {@const pos = getPosition(slug)}
    {@const read = getReadRefs(slug)}
    <nav class="crumbs ui"><a href="/">← Bookshelf</a></nav>
    <header>
      <h1>{manifest.title}</h1>
      <p class="byline ui">
        {manifest.authorName}{manifest.translator ? ` · translated by ${manifest.translator}` : ""}
      </p>
      {#if pos}
        <p class="resume ui">
          <a class="button" href={`/${author}/${slug}/${pos.ref}`}>
            Continue — {progressLabel(manifest, slug)}
          </a>
        </p>
      {:else}
        <p class="resume ui">
          <a class="button" href={`/${author}/${slug}/${manifest.toc[0]!.ref}`}>Start reading</a>
        </p>
      {/if}
    </header>
    <ol class="toc">
      {#each manifest.toc as t}
        <li class:read={read.has(t.ref)} class:current={pos?.ref === t.ref}>
          <a href={`/${author}/${slug}/${t.ref}`}>
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
</style>
