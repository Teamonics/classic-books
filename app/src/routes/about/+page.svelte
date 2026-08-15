<script lang="ts">
  interface SourceEntry {
    slug: string;
    title: string;
    translator: string | null;
    source: string;
    repo?: string;
    commit?: string;
    pgId?: number;
    url?: string;
    retrieved: string;
    translatorDied?: number;
    translationPublished?: number;
    licenseBasis: string;
  }

  async function getSources(): Promise<SourceEntry[]> {
    const res = await fetch("/data/sources.json");
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function sourceLabel(s: SourceEntry): { text: string; href: string | null } {
    if (s.source === "standard-ebooks" && s.repo) {
      return { text: `Standard Ebooks @ ${s.commit?.slice(0, 7)}`, href: s.repo };
    }
    if (s.source === "project-gutenberg" && s.pgId) {
      return { text: `Project Gutenberg #${s.pgId}`, href: `https://www.gutenberg.org/ebooks/${s.pgId}` };
    }
    return { text: s.source, href: s.url ?? null };
  }
</script>

<svelte:head>
  <title>About · Classic Books</title>
</svelte:head>

<main>
  <nav class="crumbs ui"><a href="/">← Bookshelf</a></nav>
  <h1>About</h1>
  <p>
    A free reader for the classics of Western literature, history, and philosophy, in
    public-domain translations. The texts are yours: no account, no tracking, and every
    book works offline. Reading position, highlights, and notes are stored only on your
    device and can be exported at any time.
  </p>

  <h2>Sources &amp; provenance</h2>
  <p class="colophon-note ui">
    Every text is built from a snapshotted public-domain source. Translation copyright
    is verified per title against both US public domain and life-plus-70 terms.
  </p>
  {#await getSources()}
    <p class="ui muted">Loading…</p>
  {:then sources}
    <dl class="colophon">
      {#each sources as s}
        {@const src = sourceLabel(s)}
        <dt>{s.title}</dt>
        <dd>
          {#if s.translator}Translated by {s.translator}{#if s.translationPublished}&nbsp;({s.translationPublished}){/if}.{/if}
          Source:
          {#if src.href}<a href={src.href} rel="external noopener">{src.text}</a>{:else}{src.text}{/if},
          retrieved {s.retrieved}.
          <span class="license">{s.licenseBasis}.</span>
        </dd>
      {/each}
    </dl>
  {:catch}
    <p class="ui muted">Could not load source records.</p>
  {/await}

  <h2>The texts</h2>
  <p>
    Corrections welcome: every book links back to its source edition above, so errors can
    be traced to the transcription or to our processing. The complete processing pipeline
    is deterministic — the same sources always produce the same books.
  </p>
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
  h1,
  h2 {
    font-weight: 600;
  }
  h2 {
    margin-top: 2.2rem;
  }
  .muted {
    color: var(--muted);
  }
  .colophon-note {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .colophon dt {
    font-weight: 600;
    margin-top: 1rem;
  }
  .colophon dd {
    margin: 0.15rem 0 0;
    font-size: 0.92rem;
    line-height: 1.55;
  }
  .license {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
