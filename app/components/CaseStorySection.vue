<script setup lang="ts">
import CaseSectionIntroCopy from './CaseSectionIntroCopy.vue'
import type { ProjectCaseSection } from '~/utils/projectCaseDetails'

const props = defineProps<{
  section: ProjectCaseSection
}>()

const emit = defineEmits<{
  layoutChange: []
}>()

const presentationClasses = computed(() => {
  const presentation = props.section.presentation
  if (!presentation) return []

  return [
    presentation.title && presentation.title !== 'default'
      ? `project-story--title-${presentation.title}`
      : null,
    presentation.copy && presentation.copy !== 'default'
      ? `project-story--copy-${presentation.copy}`
      : null,
    presentation.media && presentation.media !== 'default'
      ? `project-story--media-${presentation.media}`
      : null,
    presentation.spacing && presentation.spacing !== 'default'
      ? `project-story--spacing-${presentation.spacing}`
      : null,
    presentation.mobileCopyGap && presentation.mobileCopyGap !== 'default'
      ? `project-story--mobile-copy-${presentation.mobileCopyGap}`
      : null,
    presentation.statementGap && presentation.statementGap !== 'default'
      ? `project-story--statement-${presentation.statementGap}`
      : null,
  ].filter(Boolean)
})
</script>

<template>
  <section
    class="project-story"
    :class="[`project-story--${section.layout}`, ...presentationClasses]"
  >
    <CaseNarrativeDisclosure
      v-if="section.layout === 'disclosure'"
      :disclosure-id="`case-${section.id}`"
      :title="section.title"
      :paragraphs="section.paragraphs"
      @layout-change="emit('layoutChange')"
    />
    <template v-else-if="section.layout === 'feature'">
      <h2 v-html="section.title" />
      <div class="project-story__copy">
        <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
      </div>
    </template>
    <CaseSectionIntroCopy
      v-else
      :title="section.title"
      :paragraphs="section.paragraphs"
    />

    <CaseMediaCollection :media="section.media" :rail-speed="section.railSpeed" />
    <CaseMediaCaption v-if="section.statement" :text="section.statement" />
  </section>
</template>

<style scoped>
.project-story {
  --case-section-intro-copy-margin: calc(var(--space-4) - var(--space-5));
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-5);
  margin-top: var(--space-section);
}

.project-story > h2 {
  grid-column: 1 / -1;
  max-width: 11ch;
  margin: 0;
  font-size: clamp(3rem, 8vw, 9rem);
  font-weight: 400;
  letter-spacing: -0.07em;
  line-height: 0.86;
}

.project-story p { margin: 0; }

.project-story__copy {
  display: grid;
  grid-column: 2 / -2;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--layout-gutter);
}

.project-story__copy p,
:deep(.project-story__statement) {
  margin: 0;
  font-size: var(--type-case-body);
  letter-spacing: -0.04em;
  line-height: 1.17;
}

:deep(.project-story__media) { grid-column: 1 / -1; }
:deep(.project-story__picture) { display: contents; }

:deep(.project-story__media:not(.project-story__media--scroll)),
:deep(.project-story__media--scroll .case-horizontal-rail__content) {
  display: grid;
  gap: var(--layout-gutter);
  align-items: start;
}

:deep(.project-story__media img) {
  display: block;
  width: 100%;
  min-height: 0;
  background: color-mix(in srgb, currentColor 8%, transparent);
  object-fit: cover;
}

:deep(.project-story__media .case-autoplay-video) {
  display: block;
  width: 100%;
  min-height: 0;
  background: color-mix(in srgb, currentColor 8%, transparent);
  overflow: hidden;
}

:deep(.project-story__image--wide) { aspect-ratio: 16 / 10; }
:deep(.project-story__image--landscape) { aspect-ratio: 4 / 3; }
:deep(.project-story__image--portrait) { aspect-ratio: 4 / 5; }
:deep(.project-story__image--square) { aspect-ratio: 1; }

:deep(.project-story__media--2:not(.project-story__media--scroll)),
:deep(.project-story__media--2.project-story__media--scroll .case-horizontal-rail__content) {
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
}

:deep(.project-story__media--2 img:last-child) { margin-top: var(--space-6); }

:deep(.project-story__media--3:not(.project-story__media--scroll)),
:deep(.project-story__media--3.project-story__media--scroll .case-horizontal-rail__content) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:deep(.project-story__media--3 img:nth-child(2)) { margin-top: var(--space-7); }
:deep(.project-story__media--3 img:nth-child(3)) { margin-top: var(--space-5); }

:deep(.project-story__media--4:not(.project-story__media--scroll)),
:deep(.project-story__media--4.project-story__media--scroll .case-horizontal-rail__content) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

:deep(.project-story__media--4 img:nth-child(even)) { margin-top: var(--space-6); }

