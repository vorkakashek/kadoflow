<script setup lang="ts">
import { PhArrowUp } from '@phosphor-icons/vue'
const { t } = useI18n()

function scrollToTop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
}
</script>

<template>
  <button type="button" class="case-scroll-top" :aria-label="t('common.scrollTop')" @click="scrollToTop">
    <PhArrowUp :size="22" aria-hidden="true" />
  </button>
</template>

<style scoped>
.case-scroll-top {
  position: fixed;
  left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 110;
  display: grid;
  box-sizing: border-box;
  width: 42px;
  height: 42px;
  margin: 0;
  padding: 0;
  border: 1px solid currentColor;
  border-radius: 999px;
  place-items: center;
  appearance: none;
  color: inherit;
  background-color: color-mix(in srgb, currentColor 30%, transparent);
  cursor: pointer;
  transition:
    background-color 260ms ease,
    transform 260ms var(--motion-ease, ease);
}

.case-scroll-top:hover,
.case-scroll-top:focus-visible {
  background-color: color-mix(in srgb, currentColor 42%, transparent);
  transform: translateY(-2px);
}

.case-scroll-top:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .case-scroll-top { transition: none; }
}
</style>
