<script setup lang="ts">
defineProps<{ surfaceReady?: boolean }>()

const rootEl = ref<HTMLElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

defineExpose({ rootEl, surfaceEl, titleEl })
</script>

<template>
  <section
    ref="rootEl"
    class="home-about pointer-events-auto relative z-10 w-full"
    :class="{ 'is-surface-ready': surfaceReady }"
    aria-labelledby="home-about-title"
  >
    <div class="home-about__layout">
      <div class="home-about__stage">
        <div
          ref="surfaceEl"
          class="home-about__surface"
          :class="{ 'is-surface-ready': surfaceReady }"
          aria-hidden="true"
        />

        <h2
          id="home-about-title"
          ref="titleEl"
          class="home-about__title"
        >
          <span class="home-about__title-copy">
            <span>Личный взгляд.</span>
            <span>Цельный результат.</span>
          </span>
          <span
            class="home-about__title-copy home-about__title-copy--inverse"
            aria-hidden="true"
          >
            <span>Личный взгляд.</span>
            <span>Цельный результат.</span>
          </span>
        </h2>

        <figure class="home-about__portrait">
          <picture>
            <source
              type="image/avif"
              srcset="/home/me-640.avif 640w, /home/me-1024.avif 1024w"
              sizes="(max-width: 767px) 88vw, 34vw"
            >
            <source
              type="image/webp"
              srcset="/home/me-640.webp 640w, /home/me-1024.webp 1024w"
              sizes="(max-width: 767px) 88vw, 34vw"
            >
            <img
              src="/home/me.png"
              alt="Антон, основатель КАДОФЛОУ"
              width="2344"
              height="2736"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <figcaption class="home-about__meta">
            <span>арт-дирекция&nbsp;&nbsp;·&nbsp;&nbsp;UX/UI&nbsp;&nbsp;·&nbsp;&nbsp;разработка&nbsp;&nbsp;·&nbsp;&nbsp;motion</span>
            <span>москва&nbsp;&nbsp;·&nbsp;&nbsp;работа по всему миру</span>
          </figcaption>
        </figure>
      </div>

      <div class="home-about__copy">
        <h3>Обо мне</h3>
        <p>
          Меня зовут Антон. Я дизайнер и разработчик, основатель КАДОФЛОУ.
          Лично веду ключевые этапы проекта: разбираюсь в задаче, формирую
          структуру и визуальное направление, проектирую взаимодействия и
          участвую в разработке до самого запуска.
        </p>
        <p>
          Я собираю сайты как цельные цифровые пространства — со своим
          характером, понятной логикой и движением, которое помогает содержанию,
          а не существует ради эффекта.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-about {
  padding: var(--space-section) var(--layout-margin-content)
    calc(var(--space-section) * 1.25);
}

.home-about__layout,
.home-about__stage {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.home-about__layout {
  max-width: var(--layout-content-max);
  margin-inline: auto;
}

.home-about__stage {
  position: relative;
  isolation: isolate;
  grid-column: 1 / -1;
}

.home-about__surface {
  position: absolute;
  z-index: -1;
  top: 0;
  right: 0;
  left: 0;
  height: clamp(35rem, 39vw, 46rem);
  border-radius: var(--radius-surface);
  background: var(--palette-ink);
}

.home-about__surface.is-surface-ready {
  background: transparent;
}

.home-about__title {
  --about-title-clip: inset(0 100% 0 0);
  position: relative;
  z-index: 2;
  margin: clamp(5.5rem, 7vw, 8rem) 0 0;
  grid-column: 5 / span 7;
  color: var(--palette-ink);
  font-size: clamp(3.25rem, 5.15vw, 6.25rem);
  font-weight: 400;
  letter-spacing: -0.055em;
  line-height: 0.96;
}

.home-about__title-copy,
.home-about__title-copy > span {
  display: block;
}

.home-about__title-copy > span {
  white-space: nowrap;
}

.home-about__title-copy--inverse {
  position: absolute;
  inset: 0;
  color: var(--palette-sand);
  clip-path: var(--about-title-clip);
  pointer-events: none;
  will-change: clip-path;
}

.home-about:not(.is-surface-ready) .home-about__title {
  color: var(--palette-sand);
}

.home-about__portrait {
  position: relative;
  z-index: 2;
  margin: clamp(3rem, 5vw, 5.5rem) 0 0;
  grid-column: 3 / span 4;
}

.home-about__portrait picture,
.home-about__portrait img {
  display: block;
  width: 100%;
}

.home-about__portrait img {
  height: auto;
}

.home-about__meta {
  display: flex;
  margin-top: 0.8rem;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--palette-ink);
  font-size: clamp(0.75rem, 0.85vw, 0.95rem);
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.home-about__copy {
  display: flex;
  margin-top: clamp(3.5rem, 6vw, 6.5rem);
  grid-column: 5 / span 6;
  flex-direction: column;
  color: var(--palette-ink);
}

.home-about__copy h3 {
  margin: 0 0 clamp(1.75rem, 2.5vw, 2.75rem);
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1;
}

.home-about__copy p {
  max-width: 58rem;
  margin: 0;
  font-size: var(--type-body);
  letter-spacing: -0.025em;
  line-height: 1.38;
}

.home-about__copy p + p {
  margin-top: 1.65em;
}

@media (max-width: 767.98px) {
  .home-about {
    padding-block: calc(var(--space-section) * 0.75) var(--space-section);
  }

  .home-about__layout,
  .home-about__stage {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .home-about__surface {
    right: calc(-1 * var(--layout-margin-content));
    left: calc(-1 * var(--layout-margin-content));
    height: clamp(25rem, 108vw, 32rem);
  }

  .home-about__title {
    margin-top: clamp(3.5rem, 17vw, 5rem);
    grid-column: 1 / -1;
    font-size: clamp(2rem, 9.4vw, 3.2rem);
    line-height: 0.94;
  }

  .home-about__portrait {
    width: 88%;
    max-width: 32rem;
    margin-top: clamp(2.75rem, 12vw, 4rem);
    grid-column: 1 / -1;
  }

  .home-about__meta {
    font-size: 0.72rem;
  }

  .home-about__copy {
    margin-top: clamp(3.5rem, 15vw, 5.5rem);
    grid-column: 1 / -1;
  }

  .home-about__copy h3 {
    font-size: calc(var(--type-slogan) * 0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-about__surface.is-surface-ready {
    background: var(--palette-ink);
  }

  .home-about__title {
    color: var(--palette-sand);
  }

  .home-about__title-copy--inverse {
    will-change: auto;
  }
}
</style>
