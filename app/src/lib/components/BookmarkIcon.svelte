<script lang="ts">
  // A plain ribbon bookmark. Inherits currentColor so it reads correctly in
  // all four themes, unlike the emoji each platform draws its own way.
  let { filled = false, size = "1.05rem" }: { filled?: boolean; size?: string } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  style={`width:${size};height:${size}`}
>
  <path
    d="M6.5 3h11a1 1 0 0 1 1 1v16.6a.5.5 0 0 1-.77.42L12 17.3l-5.73 3.72a.5.5 0 0 1-.77-.42V4a1 1 0 0 1 1-1z"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linejoin="round"
  />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
