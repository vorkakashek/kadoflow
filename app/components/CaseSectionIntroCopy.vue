<script setup lang="ts">
defineProps<{
  title: string
  paragraphs: string[]
}>()

function allowNaturalLineBreaks(text: string) {
  // The locale build binds short service words with NBSP. In narrow body copy
  // that makes the following word an unbreakable unit and blocks hyphenation.
  return text.replaceAll('\u00a0', ' ')
}
</script>

<template>
  <div class="case-section-intro-copy">
    <h2 v-html="title" />
    <div class="case-section-intro-copy__body">
      <p v-for="paragraph in paragraphs" :key="paragraph">{{ allowNaturalLineBreaks(paragraph) }}</p>
    </div>
  </div>
</template>

<style scoped>
.case-section-intro-copy {
  display: contents;
}

h2 {
  grid-column: 2 / span 5;
  grid-row: 1;
  max-width: none;
  margin: 0;
  font-size: clamp(2.75rem, 4.2vw, 6rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: left;
}

.case-section-intro-copy__body {
  display: grid;
  grid-column: 6 / -2;
  grid-row: 2;
  grid-template-columns: 1fr;
  row-gap: var(--space-2);
  margin-top: var(--case-section-intro-copy-margin, var(--space-4));
  color: color-mix(in srgb, currentColor 78%, transparent);
  font-size: var(--type-case-body-large);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.28;
}

p {
  margin: 0;
}

@media (min-width: 768px) and (max-width: 1279.98px) {
  h2,
  .case-section-intro-copy__body {
    grid-column: 2 / -2;
  }
}

@media (max-width: 767.98px) {
  h2,
  .case-section-intro-copy__body {
    grid-column: 1;
  }

  h2 {
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }

  .case-section-intro-copy__body p {
    font-size: var(--type-case-body);
    hyphens: auto;
    hyphenate-limit-chars: 6 3 3;
  }
}
</style>
