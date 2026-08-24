<script setup lang="ts">
defineProps<{
  disclosureId: string
  title: string
  paragraphs: string[]
}>()

const emit = defineEmits<{
  layoutChange: []
}>()

const open = ref(false)

async function toggle() {
  open.value = !open.value
  await nextTick()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    emit('layoutChange')
  }
}

function handleTransition(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
  emit('layoutChange')
}
</script>

<template>
  <div
    class="case-disclosure"
    role="button"
    tabindex="0"
    :aria-expanded="open"
    :aria-controls="disclosureId"
    @click="toggle"
    @keydown.enter="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="case-disclosure__title" v-html="title" />
    <div
      :id="disclosureId"
      class="case-disclosure__body"
      :class="{ 'is-open': open }"
      @transitionend="handleTransition"
      @transitioncancel="handleTransition"
    >
      <div class="case-disclosure__body-clip">
        <div class="case-disclosure__body-inner">
          <p v-for="paragraph in paragraphs" :key="paragraph">{{ paragraph }}</p>
        </div>
      </div>
    </div>
    <span
      class="case-disclosure__trigger"
      aria-hidden="true"
    >
      <span class="case-disclosure__pill">
        <span>{{ open ? 'свернуть' : 'читать' }}</span>
        <PhPlusMinus :minus="open" :size="18" />
      </span>
    </span>
  </div>
</template>

<style scoped>
.case-disclosure {
  width: 100%;
  text-align: center;
  cursor: pointer;
}

.case-disclosure__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.case-disclosure__title {
  max-width: 13ch;
  font-size: clamp(2.8rem, 7.2vw, 8.2rem);
  font-weight: 400;
  letter-spacing: -0.065em;
  line-height: 0.88;
}

.case-disclosure__pill {
  display: inline-flex;
  min-width: 7.8rem;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin-top: var(--space-4);
  padding: var(--space-1) var(--space-2);
  border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
  border-radius: 999px;
  font-size: var(--type-nav);
  transition: color 220ms ease, background-color 220ms ease, transform 220ms ease;
}

.case-disclosure:hover .case-disclosure__pill,
.case-disclosure:focus-visible .case-disclosure__pill {
  color: var(--palette-milk, #f5f1e8);
  background: var(--palette-ink, #0a0a0a);
  transform: scale(1.04);
}

.case-detail--inverse .case-disclosure:hover .case-disclosure__pill,
.case-detail--inverse .case-disclosure:focus-visible .case-disclosure__pill {
  color: var(--palette-ink, #0a0a0a);
  background: var(--palette-milk, #f5f1e8);
}

.case-disclosure:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 0.75rem;
}

.case-disclosure__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 650ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease;
}

.case-disclosure__body.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.case-disclosure__body-clip {
  min-height: 0;
  overflow: hidden;
}

.case-disclosure__body-inner {
  display: grid;
  width: min(100%, 74rem);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--layout-gutter);
  margin: 0 auto;
  padding-block: var(--space-5) var(--space-4);
  text-align: left;
}

.case-disclosure__body p {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 2rem);
  letter-spacing: -0.035em;
  line-height: 1.18;
}

@media (max-width: 767.98px) {
  .case-disclosure__body-inner { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .case-disclosure__pill,
  .case-disclosure__body { transition: none; }
}
</style>
