<script setup lang="ts">
import { heroToKadoPlan } from '~/utils/flowSurfaceMorph'
import { preloadGsapBundle } from '~/utils/preloadHomeMotion'

const hero = useTemplateRef('hero')
const kado = useTemplateRef('kado')

const fromEl = computed(() => hero.value?.surfaceSlot ?? null)
const toEl = computed(() => kado.value?.surfaceTarget ?? null)
const stoneEl = computed(() => kado.value?.stoneEl ?? null)
const termEl = computed(() => kado.value?.termTarget ?? null)
const wordEl = computed(() => kado.value?.kadoflowWord ?? null)
const bodyEl = computed(() => kado.value?.bodyFocusEl ?? null)

/**
 * Yield one frame so router paint commits, then mount the surface.
 * GSAP is pre-warmed on idle elsewhere — avoids import jank here.
 */
const mountSurface = ref(false)

onMounted(() => {
  void preloadGsapBundle()
  requestAnimationFrame(() => {
    mountSurface.value = true
  })
})
</script>

<template>
  <div class="bg-sand text-ink">
    <FlowSurfaceHost
      v-if="mountSurface"
      :from-el="fromEl"
      :to-el="toEl"
      :stone-el="stoneEl"
      :term-el="termEl"
      :word-el="wordEl"
      :body-el="bodyEl"
      :plan="heroToKadoPlan"
    />
    <main class="pointer-events-none relative z-10">
      <HomeHero ref="hero" />
      <HomeKado ref="kado" />
      <!-- Temporary scroll room for morph / parallax tests -->
      <div class="h-[120svh]" aria-hidden="true" />
    </main>
  </div>
</template>
