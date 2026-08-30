<script setup lang="ts">
import type { ProjectCaseBlock } from '~/utils/projectCaseDetails'

defineProps<{
  block: ProjectCaseBlock
}>()

const emit = defineEmits<{
  layoutChange: []
}>()
</script>

<template>
  <CaseStorySection
    v-if="block.type === 'story'"
    :section="block"
    @layout-change="emit('layoutChange')"
  />
  <CaseIntroRailBlock v-else-if="block.type === 'intro-rail'" :block="block" />
  <CaseDisclosureMediaBlock
    v-else-if="block.type === 'disclosure-media'"
    :block="block"
    @layout-change="emit('layoutChange')"
  />
  <CaseContentMosaicBlock v-else-if="block.type === 'content-mosaic'" :block="block" />
  <CaseMotionFeatureBlock v-else-if="block.type === 'motion-feature'" :block="block" />
  <CaseTextMediaRailBlock v-else-if="block.type === 'text-media-rail'" :block="block" />
  <CaseFinalStatement
    v-else-if="block.type === 'final'"
    :text="block.text"
    :variant="block.variant"
  />
</template>
