<script setup lang="ts">
/**
 * Hero scroll section — in-flow spacer + morph pose target only.
 * Visuals (swarm + copy) live inside FlowSurfaceHost → one clip, no stick.
 */
const section = ref<HTMLElement | null>(null)
const surfaceSlot = ref<HTMLElement | null>(null)

defineExpose({ section, surfaceSlot })
</script>

<template>
  <section
    ref="section"
    class="hero pointer-events-none relative z-10 w-full overflow-visible"
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
    />
  </section>
</template>
