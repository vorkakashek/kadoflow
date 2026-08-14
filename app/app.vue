<script setup lang="ts">
import { usePageCanvas } from '~/composables/usePageCanvas'
import { preloadHomeMotionBundles } from '~/utils/preloadHomeMotion'

const { dockTo } = usePageCanvas()

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
    <!--
      page-shell is the outzoom target. When Page Canvas docks it, Teleport
      moves the shell into the active frame slot (scrolls with the strip — no fixed chase).
      SiteHeader stays OUTSIDE — fixed chrome must not be trapped by shell transforms,
      or the menu button flies into the tile and scroll-lock remorphs the bar.
    -->
    <Teleport :to="dockTo || 'body'" :disabled="!dockTo">
      <div class="page-shell" :class="{ 'is-canvas-docked': !!dockTo }">
        <div class="page-shell__paint">
          <NuxtPage />
        </div>
      </div>
    </Teleport>
    <SiteHeader />
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

.page-shell {
  position: relative;
  z-index: 1;
  min-height: 100svh;
  min-height: 100dvh;
}

.page-shell__paint {
  min-height: 100svh;
  min-height: 100dvh;
}

/* Docked inside a frame slot — child of the tile, scrolls with the desk. */
.page-shell.is-canvas-docked {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: auto;
  height: auto;
  min-height: 0;
  overflow: hidden;
  border-radius: 4px;
  pointer-events: auto;
  cursor: pointer;
  /* Beat leftover GSAP flight scale — otherwise the mini collapses into a corner. */
  transform: none !important;
  translate: none !important;
  scale: none !important;
  /* Opaque underpaint — motif must never read through the miniature. */
  background: var(--palette-sand);
}

.page-shell.is-canvas-docked .page-shell__paint {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--pc-dock-w, 100vw);
  /* Full page height — not one viewport. */
  height: auto;
  min-height: var(--pc-dock-h, 100dvh);
  transform-origin: 0 0;
  pointer-events: none;
  /* scale after translate (CSS right→left) — matches flight: parent-scale × scroll shift */
  transform: scale(var(--pc-dock-scale, 1)) translate3d(0, var(--pc-dock-scroll, 0px), 0);
}

/* Mid outzoom (fixed) before Teleport settles into the slot. */
.page-shell.is-canvas-flying {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  z-index: 86 !important;
  width: 100vw !important;
  height: 100dvh !important;
  min-height: 0 !important;
  overflow: hidden !important;
  border-radius: 0;
  pointer-events: auto;
  cursor: pointer;
  transform-origin: 0 0;
  background: var(--palette-sand);
}

/* If flight class leaks after unlock, don't eat header/menu clicks. */
html:not(.page-canvas-lock) .page-shell.is-canvas-flying {
  pointer-events: none !important;
  cursor: auto;
}

/* Safety: never keep a scaled “plaque” after menu unlock. */
html:not(.page-canvas-lock) .page-shell:not(.is-canvas-flying):not(.is-canvas-docked) {
  transform: none !important;
  translate: none !important;
  scale: none !important;
}

.page-shell.is-canvas-flying .page-shell__paint {
  position: relative;
  width: 100%;
  height: auto;
  min-height: 100%;
  transform-origin: 0 0;
  pointer-events: none;
}
</style>
