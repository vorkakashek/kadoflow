<script setup lang="ts">
import { preloadHomeMotionBundles } from '~/utils/preloadHomeMotion'

onMounted(() => {
  if (!import.meta.client) return
  const warm = () => {
    void preloadHomeMotionBundles()
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 1800 })
  } else {
    window.setTimeout(warm, 600)
  }
})
</script>

<template>
  <div>
    <BrandPreloader />
    <div class="pc-live-stack">
      <div class="page-shell">
        <div class="page-shell__paint">
          <NuxtPage />
        </div>
      </div>
      <SiteHeader />
    </div>
    <ClientOnly>
      <PageCanvas />
      <CustomScrollbar />
      <FpsMeter />
    </ClientOnly>
  </div>
</template>

<style>
html.preload-lock,
html.preload-lock body,
html.page-canvas-lock {
  overflow: hidden;
  overscroll-behavior: none;
}

/* Body is position:fixed via JS while menu is open — avoid double scroll. */
html.page-canvas-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}

/* First paint for warm revisit — full black macron, not empty gray track. */
html[data-preload-warm] .brand-preload__arc:not(.brand-preload__arc--track) {
  stroke-dashoffset: 0 !important;
}

.pc-live-stack {
  position: relative;
  z-index: 1;
}

.page-shell {
  position: relative;
  z-index: 1;
  min-height: 100svh;
  min-height: 100dvh;
}

/* Menu covers the site — keep the live page visible while the iris clip grows. */
html.page-canvas-surface:not(.page-canvas-iris) .page-shell {
  visibility: hidden;
  pointer-events: none;
}

.page-shell__paint {
  min-height: 100svh;
  min-height: 100dvh;
}
</style>
