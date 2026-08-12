<script setup lang="ts">
import { heroToKadoPlan } from '~/utils/flowSurfaceMorph'

const hero = useTemplateRef('hero')
const kado = useTemplateRef('kado')

const fromEl = computed(() => hero.value?.surfaceSlot ?? null)
const toEl = computed(() => kado.value?.surfaceTarget ?? null)
const stoneEl = computed(() => kado.value?.stoneEl ?? null)
const termEl = computed(() => kado.value?.termTarget ?? null)
const wordEl = computed(() => kado.value?.kadoflowWord ?? null)
const bodyEl = computed(() => kado.value?.bodyFocusEl ?? null)

/** Soft snap off — locks touchmove on direction changes / settle and fights iOS scroll. */
</script>

<template>
  <div class="bg-sand text-ink">
    <FlowSurfaceHost
      :from-el="fromEl"
      :to-el="toEl"
      :stone-el="stoneEl"
      :term-el="termEl"
      :word-el="wordEl"
      :body-el="bodyEl"
      :plan="heroToKadoPlan"
    />
    <SiteHeader />
    <main class="pointer-events-none relative z-10">
      <HomeHero ref="hero" />
      <HomeKado ref="kado" />
      <!-- Temporary scroll room for morph / parallax tests -->
      <div class="h-[120svh]" aria-hidden="true" />
    </main>
  </div>
</template>
