<script setup lang="ts">
const enhancementsReady = ref(false)
const route = useRoute()
const { locale, t } = useI18n()
const brandPreloaderEnabled = useBrandPreloaderEnabled()

// Capture only the initial document route. Later SPA navigation is covered by
// the dedicated page/case transitions and must not remount the brand reveal.
brandPreloaderEnabled.value = !/^\/projects\/[^/]+$/.test(route.path)
if (import.meta.client && !brandPreloaderEnabled.value) {
  useBrandPreload().bypass()
}

useHead(() => ({ htmlAttrs: { lang: locale.value } }))
useSeoMeta({
  title: () => t('seo.defaultTitle'),
  description: () => t('seo.defaultDescription'),
})

if (import.meta.client && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

onMounted(() => {
  const mountEnhancements = () => {
    enhancementsReady.value = true
  }
  // Closed overlays and decorative controls are not part of the first frame.
  // Load them during the first idle window, with a bounded fallback so the
  // menu and route transitions are ready before a typical first interaction.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(mountEnhancements, { timeout: 1200 })
  } else {
    window.setTimeout(mountEnhancements, 400)
  }
})
</script>

<template>
  <div>
    <BrandPreloader v-if="brandPreloaderEnabled" />
    <div class="pc-live-stack">
      <div class="page-shell">
        <div class="page-shell__paint">
          <NuxtPage />
        </div>
      </div>
    </div>
    <SiteHeader />
    <ClientOnly>
      <LazyCaseDetailTransition v-if="enhancementsReady" />
      <LazyPageCanvas v-if="enhancementsReady" />
      <LazyPageIris v-if="enhancementsReady" />
      <LazySiteCursor v-if="enhancementsReady" />
      <LazyCustomScrollbar v-if="enhancementsReady" />
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