.project-story--media-gallery-tight :deep(.project-story__media--4:not(.project-story__media--scroll)),
.project-story--media-gallery-tight :deep(.project-story__media--4.project-story__media--scroll .case-horizontal-rail__content) {
  gap: calc(var(--layout-gutter) * 0.5);
}

.project-story--media-gallery-tight :deep(.project-story__media--4 img:nth-child(even)) {
  margin-top: var(--space-4);
}

.project-story--feature > h2 {
  grid-column: 2 / -2;
  max-width: none;
  text-align: center;
}

.project-story--feature .project-story__copy {
  grid-column: 4 / -4;
  grid-template-columns: 1fr;
  text-align: center;
}

.project-story--feature :deep(.project-story__media img) { aspect-ratio: 16 / 8; }

.project-story--feature :deep(.project-story__media .case-autoplay-video) {
  width: min(100%, 62rem);
  margin-inline: auto;
  aspect-ratio: 1;
}

.project-story--title-nowrap > h2 {
  grid-column: 1 / -1;
  max-width: none;
  white-space: nowrap;
}

.project-story--title-offset > h2 { grid-column: 2 / span 8; }
.project-story--copy-collection .project-story__copy { grid-column: 7 / -2; }
.project-story--copy-object-grid .project-story__copy { grid-column: 6 / -2; }
.project-story--copy-route .project-story__copy { grid-column: 8 / -2; }

.project-story--media-motion :deep(.project-story__media .case-autoplay-video) {
  aspect-ratio: 16 / 9;
  background-color: #e2dbcf;
}

.project-story--media-motion :deep(.case-autoplay-video__poster),
.project-story--media-motion :deep(video) {
  height: 100%;
  background-color: #e2dbcf;
  object-fit: cover;
}

@media (min-width: 768px) {
  .project-story--media-collection-rail :deep(.case-horizontal-rail__viewport) {
    overflow-x: auto;
    overflow-y: hidden;
    cursor: grab;
    scrollbar-width: none;
    user-select: none;
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__viewport::-webkit-scrollbar) { display: none; }
  .project-story--media-collection-rail :deep(.case-horizontal-rail__viewport:active) { cursor: grabbing; }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__content) {
    display: flex;
    width: max-content;
    gap: calc(var(--layout-gutter) * 0.25);
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__content img) {
    width: auto;
    max-width: none;
    height: min(52svh, 28vw);
    flex: 0 0 auto;
    margin-top: 0;
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__bar) {
    display: block;
    width: calc(25% - var(--layout-gutter));
    height: 8px;
    margin: var(--space-4) auto 0;
    padding-block: 3px;
    cursor: pointer;
    touch-action: none;
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__bar::before) {
    display: block;
    height: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 20%, transparent);
    content: '';
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__thumb) {
    position: relative;
    top: -2px;
    display: block;
    height: 4px;
    border-radius: 999px;
    background: currentColor;
    cursor: grab;
    touch-action: none;
  }

  .project-story--media-motion :deep(.project-story__media) { grid-column: 2 / -2; }

  .project-story--media-motion :deep(.project-story__media .case-autoplay-video) {
    width: 100%;
    max-width: none;
  }

  .project-story--copy-object-grid .project-story__copy {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: var(--space-4);
  }

  .project-story--copy-object-grid .project-story__copy p:nth-child(1) {
    grid-column: 1;
    grid-row: 1;
  }

  .project-story--copy-object-grid .project-story__copy p:nth-child(2) {
    grid-column: 1;
    grid-row: 2;
  }

  .project-story--copy-object-grid .project-story__copy p:nth-child(3) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .project-story--media-object-pair :deep(.project-story__media--2 .case-horizontal-rail__content) {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: start;
  }

  .project-story--media-object-pair :deep(.case-horizontal-rail__content > .project-story__picture) {
    display: block;
    min-width: 0;
    grid-row: 1;
  }

  .project-story--media-object-pair :deep(.case-horizontal-rail__content > .project-story__picture:first-child) { grid-column: 1; }
  .project-story--media-object-pair :deep(.case-horizontal-rail__content > .project-story__picture:last-child) { grid-column: 2; }
  .project-story--media-object-pair :deep(.case-horizontal-rail__content > .project-story__picture > img) { margin-top: 0; }
}

.project-story--media-route :deep(.project-story__media) {
  grid-column: 2 / -2;
  margin-top: calc(var(--space-5) * -0.5);
}

.project-story--disclosure,
.project-story--spacing-compact-disclosure { row-gap: var(--space-4); }
.project-story--disclosure > :deep(.case-disclosure) { grid-column: 1 / -1; }
.project-story--disclosure :deep(.project-story__media) { grid-column: 2 / -2; }
.project-story--disclosure :deep(.project-story__media img) { aspect-ratio: 16 / 8; }
.project-story--media-label :deep(.project-story__media img) { aspect-ratio: 4 / 3; }

