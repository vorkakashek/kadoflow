<script setup lang="ts">
import { heroToKadoPlan } from '~/utils/flowSurfaceMorph'

const hero = useTemplateRef('hero')
const kado = useTemplateRef('kado')
const cases = useTemplateRef('cases')
const surfaceReady = ref(false)

const fromEl = computed(() => hero.value?.surfaceSlot ?? null)
const toEl = computed(() => kado.value?.surfaceTarget ?? null)
const stoneEl = computed(() => kado.value?.stoneEl ?? null)
const termEl = computed(() => kado.value?.termTarget ?? null)
const wordEl = computed(() => kado.value?.kadoflowWord ?? null)
const bodyEl = computed(() => kado.value?.bodyFocusEl ?? null)
const caseSectionEl = computed(() => cases.value?.rootEl ?? null)
const caseMediaEl = computed(() => cases.value?.mediaEl ?? null)

/**
 * Yield one frame so router paint commits, then mount the surface.
 * GSAP is pre-warmed on idle elsewhere — avoids import jank here.
 */
const mountSurface = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    mountSurface.value = true
  })
})
</script>

<template>
  <!-- Flow Surface sits under the page content and morphs into case media. -->
  <div class="relative isolate bg-sand text-ink">
    <div
      id="home-cases-bg-host"
      class="pointer-events-none absolute inset-0 z-[1] overflow-x-clip"
      aria-hidden="true"
    />
    <LazyFlowSurfaceHost
      v-if="mountSurface"
      :from-el="fromEl"
      :to-el="toEl"
      :stone-el="stoneEl"
      :term-el="termEl"
      :word-el="wordEl"
      :body-el="bodyEl"
      :case-section-el="caseSectionEl"
      :case-media-el="caseMediaEl"
      :plan="heroToKadoPlan"
      @ready="surfaceReady = true"
    />
    <main class="pointer-events-none relative z-10">
      <HomeHero ref="hero" :surface-ready="surfaceReady" />
      <HomeKado ref="kado" />
      <HomeCases ref="cases" />
      <section
        class="w-full"
        style="min-height: var(--app-screen)"
        aria-hidden="true"
      />
    </main>
  </div>
</template>
