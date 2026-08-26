import { access, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import { imageRecipes } from './image-recipes.mjs'

const root = resolve(import.meta.dirname, '..')

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
  if (!metadata.width) throw new Error(`Could not read image width: ${recipe.source}`)

  const widths = [...new Set(recipe.widths)].sort((a, b) => a - b)
  const usableWidths = widths.filter((width) => width <= metadata.width)
  const skippedWidths = widths.filter((width) => width > metadata.width)

  if (skippedWidths.length) {
    console.warn(`${recipe.source}: skipped upscaling widths ${skippedWidths.join(', ')}px (source is ${metadata.width}px)`)
  }

  await Promise.all(usableWidths.flatMap((width) => outputFormats.map(async ({ extension, encode }) => {
    const outputPath = resolve(root, `${recipe.outputStem}-${width}.${extension}`)
    await mkdir(dirname(outputPath), { recursive: true })
    await encode(
      sharp(sourcePath)
        .rotate()
        .resize({ width, withoutEnlargement: true }),
    ).toFile(outputPath)
    console.log(`Generated ${recipe.outputStem}-${width}.${extension}`)
  })))
}

await Promise.all(imageRecipes.map(buildRecipe))
