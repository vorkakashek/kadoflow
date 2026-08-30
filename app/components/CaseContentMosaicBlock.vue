<script setup lang="ts">
import type { ProjectCaseContentMosaicBlock, ProjectCaseMosaicRow } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseContentMosaicBlock
}>()

function rowItems(row: ProjectCaseMosaicRow) {
  return row.featureSide === 'start'
    ? [{ kind: 'feature' as const, media: row.feature }, { kind: 'detail' as const, media: row.detail }]
    : [{ kind: 'detail' as const, media: row.detail }, { kind: 'feature' as const, media: row.feature }]
}
</script>

<template>
  <section class="case-content-mosaic audience-case audience-case--menu">
    <h2 v-html="props.block.title" />
    <div class="audience-case__menu-lead">
      <CaseResponsivePicture :media="props.block.lead.media" class="audience-case__menu-lead-media" />
      <p>{{ props.block.lead.text }}</p>
    </div>
    <p class="audience-case__menu-secondary case-text-fill">{{ props.block.fillText }}</p>
    <div class="audience-case__media-mosaic">
      <div
        v-for="(row, rowIndex) in props.block.rows"
        :key="`${props.block.id}-${rowIndex}`"
        class="audience-case__menu-media-pair"
        :class="rowIndex === 0 ? 'audience-case__menu-media-pair--top' : 'audience-case__menu-media-pair--bottom'"
      >
        <template v-for="item in rowItems(row)" :key="`${item.kind}-${item.media.src}`">
          <CaseResponsivePicture
            v-if="item.kind === 'feature'"
            :media="item.media"
            class="audience-case__responsive-picture audience-case__mosaic-media"
            :class="row.featureSide === 'start'
              ? 'audience-case__responsive-picture--menu-primary'
              : 'audience-case__responsive-picture--menu-details'"
          />
          <div
            v-else
            class="audience-case__menu-media-stack"
            :class="row.featureSide === 'end' ? 'audience-case__menu-media-stack--bottom' : undefined"
          >
            <CaseResponsivePicture :media="item.media" class="audience-case__mosaic-picture" />
            <p class="audience-case__statement audience-case__statement--menu">{{ row.statement }}</p>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.case-content-mosaic {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin-top: var(--space-section);
}

h2 {
  grid-column: 1 / -1;
  max-width: none;
  margin: 0 auto;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: center;
}

p { margin: 0; }

.audience-case__menu-lead,
.audience-case__media-mosaic { grid-column: 1 / -1; }

.audience-case__menu-lead {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  column-gap: var(--layout-gutter);
  margin-top: var(--space-6);
}

.audience-case__menu-lead-media {
  display: block;
  grid-column: 1 / span 6;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.audience-case__menu-lead-media :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audience-case__menu-lead p {
  grid-column: 8 / span 4;
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: clamp(1.25rem, 2.1vw, 2rem);
  letter-spacing: -0.01em;
  line-height: 1.18;
}

.audience-case p.audience-case__menu-secondary {
  grid-column: 3 / -3;
  box-sizing: border-box;
  max-width: none;
  margin: var(--space-section) 0;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.audience-case__media-mosaic {
  display: grid;
  row-gap: calc(var(--space-7) / 4);
}

.audience-case__menu-media-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__responsive-picture,
.audience-case__mosaic-picture {
  display: block;
  min-width: 0;
  overflow: hidden;
}

.audience-case__responsive-picture :deep(img),
.audience-case__mosaic-picture :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audience-case__responsive-picture--menu-primary { aspect-ratio: 4 / 5; }

.audience-case__menu-media-stack {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  row-gap: var(--space-4);
  margin-top: 100%;
}

.audience-case__mosaic-picture {
  grid-column: 1 / -1;
  aspect-ratio: 16 / 10;
}

.audience-case__menu-media-stack .audience-case__statement { grid-column: 2 / -2; }
.audience-case__menu-media-stack--bottom { margin-top: 8%; }
.audience-case__menu-media-stack--bottom .audience-case__mosaic-picture { aspect-ratio: 16 / 11; }

.audience-case__responsive-picture--menu-details {
  aspect-ratio: 4 / 5;
  margin-top: 16%;
}

.audience-case__statement {
  max-width: none;
  margin: 0;
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: clamp(1.125rem, 1.7vw, 1.6rem);
  letter-spacing: -0.01em;
  line-height: 1.28;
  text-align: left;
  opacity: 0.7;
}

@media (max-width: 767.98px) {
  .case-content-mosaic { grid-template-columns: 1fr; }
  h2 {
    grid-column: 1;
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }
  .audience-case__menu-lead,
  .audience-case__menu-secondary,
  .audience-case__media-mosaic { grid-column: 1; }
  .audience-case__menu-lead {
    grid-template-columns: 1fr;
    margin-top: calc(var(--space-6) * 0.5);
  }
  .audience-case__menu-lead-media,
  .audience-case__menu-lead p { grid-column: 1; }
  .audience-case__menu-lead p,
  .audience-case__statement { font-size: var(--type-case-body); }
  .audience-case p.audience-case__menu-secondary {
    grid-column: 1;
    margin-top: var(--space-7);
    margin-bottom: var(--space-7);
  }
  .audience-case__menu-media-pair { gap: var(--space-1); }
  .audience-case__menu-media-pair .audience-case__menu-media-stack { display: contents; }
  .audience-case__menu-media-pair--top .audience-case__responsive-picture--menu-primary { grid-column: 1; grid-row: 1; }
  .audience-case__menu-media-pair--top .audience-case__menu-media-stack .audience-case__mosaic-picture { grid-column: 2; grid-row: 1; margin-top: 100%; }
  .audience-case__menu-media-pair--bottom .audience-case__menu-media-stack .audience-case__mosaic-picture { grid-column: 1; grid-row: 1; margin-top: 8%; }
  .audience-case__menu-media-pair--bottom .audience-case__responsive-picture--menu-details { grid-column: 2; grid-row: 1; }
  .audience-case__menu-media-pair .audience-case__statement--menu {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 80%;
    max-width: var(--layout-span-8);
    margin: var(--space-2) 0 0;
  }
}
</style>
