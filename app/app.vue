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
      <PageIris />
      <SiteCursor />
      <CustomScrollbar />
      <FpsMeter />
    </ClientOnly>
  </div>
</template>

<style>
/* Scroll lock while menu is open — page keeps running underneath the overlay. */
html.page-canvas-lock,
html.page-iris-lock {
  overflow: hidden;
  overscroll-behavior: none;
}

html.page-canvas-lock body,
html.page-iris-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}

/* Lid over the swarm snaps off while the page iris still covers. */
html.page-iris-lock .hero-swarm-cover {
  transition: none !important;
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

/* Overlay is opaque — keep the live page compositing underneath so close
   iris has a real frame (visibility:hidden drops the WebGL buffer on Android). */
html.page-canvas-surface .page-shell {
  pointer-events: none;
}

.page-shell__paint {
  min-height: 100svh;
  min-height: 100dvh;
}
</style>
