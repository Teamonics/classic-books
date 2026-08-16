<script lang="ts">
  import { base } from "$app/paths";
  import { getCatalog, getPassages, shelfByEra, type Passage, type ShelfAuthorGroup } from "$lib/catalog";
  import { getPosition } from "$lib/progress.svelte";
  import type { CatalogEntry } from "$lib/types";

  const eraColors: Record<string, string> = {
    "archaic-greece": "#7d5ba6",
    "classical-greece": "#3a6ea5",
    "imperial-rome": "#a63d40",
    "late-antiquity": "#7a5c3e",
    medieval: "#8a4b24",
    renaissance: "#b0803c",
    "early-modern": "#4a7c59",
    "eighteenth-century": "#3d7068",
    "nineteenth-century": "#54577c",
  };

  function yearLabel(y: number): string {
    return y < 0 ? `${-y} BC` : `${y}`;
  }

  function spanLabel(works: CatalogEntry[]): string {
    const years = works.map((w) => w.composedYear);
    const lo = Math.min(...years);
    const hi = Math.max(...years);
    return lo === hi ? yearLabel(lo) : `${yearLabel(lo)}–${yearLabel(hi)}`;
  }

  function resumed(works: CatalogEntry[]): CatalogEntry | null {
    return works.find((w) => getPosition(w.slug)) ?? null;
  }

  let expanded = $state<Record<string, boolean>>({});

  // Three passages, drawn fresh each visit, so the front page shows a
  // different corner of the shelf rather than always the oldest three.
  async function sample(n: number): Promise<Passage[]> {
    const all = [...(await getPassages())];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i]!, all[j]!] = [all[j]!, all[i]!];
    }
    return all.slice(0, n);
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
    {#if catalog.passages}
      <section class="passages">
        <h2 class="ui sectionhead">Popular passages</h2>
        {#await sample(3) then picks}
          <ul class="passagelist">
            {#each picks as p}
              <li>
                <a href={`${base}/${p.author}/${p.work}/${p.ref}`}>
                  <blockquote class:verse={p.kind === "verse"}>{p.excerpt}</blockquote>
                  <span class="pcite ui">{p.title} · {p.authorName}, {p.workTitle}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/await}
        <p class="morelink ui">
          <a href={`${base}/passages`}>All {catalog.passages} passages →</a>
        </p>
      </section>
    {/if}

    {#each shelfByEra(catalog) as { era, groups }}
      <section class="era">
        <h2 class="ui sectionhead">{era.label}</h2>
        <ol class="shelf">
          {#each groups as g}
            {@const single = g.works.length === 1}
            {@const open = expanded[g.author]}
            <li class:wide={!single}>
              {#if single}
                {@const w = g.works[0]!}
                <a class="book" href={`${base}/${w.author}/${w.slug}`} style:--era={eraColors[era.id] ?? "var(--accent)"}>
                  <span class="band" aria-hidden="true"></span>
                  <span class="meta">
                    <span class="title">{w.title}</span>
                    <span class="author ui">{w.authorName}</span>
                    <span class="detail ui">
                      {yearLabel(w.composedYear)}{w.translator ? ` · tr. ${w.translator}` : ""}
                    </span>
                    {#if getPosition(w.slug)}<span class="continue ui">Continue reading →</span>{/if}
                  </span>
                </a>
              {:else}
                <div class="book group" style:--era={eraColors[era.id] ?? "var(--accent)"}>
                  <span class="band" aria-hidden="true"></span>
                  <div class="meta">
                    <span class="title">{g.authorName}</span>
                    <span class="detail ui">{g.works.length} works · {spanLabel(g.works)}</span>
                    {#if resumed(g.works)}
                      {@const r = resumed(g.works)!}
                      <a class="continue ui" href={`${base}/${r.author}/${r.slug}`}>Continue {r.title} →</a>
                    {/if}
                    <button
                      class="expand ui"
                      aria-expanded={open ? "true" : "false"}
                      onclick={() => (expanded = { ...expanded, [g.author]: !open })}
                    >
                      {open ? "Hide" : "Show all"}
                    </button>
                    {#if open}
                      <ul class="sublist">
                        {#each g.works as w}
                          <li>
                            <a href={`${base}/${w.author}/${w.slug}`}>
                              {w.title}
                              <span class="subyear ui">{yearLabel(w.composedYear)}</span>
                            </a>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    {/each}
    {#if catalog.paths?.length}
      <section class="paths">
        <h2 class="ui sectionhead">Reading paths</h2>
        <ul class="pathlist">
          {#each catalog.paths as p}
            <li>
              <a href={`${base}/paths/${p.slug}`}>
                <span class="ptitle">{p.title}</span>
                <span class="pblurb">{p.blurb}</span>
                <span class="pmeta ui">{p.steps.length} readings · {p.works} works</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:catch e}
    <p class="ui center">Could not load the catalog: {e.message}</p>
  {/await}

  <footer class="ui">
    <a href={`${base}/about`}>About &amp; sources</a>
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
  .sectionhead {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
    font-weight: 600;
    margin: 2.2rem 0 0.9rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--rule);
  }
  .passagelist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
    gap: 0.9rem;
  }
  .passagelist a {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    height: 100%;
    text-decoration: none;
    color: inherit;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1rem 1.1rem;
  }
  .passagelist a:hover {
    border-color: var(--accent);
  }
  .passagelist blockquote {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  /* Verse keeps the line breaks it was built with. */
  .passagelist blockquote.verse {
    white-space: pre-line;
  }
  .pcite {
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: auto;
  }
  .morelink {
    font-size: 0.82rem;
    margin: 0.9rem 0 0;
  }
  .morelink a {
    text-decoration: none;
  }
  .pathlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.9rem;
  }
  .pathlist a {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-decoration: none;
    color: inherit;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1rem;
    height: 100%;
  }
  .pathlist a:hover {
    border-color: var(--accent);
  }
  .ptitle {
    font-weight: 600;
    font-size: 1.02rem;
  }
  .pblurb {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .pmeta {
    font-size: 0.72rem;
    color: var(--accent);
    margin-top: 0.2rem;
  }
  .shelf {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
    align-items: start;
  }
  .shelf li.wide {
    grid-column: span 1;
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
    height: 100%;
    transition: transform 100ms ease, box-shadow 100ms ease;
  }
  a.book:hover {
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
    min-width: 0;
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
  .expand {
    align-self: flex-start;
    margin-top: 0.5rem;
    border: 1px solid var(--rule);
    background: var(--bg);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .sublist {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }
  .sublist a {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    text-decoration: none;
    color: inherit;
    font-size: 0.85rem;
    padding: 0.22rem 0;
    border-bottom: 1px solid var(--rule);
  }
  .sublist a:hover {
    color: var(--accent);
  }
  .subyear {
    color: var(--muted);
    font-size: 0.7rem;
    flex: none;
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
