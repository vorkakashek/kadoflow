/**
 * Capture color + baked grayscale viewport shots for Page Canvas tiles.
 *
 * Usage (dev server already running):
 *   node scripts/capture-previews.mjs
 *   node scripts/capture-previews.mjs --bw-only   (bake *-bw.jpg from existing color shots)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'previews')
const args = process.argv.slice(2).filter((a) => a !== '--bw-only')
const bwOnly = process.argv.includes('--bw-only')
const base = (args[0] || 'http://localhost:3000').replace(/\/+$/, '')

const pages = [
  { id: 'home', path: '/' },
  { id: 'projects', path: '/projects' },
  { id: 'services', path: '/services' },
  { id: 'about', path: '/about' },
  { id: 'contact', path: '/contact' },
]

const { chromium } = await import('playwright-core')

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
await page.addInitScript(() => {
  localStorage.setItem('kf-preload-seen', '1')
})

await mkdir(outDir, { recursive: true })

async function writeBwFromColor(page, id, colorBuf) {
  const b64 = Buffer.from(colorBuf).toString('base64')
  await page.setContent(`<!doctype html>
<html><head><style>
  html,body{margin:0;width:1440px;height:900px;background:#111;overflow:hidden}
  img{width:1440px;height:900px;object-fit:cover;filter:grayscale(1)}
</style></head>
<body><img src="data:image/jpeg;base64,${b64}" alt=""></body></html>`)
  await page.waitForTimeout(80)
  const bwBuf = await page.screenshot({ type: 'jpeg', quality: 84, fullPage: false })
  const bwFile = path.join(outDir, `${id}-bw.jpg`)
  await writeFile(bwFile, bwBuf)
  console.log(`  wrote ${path.relative(root, bwFile)} (${bwBuf.length} bytes)`)
}

if (bwOnly) {
  for (const item of pages) {
    const colorFile = path.join(outDir, `${item.id}.jpg`)
    console.log(`bw from ${item.id}.jpg`)
    const buf = await readFile(colorFile)
    await writeBwFromColor(page, item.id, buf)
  }
  await browser.close()
  console.log('done')
  process.exit(0)
}

for (const item of pages) {
  const url = `${base}${item.path}`
  console.log(`capturing ${item.id} ← ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.addStyleTag({
    content: '.fps-meter { display: none !important; }',
  })
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('preload-lock'),
    null,
    { timeout: 20_000 },
  ).catch(() => {})
  if (item.id === 'home') {
    await page.waitForSelector('.hero-swarm canvas, .hero-title', { timeout: 12_000 }).catch(() => {})
    await page.waitForTimeout(1800)
  } else {
    await page.waitForTimeout(500)
  }
  const buf = await page.screenshot({ type: 'jpeg', quality: 84, fullPage: false })
  const colorFile = path.join(outDir, `${item.id}.jpg`)
  await writeFile(colorFile, buf)
  console.log(`  wrote ${path.relative(root, colorFile)} (${buf.length} bytes)`)

  await writeBwFromColor(page, item.id, buf)
}

await browser.close()
console.log('done')
