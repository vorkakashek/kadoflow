<script setup lang="ts">
/**
 * iOS fallback — flat CSS balls (no preserve-3d).
 * 3D CSS transforms were another Safari compositor tax on top of grain/clip-path.
 */
const COLORS = ['#49573f', '#171915', '#f5f1e8', '#49573f', '#171915'] as const

const props = withDefaults(
  defineProps<{
    active?: boolean
  }>(),
  { active: true },
)

const balls = COLORS.map((color, i) => {
  const t = i / COLORS.length
  const angle = t * Math.PI * 2
  const rx = 38
  const ry = 22
  return {
    color,
    x: 50 + Math.cos(angle) * rx,
    y: 42 + Math.sin(angle) * ry,
    delay: `${(-t * 10).toFixed(2)}s`,
    size: 14 + (i % 3) * 3,
  }
})
</script>

<template>
  <div
    class="swarm-css"
    :class="{ 'swarm-css--paused': !active }"
    aria-hidden="true"
  >
    <div class="swarm-css__stage">
      <span
        v-for="(ball, i) in balls"
        :key="i"
        class="swarm-css__ball"
        :style="{
          backgroundColor: ball.color,
          left: `${ball.x}%`,
          top: `${ball.y}%`,
          width: `${ball.size}%`,
          height: `${ball.size}%`,
          animationDelay: ball.delay,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.swarm-css {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  display: grid;
  place-items: start center;
  padding-top: 6%;
}

.swarm-css__stage {
  position: relative;
  width: min(70vw, 300px);
  height: min(48vw, 220px);
}

.swarm-css__ball {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow:
    inset -6px -8px 14px rgb(0 0 0 / 22%),
    inset 5px 6px 12px rgb(255 255 255 / 18%),
    0 10px 18px rgb(0 0 0 / 14%);
  animation: swarm-drift 7s ease-in-out infinite;
}

.swarm-css--paused .swarm-css__ball {
  animation-play-state: paused;
}

@keyframes swarm-drift {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 4% -5%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .swarm-css__ball {
    animation: none;
  }
}
</style>
