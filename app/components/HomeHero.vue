<script setup lang="ts">
/**
 * Hero scroll section — in-flow spacer + morph pose target only.
 * Visuals (swarm + copy) live inside FlowSurfaceHost → one clip, no stick.
 */
const section = ref<HTMLElement | null>(null)
const surfaceSlot = ref<HTMLElement | null>(null)

defineProps<{
  surfaceReady?: boolean
}>()

defineExpose({ section, surfaceSlot })
</script>

<template>
  <section
    ref="section"
    class="hero pointer-events-none relative z-10 w-full overflow-visible touch-pan-y"
    style="height: var(--app-screen)"
  >
    <div
      ref="surfaceSlot"
      class="pointer-events-none absolute"
      aria-hidden="true"
      style="
        top: var(--layout-surface-top);
        right: var(--layout-margin);
        bottom: var(--layout-margin);
        left: var(--layout-margin);
      "
    >
      <!--
        SSR first frame for the surface. The live FlowSurface is intentionally
        lazy; keeping its tone + grain here prevents a blank panel and makes the
        decorative raster discoverable before client JavaScript. The primer is
        removed only after the live surface has painted underneath it.
      -->
      <div
        v-if="!surfaceReady"
        class="home-hero__surface-primer bg-stone"
        aria-hidden="true"
      >
        <div class="home-hero__surface-primer-grain" />
      </div>
    </div>
  </section>
</template>

<style scoped>
:global(:root) {
  --home-surface-grain: image-set(
    url('/textures/grain-tile-128.avif') type('image/avif'),
    url('/textures/grain-tile-128.webp') type('image/webp')
  );
}

.home-hero__surface-primer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 12px;
}

.home-hero__surface-primer-grain {
  position: absolute;
  inset: 0;
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 72px 72px;
  opacity: 0.22;
  mix-blend-mode: overlay;
}

@media (max-width: 767.98px) {
  .home-hero__surface-primer-grain {
    background-size: 56px 56px;
  }
}
</style>
