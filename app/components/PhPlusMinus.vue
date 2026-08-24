<script setup lang="ts">
withDefaults(defineProps<{
  size?: number | string
  minus?: boolean
}>(), {
  size: 20,
  minus: false,
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 256 256"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="16"
    aria-hidden="true"
  >
    <path d="M40 128h176" />
    <path v-if="!minus" d="M128 40v176" />
  </svg>
</template>
