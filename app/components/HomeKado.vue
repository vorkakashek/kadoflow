<script setup lang="ts">
/**
 * Home — «Кадо́ — путь цветов.»
 * Grid: empty col 1 & 12 · photo cols 2–6 · text cols 7–11.
 * Surface target: 4 page-grid cols (`--layout-span-4`), 80% photo height.
 */
const section = ref<HTMLElement | null>(null)
const surfaceTarget = ref<HTMLElement | null>(null)
const mediaFocusEl = ref<HTMLElement | null>(null)
const topFocusEl = ref<HTMLElement | null>(null)
const bodyFocusEl = ref<HTMLElement | null>(null)

defineExpose({
  section,
  surfaceTarget,
})

useViewportFocusRefs([mediaFocusEl, topFocusEl, bodyFocusEl], {
  blur: 16,
  delay: 0.14,
  duration: 0.75,
  stagger: 0.1,
})
</script>

<template>
  <section
    ref="section"
    class="kado relative z-10 w-full"
    :style="{
      paddingInline: 'var(--layout-margin-content)',
      paddingBlock: 'var(--space-section)',
    }"
  >
    <div
      class="relative mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
        rowGap: 'var(--space-block)',
      }"
    >
      <!-- Empty cols 1 & 12 · photo band cols 2–6 (image centered) · text 7–11 -->
      <div class="relative col-span-12 flex justify-center md:col-span-5 md:col-start-2">
        <div class="relative w-fit max-w-full">
          <!--
            Morph target: 4 grid cols wide, 80% of photo tall (10% inset each end),
            centered on the photo.
          -->
          <div
            ref="surfaceTarget"
            class="pointer-events-none absolute left-1/2 top-[10%] -z-10 -translate-x-1/2"
            aria-hidden="true"
            :style="{
              width: 'var(--layout-span-4)',
              height: '80%',
            }"
          />
          <img
            ref="mediaFocusEl"
            src="/home/rock.png"
            alt="Камень"
            class="kado-focus relative z-10 mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain"
            width="854"
            height="1634"
            loading="lazy"
            decoding="async"
          >
        </div>
      </div>

      <!--
        Text band matches surface vertically: top 10% → height 80% of the photo row.
      -->
      <div class="relative col-span-12 md:col-span-5 md:col-start-7 md:self-stretch">
        <div
          class="kado-copy flex flex-col gap-[var(--space-block)] md:absolute md:inset-x-0 md:top-[10%] md:h-[80%] md:gap-0"
        >
          <div
            ref="topFocusEl"
            class="kado-focus grid w-full text-forest"
            :style="{
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              columnGap: 'var(--layout-gutter)',
              rowGap: '12px',
            }"
          >
            <h2 class="kado-title col-span-6">
              Кадо́ — путь цветов.
            </h2>
            <p class="kado-phonetic col-span-6">
              [/ ka-dō]
            </p>
            <p class="kado-deck col-span-6 md:col-span-4 md:col-start-2">
              Японское искусство композиции, где свобода природной формы обретает точный порядок.
            </p>
          </div>

          <p
            ref="bodyFocusEl"
            class="kado-focus kado-body mt-auto w-full text-ink"
            :style="{ maxWidth: 'var(--layout-span-5)' }"
          >
            Kadoflow переносит этот принцип в цифровую среду: создаёт для каждой задачи собственный визуальный язык и собирает его в работающую систему.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.kado-focus {
  will-change: filter, opacity;
  transform: translateZ(0);
}

.kado-title {
  font-size: var(--type-slogan);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kado-phonetic {
  font-size: var(--type-nav);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
  opacity: 0.72;
}

.kado-deck {
  font-size: var(--type-lead);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.kado-body {
  font-size: var(--type-slogan);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
</style>
