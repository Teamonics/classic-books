<script lang="ts">
  import { segment, isNotePoint } from "$lib/marks";
  import type { Mark } from "$lib/types";

  let {
    text,
    marks,
    onnote,
  }: {
    text: string;
    marks?: Mark[];
    onnote?: (ref: string) => void;
  } = $props();

  const parts = $derived(segment(text, marks).segments);
</script>

{#each parts as p}
  {#if isNotePoint(p)}
    <button
      class="noteref ui"
      aria-label="Show note"
      onclick={() => onnote?.(p.ref)}>※</button
    >
  {:else if p.em && p.strong}
    <em><strong>{p.text}</strong></em>
  {:else if p.em}
    <em>{p.text}</em>
  {:else if p.strong}
    <strong>{p.text}</strong>
  {:else if p.smallcaps}
    <span class="sc">{p.text}</span>
  {:else}{p.text}{/if}
{/each}

<style>
  .noteref {
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.7em;
    vertical-align: super;
    line-height: 1;
    padding: 0 0.15em;
  }
  .sc {
    font-variant-caps: small-caps;
  }
</style>
