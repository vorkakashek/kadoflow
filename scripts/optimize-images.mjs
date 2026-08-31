import { access, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import { imageRecipes } from './image-recipes.mjs'

const root = resolve(import.meta.dirname, '..')
const pipelineMtime = Math.max(
  (await stat(new URL(import.meta.url))).mtimeMs,
  (await stat(new URL('./image-recipes.mjs', import.meta.url))).mtimeMs,
)

const outputFormats = [
  { extension: 'avif', encode: (image) => image.avif({ quality: 52, effort: 6 }) },
  { extension: 'webp', encode: (image) => image.webp({ quality: 80, effort: 5 }) },
]

async function ensureSource(sourcePath) {
  try {
    await access(sourcePath)
  }
  catch {
    throw new Error(`Image source not found: ${sourcePath}`)
  }
}

async function buildRecipe(recipe) {
  const sourcePath = resolve(root, recipe.source)
  await ensureSource(sourcePath)

  const metadata = await sharp(sourcePath).metadata()
  const sourceMtime = (await stat(sourcePath)).mtimeMs
  if (!metadata.width || !metadata.height) throw new Error(`Could not read image dimensions: ${recipe.source}`)

  const widths = [...new Set(recipe.widths)].sort((a, b) => a - b)
  const maxWidth = recipe.crop
    ? Math.floor(Math.min(metadata.width, metadata.height * recipe.crop.aspectRatio))
    : metadata.width
  const usableWidths = widths.filter((width) => width <= maxWidth)
  const skippedWidths = widths.filter((width) => width > maxWidth)

  if (skippedWidths.length) {
    console.warn(`${recipe.source}: skipped upscaling widths ${skippedWidths.join(', ')}px (usable source width is ${maxWidth}px)`)
  }

  await Promise.all(usableWidths.flatMap((width) => outputFormats.map(async ({ extension, encode }) => {
    const outputPath = resolve(root, `${recipe.outputStem}-${width}.${extension}`)
    try {
      const outputStat = await stat(outputPath)
      if (outputStat.size > 0 && outputStat.mtimeMs >= Math.max(sourceMtime, pipelineMtime)) return
    }
    catch {
      // Missing output: generate it below.
    }
    await mkdir(dirname(outputPath), { recursive: true })
    const resize = recipe.crop
      ? {
          width,
          height: Math.round(width / recipe.crop.aspectRatio),
          fit: 'cover',
          position: recipe.crop.position,
          withoutEnlargement: true,
        }
      : { width, withoutEnlargement: true }
    await encode(
      sharp(sourcePath)
        .rotate()
        .resize(resize),
    ).toFile(outputPath)
    console.log(`Generated ${recipe.outputStem}-${width}.${extension}`)
  })))
}

await Promise.all(imageRecipes.map(buildRecipe))
