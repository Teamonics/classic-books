<script lang="ts">
  import BlockView from "./BlockView.svelte";
  import Inline from "./Inline.svelte";
  import type { Block } from "$lib/types";
  import { blockText, childWindows, sliceRanges, type HlRange } from "$lib/blocktext";

  let {
    block,
    index,
    hls,
    onnote,
  }: {
    block: Block;
    index?: number;
    hls?: HlRange[];
    onnote?: (ref: string) => void;
  } = $props();

  const lineWindows = $derived(
    block.type === "verse" ? childWindows(block.lines.map((l) => l.text)) : [],
  );
  const nestedWindows = $derived(
    block.type === "speech" || block.type === "quote"
      ? childWindows(block.blocks.map(blockText))
      : [],
  );
</script>

{#if block.type === "para"}
  <p
    class="para"
    class:argument={block.role === "argument" || block.role === "summary"}
    data-block={index}
    data-para={block.n}
  >
    {#if block.n !== undefined}<span class="pn ui" aria-hidden="true">{block.n}</span>{/if}
    <Inline text={block.text} marks={block.marks} {hls} {onnote} />
  </p>
{:else if block.type === "verse"}
  <div class="verse" data-block={index}>
    {#each block.lines as line, li}
      <p class="line" class:i1={line.indent === 1} class:i2={line.indent === 2} data-line={line.n}>
        {#if line.n !== undefined && line.n % 5 === 0}
          <span class="ln ui" aria-hidden="true">{line.n}</span>
        {/if}
        <Inline
          text={line.text}
          marks={line.marks}
          hls={sliceRanges(hls, lineWindows[li]!.start, lineWindows[li]!.len)}
          {onnote}
        />
      </p>
    {/each}
  </div>
{:else if block.type === "speech"}
  <div class="speech" data-block={index}>
    <p class="speaker ui">{block.speaker}</p>
    {#each block.blocks as b, bi}
      <BlockView
        block={b}
        hls={sliceRanges(hls, nestedWindows[bi]!.start, nestedWindows[bi]!.len)}
        {onnote}
      />
    {/each}
  </div>
{:else if block.type === "stage"}
  <p class="stage" data-block={index}>
    <Inline text={block.text} marks={block.marks} {hls} {onnote} />
  </p>
{:else if block.type === "heading"}
  <h3 class="heading" data-block={index}>
    <Inline text={block.text} marks={block.marks} {hls} {onnote} />
  </h3>
{:else if block.type === "quote"}
  <blockquote class="quote" data-block={index}>
    {#each block.blocks as b, bi}
      <BlockView
        block={b}
        hls={sliceRanges(hls, nestedWindows[bi]!.start, nestedWindows[bi]!.len)}
        {onnote}
      />
    {/each}
  </blockquote>
{/if}

<style>
  .para {
    margin: 0 0 1em;
    position: relative;
    text-align: justify;
    hyphens: auto;
  }
  .argument {
    font-style: italic;
    color: var(--muted);
    text-align: left;
    hyphens: none;
  }
  .pn {
    position: absolute;
    left: -3rem;
    width: 2.4rem;
    text-align: right;
    font-size: 0.7rem;
    color: var(--muted);
    user-select: none;
    line-height: inherit;
    padding-top: 0.25em;
  }
  .verse {
    margin: 0 0 1.2em;
  }
  .line {
    margin: 0;
    position: relative;
    padding-left: 2.5em;
    text-indent: -2.5em; /* hanging indent on wrapped lines */
  }
  .line.i1 {
    margin-left: 1.5em;
  }
  .line.i2 {
    margin-left: 3em;
  }
  .ln {
    position: absolute;
    left: -3.4rem;
    width: 2.4rem;
    text-align: right;
    text-indent: 0;
    font-size: 0.7rem;
    color: var(--muted);
    user-select: none;
    padding-top: 0.3em;
  }
  .speech {
    margin: 0 0 1.2em;
  }
  .speaker {
    margin: 0 0 0.15em;
    font-variant-caps: all-small-caps;
    letter-spacing: 0.08em;
    font-weight: 600;
    color: var(--muted);
  }
  .stage {
    margin: 0.4em 0 0.8em;
    font-style: italic;
    color: var(--muted);
    padding-left: 1.5em;
  }
  .heading {
    font-family: var(--reading-font);
    font-weight: 600;
    margin: 1.6em 0 0.8em;
  }
  .quote {
    margin: 1em 0 1em 1.5em;
    padding-left: 1em;
    border-left: 2px solid var(--rule);
  }

  /* Narrow screens: pull the margin numbers in close, and soften the hanging
     indent so a wrapped verse line does not look like a new stanza. */
  @media (max-width: 40rem) {
    .ln,
    .pn {
      /* Ranged right so the digits sit a consistent hair from the text
         whatever their length, clear of the screen edge but out of the
         reading column. */
      left: -1.35rem;
      width: 1.05rem;
      font-size: 0.6rem;
      text-align: right;
    }
    .line {
      padding-left: 1.1em;
      text-indent: -1.1em;
    }
    .line.i1 {
      margin-left: 0.7em;
    }
    .line.i2 {
      margin-left: 1.4em;
    }
    .stage {
      padding-left: 0.8em;
    }
    .quote {
      margin-left: 0.6em;
      padding-left: 0.7em;
    }
  }
</style>
