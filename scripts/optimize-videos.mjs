import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'assets/source-media/video')
const scriptMtime = (await stat(new URL(import.meta.url))).mtimeMs

const recipes = [
  {
    source: 'home/cases/schmidt/main_1.mp4',
    output: 'public/home/cases/schmidt/main_1.mp4',
    filters: ["scale='min(1920,iw)':-2:flags=lanczos"],
  },
  {
    source: 'home/cases/schmidt/main_vertical.mp4',
    output: 'public/home/cases/schmidt/main_vertical.mp4',
    filters: [],
  },
]

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error?.code === 'ENOENT') {
    throw new Error('ffmpeg is required for videos:build but was not found in PATH')
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg exited with code ${result.status}`)
  }
}

async function optimize({ source, output, filters }) {
  const sourcePath = resolve(sourceRoot, source)
  const outputPath = resolve(root, output)
  const temporaryPath = `${outputPath}.building.mp4`
  const sourceStat = await stat(sourcePath)

  try {
    const outputStat = await stat(outputPath)
    if (
      outputStat.size > 0
      && outputStat.mtimeMs >= sourceStat.mtimeMs
      && outputStat.mtimeMs >= scriptMtime
    ) return
  }
  catch {
    // Missing output: generate it below.
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await rm(temporaryPath, { force: true })

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
    '-i', sourcePath,
    '-map_metadata', '-1',
    '-an',
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '21',
    '-profile:v', 'high',
    '-level', '4.2',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    temporaryPath,
  ]

  try {
    runFfmpeg(args)
    const generatedStat = await stat(temporaryPath)
    if (!generatedStat.size) throw new Error(`ffmpeg generated an empty file: ${output}`)
    await copyFile(temporaryPath, outputPath)
    console.log(
      `Generated ${output} (${(sourceStat.size / 1024 / 1024).toFixed(2)} MiB -> ${(generatedStat.size / 1024 / 1024).toFixed(2)} MiB)`,
    )
  }
  finally {
    await rm(temporaryPath, { force: true })
  }
}

for (const recipe of recipes) await optimize(recipe)
