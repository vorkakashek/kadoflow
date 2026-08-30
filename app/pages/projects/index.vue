<script setup lang="ts">
import { homeCaseDetailPath, homeCases, type HomeCase } from '~/utils/homeCases'
import { warmCaseDetailRoute } from '~/utils/caseDetailRouteWarmup'

const { openCaseDetail } = useCaseDetailTransition()

function warmCaseDetail(item: HomeCase) {
  void warmCaseDetailRoute(homeCaseDetailPath(item))
}

onMounted(() => {
  // Reaching the project catalog is already a strong navigation signal. Warm
  // the shared detail route immediately; all cards resolve through [id].vue.
  const firstCase = homeCases[0]
  if (firstCase) warmCaseDetail(firstCase)
})

function openCase(item: HomeCase, event: MouseEvent) {
  const cover = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-case-cover]')
  const rect = cover?.getBoundingClientRect()
  if (!rect || rect.width < 2 || rect.height < 2) return
  const paintedImage = cover?.querySelector<HTMLImageElement>('img')
  event.preventDefault()
  openCaseDetail({
    to: homeCaseDetailPath(item), origin: 'projects', src: item.media.src,
    proxySrc: paintedImage?.currentSrc || undefined,
    webpSrcset: item.media.webpSrcset, avifSrcset: item.media.avifSrcset,
    alt: item.media.alt, wash: item.wash,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  })
}
</script>

<template>
  <main class="projects-catalog">
    <div class="projects-catalog__inner">
      <header class="projects-catalog__header">
        <p>02</p><h1>Проекты</h1><p>Каталог кейсов — задача, идея, система, результат.</p>
      </header>
      <ul class="projects-catalog__grid">
        <li v-for="(item, index) in homeCases" :key="item.id">
          <a
            :href="homeCaseDetailPath(item)"
            class="projects-card"
            :style="{ backgroundColor: item.wash }"
            @pointerenter="warmCaseDetail(item)"
            @focus="warmCaseDetail(item)"
            @pointerdown="warmCaseDetail(item)"
            @click="openCase(item, $event)"
          >
            <div class="projects-card__cover" :data-case-cover="item.media.src">
              <picture>
                <source v-if="item.media.avifSrcset" type="image/avif" :srcset="item.media.avifSrcset" sizes="(max-width: 767px) 100vw, 50vw">
                <source v-if="item.media.webpSrcset" type="image/webp" :srcset="item.media.webpSrcset" sizes="(max-width: 767px) 100vw, 50vw">
                <img
                  :src="item.media.src"
                  :alt="item.media.alt"
                  :width="item.media.width"
                  :height="item.media.height"
                  :loading="index === 0 ? 'eager' : 'lazy'"
                  :fetchpriority="index === 0 ? 'high' : 'auto'"
                  decoding="async"
                >
              </picture>
            </div>
            <span>{{ item.title }}</span>
          </a>
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
.projects-catalog { min-height: var(--app-screen); padding-block: calc(var(--layout-surface-top) + var(--space-section)) var(--space-section); }
.projects-catalog__inner { width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content))); margin: 0 auto; }
.projects-catalog__header { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--layout-gutter); align-items: end; margin-bottom: clamp(3rem, 8vw, 8rem); }
.projects-catalog__header p, .projects-catalog__header h1 { margin: 0; }
.projects-catalog__header p:first-child { grid-column: span 2; font-size: var(--type-nav); }
.projects-catalog__header h1 { grid-column: span 6; font-size: var(--type-hero); font-weight: 400; letter-spacing: -0.06em; line-height: .9; }
.projects-catalog__header p:last-child { grid-column: span 3 / span 3; font-size: var(--type-lead); line-height: 1.25; }
.projects-catalog__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(1rem, 3vw, 3rem); margin: 0; padding: 0; list-style: none; }
.projects-card { display: block; overflow: hidden; color: inherit; text-decoration: none; }
.projects-card__cover { height: clamp(18rem, 42vw, 42rem); overflow: hidden; }
.projects-card__cover picture { display: contents; }
.projects-card__cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.projects-card > span { display: block; padding-top: .8rem; font-size: var(--type-lead); letter-spacing: -.04em; }
@media (max-width: 767px) { .projects-catalog__header { grid-template-columns: 1fr; gap: 1rem; } .projects-catalog__header p:first-child, .projects-catalog__header h1, .projects-catalog__header p:last-child { grid-column: auto; } .projects-catalog__grid { grid-template-columns: 1fr; } .projects-card__cover { height: 68vw; } }
</style>
