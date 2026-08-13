<template>
  <div>
    <BrandPreloader />
    <NuxtPage />
    <ClientOnly>
      <FpsMeter />
    </ClientOnly>
  </div>
</template>

<style>
html.preload-lock,
html.preload-lock body {
  overflow: hidden;
  overscroll-behavior: none;
}

/* First paint for warm revisit — full black macron, not empty gray track. */
html[data-preload-warm] .brand-preload__arc:not(.brand-preload__arc--track) {
  stroke-dashoffset: 0 !important;
}
</style>
