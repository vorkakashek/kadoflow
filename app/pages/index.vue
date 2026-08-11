<script setup lang="ts">
import { heroToKadoPlan } from '~/utils/flowSurfaceMorph'

const hero = useTemplateRef('hero')
const kado = useTemplateRef('kado')

const fromEl = computed(() => {
  const slot = hero.value?.surfaceSlot
  return slot ?? null
})
const toEl = computed(() => {
  const target = kado.value?.surfaceTarget
  return target ?? null
})

/** Soft snap off — locks touchmove on direction changes / settle and fights iOS scroll. */
</script>

<template>
  <div class="bg-sand text-ink">
    <FlowSurfaceHost
      :from-el="fromEl"
      :to-el="toEl"
      :plan="heroToKadoPlan"
    />
    <SiteHeader />
    <main class="relative z-10">
      <HomeHero ref="hero" />
      <HomeKado ref="kado" />
      <!-- Temporary scroll room for morph / parallax tests -->
      <div class="h-[120svh]" aria-hidden="true" />
    </main>
  </div>
</template>
