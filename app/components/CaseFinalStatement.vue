<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <section class="project-story project-story--final">
    <p class="case-text-fill">{{ text }}</p>
  </section>
</template>

<style scoped>
.project-story--final {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin: var(--space-7) 0 var(--space-6);
  place-items: center;
  align-content: center;
}

.project-story--final p {
  grid-column: 2 / -2;
  max-width: 27ch;
  margin: 0;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
  letter-spacing: -0.06em;
  line-height: 0.96;
  text-align: center;
}

.project-story--final p.case-text-fill {
  grid-column: 2 / -2;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
}

@media (max-width: 1279.98px) {
  .project-story--final p.case-text-fill { grid-column: 2 / -2; }
}

@media (max-width: 767.98px) {
  .project-story--final {
    min-height: 0;
    grid-template-columns: 1fr;
    margin: var(--space-6) 0;
  }

  .project-story--final p,
  .project-story--final p.case-text-fill {
    grid-column: 1;
    font-size: clamp(1.875rem, 4.5vw, 5.4rem);
    text-align: left;
  }
}
</style>