:deep(.project-story__statement) {
  grid-column: 3 / -3;
  margin-top: var(--space-6);
  margin-bottom: 0;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
  opacity: 0.7;
}

.project-story--statement-medium :deep(.project-story__statement) { margin-top: var(--space-5); }
.project-story--statement-small :deep(.project-story__statement) { margin-top: var(--space-4); }
.project-story--statement-section :deep(.project-story__statement) { margin-top: var(--space-section); }

@media (max-width: 767.98px) {
  .project-story {
    grid-template-columns: 1fr;
    row-gap: var(--space-5);
    margin-top: var(--space-section);
  }

  .project-story > h2 { font-size: clamp(1.875rem, 8vw, 2.25rem); }

  .project-story > h2 + .project-story__copy {
    margin-top: calc(var(--space-4) - var(--space-5));
  }

  .project-story--mobile-copy-compact > h2 + .project-story__copy {
    margin-top: calc(var(--space-5) * -0.5);
  }

  .project-story--disclosure { row-gap: var(--space-4); }

  .project-story > h2,
  .project-story__copy,
  .project-story--intro > h2,
  .project-story--intro .project-story__copy,
  .project-story--feature > h2,
  .project-story--feature .project-story__copy,
  .project-story--split > h2,
  .project-story--split .project-story__copy,
  .project-story--gallery > h2,
  .project-story--gallery .project-story__copy,
  .project-story--disclosure > :deep(.case-disclosure),
  .project-story--disclosure :deep(.project-story__media),
  :deep(.project-story__statement) {
    grid-column: 1;
  }

  .project-story__copy { grid-template-columns: 1fr; }

  .project-story--feature > h2,
  .project-story--feature .project-story__copy { text-align: left; }

  :deep(.project-story__media) { gap: var(--space-1); }

  :deep(.project-story__media--2) { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  :deep(.project-story__media--3) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  :deep(.project-story__media--3 img:first-child) { grid-column: 1 / -1; }
  :deep(.project-story__media--4) { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  :deep(.project-story__media--2 img:last-child),
  :deep(.project-story__media--3 img:nth-child(2)),
  :deep(.project-story__media--3 img:nth-child(3)),
  :deep(.project-story__media--4 img:nth-child(even)) { margin-top: var(--space-5); }

  .project-story--feature :deep(.project-story__media img),
  .project-story--disclosure :deep(.project-story__media img) { aspect-ratio: 4 / 5; }

  .project-story--feature :deep(.project-story__media .case-autoplay-video),
  .project-story--media-motion :deep(.project-story__media .case-autoplay-video) { aspect-ratio: 9 / 16; }

  .project-story--media-motion :deep(video) { object-fit: cover; }
  .project-story--media-label :deep(.project-story__media img) { aspect-ratio: 4 / 3; }

  :deep(.project-story__statement),
  .project-story--statement-medium :deep(.project-story__statement),
  .project-story--statement-small :deep(.project-story__statement),
  .project-story--statement-section :deep(.project-story__statement) {
    margin-top: var(--space-2);
    margin-bottom: 0;
    text-align: center;
  }

  :deep(.project-story__media--scroll .case-horizontal-rail__viewport) {
    display: block;
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }

  :deep(.project-story__media--scroll .case-horizontal-rail__content) {
    --case-rail-mobile-media-height: min(62svh, 72vw);
    display: flex;
    width: max-content;
    align-items: flex-start;
    gap: var(--space-1);
  }

  :deep(.project-story__media--scroll .case-horizontal-rail__content > img),
  :deep(.project-story__media--scroll .case-horizontal-rail__content > picture),
  :deep(.project-story__media--scroll .case-horizontal-rail__content > .case-autoplay-video) {
    flex: 0 0 auto;
    width: auto;
    height: var(--case-rail-mobile-media-height);
    margin-top: 0;
  }

  :deep(.project-story__media--scroll .case-horizontal-rail__content > picture) { display: block; }

  :deep(.project-story__media--scroll .case-horizontal-rail__content > img),
  :deep(.project-story__media--scroll .case-horizontal-rail__content > picture > img) {
    width: auto;
    max-width: none;
    height: 100%;
    margin-top: 0;
    aspect-ratio: auto !important;
    object-fit: contain;
  }

  .project-story--media-collection-rail :deep(.case-horizontal-rail__content) {
    gap: calc(var(--space-1) * 0.25);
  }

  :deep(.project-story__media--scroll .case-horizontal-rail__bar) {
    width: 80vw;
    margin-inline: calc(50% - 40vw);
  }

  .project-story__copy p { font-size: var(--type-case-body); }
}
</style>
