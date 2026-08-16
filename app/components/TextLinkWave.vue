<script setup lang="ts">
/**
 * Wavy underline for in-text / contextual links.
 * Bind `onNavWaveEnter` / `onNavWaveLeave` on the parent link
 * (`~/utils/navWaveHover`) — the SVG must live inside the hover target.
 */
const uid = useId()
const clipId = `text-link-wave-${uid}`
</script>

<template>
  <svg
    class="text-link-wave"
    viewBox="0 0 64 8"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <clipPath :id="clipId" clipPathUnits="userSpaceOnUse">
        <rect
          class="text-link-wave__reveal"
          x="0"
          y="0"
          width="0"
          height="8"
        />
      </clipPath>
    </defs>
    <path
      class="text-link-wave__path"
      :clip-path="`url(#${clipId})`"
      d="M1 4 Q 12 0.8 23 4 Q 34 7.2 45 4 Q 54 1.8 63 4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.35"
      stroke-linecap="butt"
    />
  </svg>
</template>

<style scoped>
.text-link-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 0.48em;
  overflow: hidden;
  pointer-events: none;
  color: inherit;
}

.text-link-wave__path {
  fill: none;
}
</style>
