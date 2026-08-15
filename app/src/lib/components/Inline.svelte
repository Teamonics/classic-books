<script lang="ts">
  import { segment, isNotePoint } from "$lib/marks";
  import type { Mark } from "$lib/types";
  import type { HlRange } from "$lib/blocktext";

  let {
    text,
    marks,
    hls,
    onnote,
  }: {
    text: string;
    marks?: Mark[];
    hls?: HlRange[];
    onnote?: (ref: string) => void;
  } = $props();

  const parts = $derived(segment(text, marks, hls).segments);
</script>

{#snippet styled(p: { text: string; em?: boolean; strong?: boolean; smallcaps?: boolean })}
  {#if p.em && p.strong}<em><strong>{p.text}</strong></em>
  {:else if p.em}<em>{p.text}</em>
  {:else if p.strong}<strong>{p.text}</strong>
  {:else if p.smallcaps}<span class="sc">{p.text}</span>
  {:else}{p.text}{/if}
{/snippet}

{#each parts as p}
  {#if isNotePoint(p)}
    <button class="noteref ui" aria-label="Show note" onclick={() => onnote?.(p.ref)}>※</button>
  {:else if p.hl}
    <!-- Clicks are handled by delegation in the reader (data-hlid lookup);
         keyboard users manage highlights from the work page's annotation
         list, which is fully focusable. -->
    <mark class={`hl hl-${p.hl.color}`} data-hlid={p.hl.id}>{@render styled(p)}</mark>
  {:else}
    {@render styled(p)}
  {/if}
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
  mark.hl {
    color: inherit;
    cursor: pointer;
    border-radius: 2px;
    padding: 0.06em 0;
  }
  mark.hl-amber {
    background: color-mix(in srgb, #e8b229 34%, var(--bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, #e8b229 34%, var(--bg));
  }
  mark.hl-green {
    background: color-mix(in srgb, #5cb85c 30%, var(--bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, #5cb85c 30%, var(--bg));
  }
  mark.hl-blue {
    background: color-mix(in srgb, #4f9dd0 32%, var(--bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, #4f9dd0 32%, var(--bg));
  }
  mark.hl-rose {
    background: color-mix(in srgb, #d06079 32%, var(--bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, #d06079 32%, var(--bg));
  }
</style>
