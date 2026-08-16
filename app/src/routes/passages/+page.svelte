<script lang="ts">
  import { base } from "$app/paths";
  import { getCatalog, getPassages, type Era, type Passage } from "$lib/catalog";

  // Grouped by era, in chronological order — the same arrangement as the
  // shelf. Passages are never grouped by theme or idea.
  async function grouped(): Promise<{ era: Era; items: Passage[] }[]> {
    const [catalog, passages] = await Promise.all([getCatalog(), getPassages()]);
    const eraOf = new Map(catalog.works.map((w) => [w.slug, w.era]));
    return catalog.eras
      .map((era) => ({ era, items: passages.filter((p) => eraOf.get(p.work) === era.id) }))
      .filter((g) => g.items.length);
  }
</script>

<svelte:head>
  <title>Popular passages · Classic Books</title>
</svelte:head>

<main>
  <p class="crumb ui"><a href={`${base}/`}>← Bookshelf</a></p>
  <header class="masthead">
    <h1>Popular passages</h1>
    <p class="tag ui">
      The lines these books are known by. Every excerpt is taken from the translation
      served here, and opens the book at that exact place.
    </p>
  </header>

  {#await grouped()}
    <p class="ui center">Loading…</p>
  {:then groups}
    {#each groups as { era, items }}
      <section>
        <h2 class="ui sectionhead">{era.label}</h2>
        <ul class="cards">
          {#each items as p}
            <li>
              <a href={`${base}/${p.author}/${p.work}/${p.ref}`}>
                <h3>{p.title}</h3>
                <blockquote class:verse={p.kind === "verse"}>{p.excerpt}</blockquote>
                <p class="cite ui">
                  {p.authorName}, <cite>{p.workTitle}</cite> · {p.chunkTitle}{p.speaker
                    ? ` · ${p.speaker}`
                    : ""}{p.translator ? ` · tr. ${p.translator}` : ""}
                </p>
                <p class="note ui">{p.note}</p>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:catch}
    <p class="ui center">Could not load the passages.</p>
  {/await}
</main>

<style>
  main {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 5rem;
  }
  .crumb {
    font-size: 0.85rem;
    margin: 0 0 1.5rem;
  }
  .crumb a {
    text-decoration: none;
  }
  .masthead {
    margin-bottom: 2.5rem;
  }
  h1 {
    font-size: 2rem;
    margin: 0 0 0.4rem;
  }
  .tag {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
    max-width: 34rem;
    line-height: 1.5;
  }
  .center {
    text-align: center;
    color: var(--muted);
  }
  .sectionhead {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
    margin: 2.5rem 0 0.9rem;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.9rem;
  }
  .cards a {
    display: block;
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1rem 1.1rem;
    background: var(--raised);
  }
  .cards a:hover {
    border-color: var(--accent);
  }
  h3 {
    font-family: var(--sans);
    font-size: 0.95rem;
    margin: 0 0 0.6rem;
  }
  blockquote {
    margin: 0;
    font-size: 1.02rem;
    line-height: 1.55;
    border-left: 2px solid var(--rule);
    padding-left: 0.9rem;
  }
  /* Verse excerpts arrive with their line breaks intact. */
  blockquote.verse {
    white-space: pre-line;
  }
  .cite {
    font-size: 0.78rem;
    color: var(--muted);
    margin: 0.7rem 0 0;
  }
  .note {
    font-size: 0.82rem;
    color: var(--muted);
    margin: 0.35rem 0 0;
    line-height: 1.5;
  }
</style>
