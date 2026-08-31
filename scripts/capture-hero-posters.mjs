/**
 * Capture the Hero WebGL layer without interface copy for constrained-network posters.
 *
 * Usage (dev server already running):
 *   node scripts/capture-hero-posters.mjs
 *   node scripts/capture-hero-posters.mjs http://localhost:3000
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'home')
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '')

const DESKTOP = { width: 1440, height: 900, suffix: '' }
const MOBILE = { width: 390, height: 844, suffix: '-mobile' }
const variants = [DESKTOP, MOBILE]

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ channel: 'chrome', headless: true })

await mkdir(outDir, { recursive: true })

for (const variant of variants) {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    deviceScaleFactor: 1,
    isMobile: variant === MOBILE,
    // The lite renderer is also the safest poster source for constrained devices.
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('kf-preload-seen', '1')
    localStorage.setItem('kadoflow-motion', 'full')
    document.cookie = 'kado_motion_intro=1; Path=/; SameSite=Lax'
  })
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60_000 })
  const canvas = page.locator('.hero-swarm canvas')
  await canvas.waitFor({ state: 'visible', timeout: 20_000 })
  await page
    .waitForFunction(
      () => !document.querySelector('.hero-swarm')?.classList.contains('hero-swarm--cold'),
      null,
      { timeout: 12_000 },
    )
    .catch(() => {})
  await page.waitForTimeout(3200)

  await page.addStyleTag({
    content: `
      html, body { background: #d8d2c6 !important; }
      body * { visibility: hidden !important; }
      .hero-swarm, .hero-swarm * { visibility: visible !important; }
    `,
  })
  const png = await canvas.screenshot({ type: 'png' })
  const output = path.join(outDir, `hero-swarm-poster${variant.suffix}.webp`)
  const webp = await sharp(png).webp({ quality: 82, effort: 6 }).toBuffer()
  await writeFile(output, webp)
  console.log(`wrote ${path.relative(root, output)} (${webp.length} bytes)`)
  await context.close()
}

await browser.close()
