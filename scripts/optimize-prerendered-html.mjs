import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const outputRoot = resolve(process.cwd(), '.output/public')
const modulePreloadPattern = /<link\s+rel="modulepreload"[^>]*>\s*/g
const criticalStylesheetPattern = /<link\s+rel="stylesheet"\s+href="(\/_nuxt\/(?:entry\.[^"]+|navWaveHover\.[^"]+)\.css)"[^>]*>\s*/g
const entryModulePattern = /<script\s+type="module"\s+src="([^"]+)"[^>]*><\/script>/
const grainPreloadPattern = /<link\s+rel="preload"\s+as="image"\s+href="\/textures\/grain-tile-128\.avif"[^>]*>\s*/g
const grainUrlPattern = /url\((['"]?)(?:\/|\.\.\/)textures\/grain-tile-128\.avif\1\)/g
const grainBytes = await readFile(join(outputRoot, 'textures/grain-tile-128.avif'))
const grainDataUrl = `data:image/avif;base64,${grainBytes.toString('base64')}`
let optimized = 0
let removed = 0
let inlined = 0
let deferredEntries = 0
let embeddedGrainStyles = 0

async function writeCompressed(path, bytes) {
  await Promise.all([
    writeFile(path, bytes),
    writeFile(`${path}.gz`, gzipSync(bytes, { level: 9 })),
    writeFile(
      `${path}.br`,
      brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }),
    ),
  ])
}

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return visit(path)
    if (extname(entry.name) !== '.html') return

    const source = await readFile(path, 'utf8')
    const matches = source.match(modulePreloadPattern)
    let result = source.replace(modulePreloadPattern, '')
    const stylesheetMatches = [...result.matchAll(criticalStylesheetPattern)]
    for (const match of stylesheetMatches) {
      const css = await readFile(join(outputRoot, match[1].slice(1)), 'utf8')
      result = result.replace(match[0], `<style data-critical-css>${css}</style>`)
      inlined += 1
    }
    result = result
      .replace(grainPreloadPattern, '')
      .replace(grainUrlPattern, `url(${grainDataUrl})`)
      .replace(entryModulePattern, (_, src) => {
        deferredEntries += 1
        return `<script type="module">const start=()=>import(${JSON.stringify(src)});if(matchMedia('(max-width: 767px), (pointer: coarse)').matches){let ready;const boot=()=>ready??=start();addEventListener('click',e=>{const b=e.target.closest?.('button');if(!b){boot();return}e.preventDefault();boot().then(()=>requestAnimationFrame(()=>b.click()))},{once:true});addEventListener('keydown',boot,{once:true});setTimeout(()=>window.requestIdleCallback?requestIdleCallback(boot,{timeout:1000}):boot(),1200)}else start()</script>`
      })
    if (result === source) return
    const bytes = Buffer.from(result)
    await writeCompressed(path, bytes)
    optimized += 1
    removed += matches?.length ?? 0
  }))
}

const assetEntries = await readdir(join(outputRoot, '_nuxt'), { withFileTypes: true })
await Promise.all(assetEntries.map(async (entry) => {
  if (!entry.isFile() || extname(entry.name) !== '.css') return
  const path = join(outputRoot, '_nuxt', entry.name)
  const source = await readFile(path, 'utf8')
  const result = source.replace(grainUrlPattern, `url(${grainDataUrl})`)
  if (result === source) return
  await writeCompressed(path, Buffer.from(result))
  embeddedGrainStyles += 1
}))

await visit(outputRoot)
console.log(`Optimized ${optimized} prerendered HTML files; deferred ${removed} modulepreloads and ${deferredEntries} mobile entries; inlined ${inlined} critical stylesheets; embedded grain in ${embeddedGrainStyles} CSS assets.`)
