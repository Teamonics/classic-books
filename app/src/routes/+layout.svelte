<script lang="ts">
  import "../app.css";
  import "@fontsource/atkinson-hyperlegible/400.css";
  import "@fontsource/atkinson-hyperlegible/700.css";
  import { onMount } from "svelte";
  import { applySettings } from "$lib/settings.svelte";

  let { children } = $props();

  onMount(() => {
    applySettings();
  });
</script>

<svelte:head>
  <title>Classic Books</title>
</svelte:head>

{@render children()}
