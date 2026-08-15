<script lang="ts">
  import { getCatalog } from "$lib/data";
  import { getPosition } from "$lib/progress.svelte";
  import type { CatalogEntry } from "$lib/types";

  const eraColors: Record<string, string> = {
    "archaic-greece": "#7d5ba6",
    "classical-greece": "#3a6ea5",
    medieval: "#8a4b24",
  };

  function yearLabel(y: number): string {
    return y < 0 ? `${-y} BC` : `${y}`;
  }

  function href(w: CatalogEntry): string {
    return `/${w.author}/${w.slug}`;
  }

  function continueHref(w: CatalogEntry): string | null {
    const pos = getPosition(w.slug);
    return pos ? `/${w.author}/${w.slug}/${pos.ref}` : null;
  }
</script>

<main>
  <header class="masthead">
    <h1>Classic Books</h1>
    <p class="tag ui">The classics, beautifully readable. Free, offline, no account.</p>
  </header>

  {#await getCatalog()}
    <p class="ui center">Loading the shelf…</p>
  {:then catalog}
    <ol class="shelf">
      {#each catalog as w}
        <li>
          <a class="book" href={href(w)} style:--era={eraColors[w.era] ?? "var(--accent)"}>
            <span class="band" aria-hidden="true"></span>
            <span class="meta">
              <span class="title">{w.title}</span>
              <span class="author ui">{w.authorName}</span>
              <span class="detail ui">
                {yearLabel(w.composedYear)}{w.translator ? ` · tr. ${w.translator}` : ""}
              </span>
              {#if continueHref(w)}
                <span class="continue ui">Continue reading →</span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ol>
  {:catch e}
    <p class="ui center">Could not load the catalog: {e.message}</p>
  {/await}

  <footer class="ui">
    <a href="/about">About &amp; sources</a>
  </footer>
</main>

<style>
  main {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
  }
  .masthead {
    text-align: center;
    margin-bottom: 2.5rem;
  }
  h1 {
    font-weight: 600;
    letter-spacing: 0.01em;
    margin: 0 0 0.3rem;
  }
  .tag {
    color: var(--muted);
    margin: 0;
    font-size: 0.9rem;
  }
  .center {
    text-align: center;
    color: var(--muted);
  }
  .shelf {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
  }
  .book {
    display: flex;
    text-decoration: none;
    color: inherit;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 8px;
    overflow: hidden;
    min-height: 7.5rem;
    transition: transform 100ms ease, box-shadow 100ms ease;
  }
  .book:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
  .band {
    width: 0.55rem;
    flex: none;
    background: var(--era);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.9rem 1rem;
  }
  .title {
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.25;
  }
  .author {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .detail {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .continue {
    margin-top: 0.4rem;
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 600;
  }
  footer {
    margin-top: 3rem;
    text-align: center;
    font-size: 0.8rem;
  }
  footer a {
    color: var(--muted);
  }
</style>
