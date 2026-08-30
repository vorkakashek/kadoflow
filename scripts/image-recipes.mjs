/**
 * Source-to-delivery recipes for responsive raster media.
 *
 * Add a recipe when a new visual is introduced. `source` stays the
 * highest-quality original; the generated AVIF/WebP files are what the app
 * references in <picture>. Widths larger than the source are skipped, so we
 * never spend bytes on an upscaled image.
 */
export const imageRecipes = [
  {
    source: 'public/home/cases/audience/audience-cover.png',
    outputStem: 'public/home/cases/audience/audience-cover',
    widths: [480, 960],
  },
  {
    source: 'public/home/cases/audience/case-detail-2.png',
    outputStem: 'public/home/cases/audience/audience-intro-1',
    widths: [480, 960, 1248],
  },
  {
    source: 'public/home/cases/audience/case-detail-3.png',
    outputStem: 'public/home/cases/audience/audience-intro-2',
    widths: [480, 960, 1440, 1840],
  },
  {
    source: 'public/home/cases/audience/case-detail-4.png',
    outputStem: 'public/home/cases/audience/audience-atmosphere',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/audience/case-detail-5.png',
    outputStem: 'public/home/cases/audience/audience-menu-lead',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/audience-img.png',
    outputStem: 'public/home/cases/audience/audience-img',
    widths: [480, 960, 1440, 1856],
  },
  {
    source: 'public/home/cases/audience/case-detail-6.png',
    outputStem: 'public/home/cases/audience/audience-menu-primary',
    widths: [480, 960, 1488],
  },
  {
    source: 'public/home/cases/audience/case-detail-8.png',
    outputStem: 'public/home/cases/audience/audience-menu-details',
    widths: [480, 960, 1488],
  },
  {
    source: 'public/home/cases/audience/case-detail-9.png',
    outputStem: 'public/home/cases/audience/audience-admin-small',
    widths: [480, 960, 1020],
  },
  {
    source: 'public/home/cases/audience/case-detail-10.png',
    outputStem: 'public/home/cases/audience/audience-admin-large',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/audience/case-detail-end.png',
    outputStem: 'public/home/cases/audience/audience-end',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/baltika/baltika-cover.png',
    outputStem: 'public/home/cases/baltika/baltika-cover',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/baltika/baltika-blender.png',
    outputStem: 'public/home/cases/baltika/baltika-detail-header-portrait',
    widths: [320, 480, 640],
    crop: {
      aspectRatio: 9 / 16,
      position: 'centre',
    },
  },
  ...Array.from({ length: 7 }, (_, index) => {
    const imageNumber = index + 1
    return {
      source: `public/home/cases/baltika/baltika-${imageNumber}.png`,
      outputStem: `public/home/cases/baltika/baltika-${imageNumber}`,
      widths: [480, 960, 1440, 1920, 2640],
    }
  }),
  {
    source: 'public/home/cases/baltika/baltika-8.png',
    outputStem: 'public/home/cases/baltika/baltika-8',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/baltika/baltika-9.png',
    outputStem: 'public/home/cases/baltika/baltika-9',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/baltika/baltika-11.png',
    outputStem: 'public/home/cases/baltika/baltika-11',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/baltika/baltika-12.png',
    outputStem: 'public/home/cases/baltika/baltika-12',
    widths: [480, 960, 1440, 2080],
  },
]
