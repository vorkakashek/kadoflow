<script setup lang="ts">
withDefaults(defineProps<{
  size?: number | string
}>(), {
  size: 24,
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
    <path d="m144 56 72 72-72 72" />
  </svg>
</template>
