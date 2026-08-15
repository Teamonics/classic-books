<script lang="ts">
  import {
    highlightsFor,
    updateHighlight,
    removeHighlight,
    type HlColor,
  } from "$lib/annotations.svelte";
  import { citationText, copyText } from "$lib/cite";
  import type { Manifest } from "$lib/types";

  let {
    work,
    id,
    manifest,
    onclose,
  }: {
    work: string;
    id: string;
    manifest: Manifest | null;
    onclose: () => void;
  } = $props();

  const hl = $derived(highlightsFor(work).find((h) => h.id === id));
  const COLORS: HlColor[] = ["amber", "green", "blue", "rose"];
  let copied = $state(false);

  async function cite() {
    if (!hl || !manifest) return;
    const t = manifest.toc.find((x) => x.ref === hl.ref);
    copied = await copyText(
      citationText(manifest, { fineRef: hl.ref, locator: t?.title ?? hl.ref }, hl.quote.exact),
    );
    setTimeout(() => (copied = false), 1200);
  }
</script>

{#if hl}
  <div class="sheet ui" role="dialog" aria-label="Highlight">
    <button class="close" aria-label="Close" onclick={onclose}>×</button>
    <blockquote class="q">“{hl.quote.exact.length > 220 ? hl.quote.exact.slice(0, 220) + "…" : hl.quote.exact}”</blockquote>
    {#if hl.orphaned}
      <p class="orphan">⚠ This highlight could not be re-anchored to the current text.</p>
    {/if}
    <div class="row">
      {#each COLORS as c}
        <button
          class={`dot dot-${c}`}
          class:active={hl.color === c}
          aria-label={`Set color ${c}`}
          onclick={() => updateHighlight(work, id, { color: c })}
        ></button>
      {/each}
      <span class="grow"></span>
      <button class="act" onclick={cite}>{copied ? "Copied ✓" : "Cite"}</button>
      <button
        class="act danger"
        onclick={() => {
          removeHighlight(work, id);
          onclose();
        }}>Delete</button
      >
    </div>
    <textarea
      placeholder="Add a note…"
      value={hl.note ?? ""}
      oninput={(e) => updateHighlight(work, id, { note: e.currentTarget.value })}
    ></textarea>
  </div>
{/if}

<style>
  .sheet {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: min(38rem, 100vw - 1rem);
    background: var(--raised);
    border: 1px solid var(--rule);
    border-bottom: none;
    border-radius: 12px 12px 0 0;
    padding: 1rem 1.2rem 1.2rem;
    z-index: 60;
    box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
  }
  .close {
    position: absolute;
    top: 0.4rem;
    right: 0.6rem;
    border: none;
    background: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--muted);
  }
  .q {
    margin: 0 0 0.7rem;
    font-style: italic;
    color: var(--muted);
    border-left: 3px solid var(--rule);
    padding-left: 0.8rem;
  }
  .orphan {
    color: var(--accent);
    font-size: 0.8rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.7rem;
  }
  .grow {
    flex: 1;
  }
  .dot {
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .dot.active {
    border-color: var(--fg);
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
  .act {
    border: 1px solid var(--rule);
    background: var(--bg);
    border-radius: 6px;
    padding: 0.25rem 0.7rem;
    cursor: pointer;
    font-weight: 600;
  }
  .act.danger {
    color: #c0392b;
  }
  textarea {
    width: 100%;
    min-height: 4.5rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 0.6rem;
    font: inherit;
    resize: vertical;
  }
</style>
