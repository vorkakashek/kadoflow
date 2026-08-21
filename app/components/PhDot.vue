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
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="128" cy="128" r="48" />
  </svg>
</template>
