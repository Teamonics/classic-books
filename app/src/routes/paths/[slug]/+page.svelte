<script lang="ts">
  import { page } from "$app/state";
  import { getCatalog } from "$lib/catalog";
  import { getReadRefs } from "$lib/progress.svelte";

  const slug = $derived(page.params.slug!);

  let pathTitle = $state<string | null>(null);

  async function getPath(s: string) {
    const catalog = await getCatalog();
    const path = catalog.paths.find((p) => p.slug === s);
    if (!path) throw new Error(`unknown path: ${s}`);
    pathTitle = path.title;
    return path;
  }
</script>

<svelte:head>
  <title>{pathTitle ? `${pathTitle} · Classic Books` : "Classic Books"}</title>
</svelte:head>

<main>
  {#await getPath(slug)}
    <p class="ui muted">Loading…</p>
  {:then path}
    <nav class="crumbs ui"><a href="/">← Bookshelf</a></nav>
    <header>
      <h1>{path.title}</h1>
      <p class="blurb">{path.blurb}</p>
      <p class="meta ui">{path.steps.length} readings · {path.works} works · about {Math.round(path.words / 1000)}k words</p>
    </header>
    <ol class="steps">
      {#each path.steps as step, i}
        {@const done = getReadRefs(step.work).has(step.ref)}
        <li class:done>
          <a href={`/${step.author}/${step.work}/${step.ref}`}>
            <span class="num ui" aria-hidden="true">{done ? "✓" : i + 1}</span>
            <span class="body">
              <span class="label">{step.label}</span>
              <span class="src ui">{step.workTitle} · {step.chunkTitle} · {Math.round(step.words / 100) / 10}k words</span>
              <span class="blurb2">{step.blurb}</span>
            </span>
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
    margin: 0 0 0.4rem;
    font-weight: 600;
  }
  .blurb {
    margin: 0 0 0.6rem;
    line-height: 1.55;
  }
  .meta {
    color: var(--muted);
    font-size: 0.78rem;
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .steps {
    list-style: none;
    margin: 2rem 0 0;
    padding: 0;
  }
  .steps a {
    display: flex;
    gap: 0.9rem;
    text-decoration: none;
    color: inherit;
    padding: 0.9rem 0.4rem;
    border-bottom: 1px solid var(--rule);
  }
  .steps a:hover {
    background: var(--raised);
  }
  .num {
    flex: none;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    border: 1px solid var(--rule);
    display: grid;
    place-items: center;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .done .num {
    border-color: var(--accent);
    color: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .label {
    font-weight: 600;
  }
  .src {
    font-size: 0.73rem;
    color: var(--accent);
  }
  .blurb2 {
    font-size: 0.88rem;
    color: var(--muted);
    line-height: 1.45;
  }
</style>
