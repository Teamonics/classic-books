<script lang="ts">
  import { settings, applySettings, LIMITS, type ThemeId, type FontId } from "$lib/settings.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const themes: { id: ThemeId; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "sepia", label: "Sepia" },
    { id: "dark", label: "Dark" },
    { id: "contrast", label: "High contrast" },
  ];
  const fonts: { id: FontId; label: string }[] = [
    { id: "serif", label: "Serif" },
    { id: "sans", label: "Sans" },
    { id: "dyslexic", label: "Hyperlegible" },
  ];

  function set<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    settings[key] = value;
    applySettings();
  }
</script>

{#if open}
  <div class="panel ui" role="dialog" aria-label="Reading settings">
    <div class="row" role="group" aria-label="Theme">
      {#each themes as t}
        <button
          class="chip"
          class:active={settings.theme === t.id}
          onclick={() => set("theme", t.id)}>{t.label}</button
        >
      {/each}
    </div>
    <div class="row" role="group" aria-label="Typeface">
      {#each fonts as f}
        <button
          class="chip"
          class:active={settings.font === f.id}
          onclick={() => set("font", f.id)}>{f.label}</button
        >
      {/each}
    </div>
    <div class="row" role="group" aria-label="Margin numbers">
      <span class="rowlabel">Numbers</span>
      <button
        class="chip"
        class:active={settings.numbers}
        aria-pressed={settings.numbers}
        onclick={() => set("numbers", true)}>Shown</button
      >
      <button
        class="chip"
        class:active={!settings.numbers}
        aria-pressed={!settings.numbers}
        onclick={() => set("numbers", false)}>Hidden</button
      >
    </div>
    <label class="slider">
      <span>Text size</span>
      <input
        type="range"
        min={LIMITS.fontSize.min}
        max={LIMITS.fontSize.max}
        step={LIMITS.fontSize.step}
        value={settings.fontSize}
        oninput={(e) => set("fontSize", Number(e.currentTarget.value))}
      />
    </label>
    <label class="slider">
      <span>Line width</span>
      <input
        type="range"
        min={LIMITS.measure.min}
        max={LIMITS.measure.max}
        step={LIMITS.measure.step}
        value={settings.measure}
        oninput={(e) => set("measure", Number(e.currentTarget.value))}
      />
    </label>
    <label class="slider">
      <span>Line height</span>
      <input
        type="range"
        min={LIMITS.lineHeight.min}
        max={LIMITS.lineHeight.max}
        step={LIMITS.lineHeight.step}
        value={settings.lineHeight}
        oninput={(e) => set("lineHeight", Number(e.currentTarget.value))}
      />
    </label>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    top: 3.2rem;
    right: 0.75rem;
    z-index: 50;
    background: var(--raised);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: min(20rem, calc(100vw - 1.5rem));
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
    font-size: 0.85rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .rowlabel {
    width: 6rem;
    color: var(--muted);
  }
  .chip {
    border: 1px solid var(--rule);
    background: var(--bg);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }
  .chip.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .slider {
    display: grid;
    grid-template-columns: 6rem 1fr;
    align-items: center;
    gap: 0.5rem;
  }
  input[type="range"] {
    accent-color: var(--accent);
    width: 100%;
  }
</style>
