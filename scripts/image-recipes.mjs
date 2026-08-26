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
    source: 'public/home/cases/audience-cover.png',
    outputStem: 'public/home/cases/audience-cover',
    widths: [480, 960],
  },
  {
    source: 'public/home/cases/audience/case-detail-2.png',
    outputStem: 'public/home/cases/audience-intro-1',
    widths: [480, 960, 1248],
  },
]
