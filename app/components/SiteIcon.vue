<script setup lang="ts">
import {
  IconArrowDownLeft,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconDeviceMobile,
  IconDeviceMobileVibration,
  IconHandMove,
  IconMinus,
  IconPlus,
} from '@tabler/icons-vue'

const icons = {
  'arrow-down-left': IconArrowDownLeft,
  'arrow-left': IconArrowLeft,
  'arrow-right': IconArrowRight,
  'arrow-up': IconArrowUp,
  'arrow-up-right': IconArrowUpRight,
  'device-mobile': IconDeviceMobile,
  'device-mobile-vibration': IconDeviceMobileVibration,
  'hand-move': IconHandMove,
  minus: IconMinus,
  plus: IconPlus,
}

withDefaults(defineProps<{
  name: keyof typeof icons
  size?: number | string
  stroke?: number
}>(), {
  size: 24,
  stroke: 1.5,
})
</script>

<template>
  <component
    :is="icons[name]"
    class="site-icon"
    :size="size"
    :stroke="String(stroke)"
    stroke-linecap="butt"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  />
</template>

<style scoped>
/* Tabler uses tiny strokes for these circular home buttons. Preserve the
   dots explicitly while keeping the actual line endings flat. */
.site-icon :deep(path[d="M12 17v.01"]),
.site-icon :deep(path[d="M9 17l0 .01"]) {
  stroke-linecap: round;
}
</style>
