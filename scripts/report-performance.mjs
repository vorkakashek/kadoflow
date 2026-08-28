import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const outputRoot = resolve(root, '.output/public')
const htmlPath = resolve(outputRoot, 'index.html')
const budgetsPath = resolve(root, 'performance-budgets.json')
const checking = process.argv.includes('--check')

if (!existsSync(htmlPath)) {
  console.error('Production output is missing. Run npm run build first.')
  process.exit(1)
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength
}

const html = readFileSync(htmlPath, 'utf8')
const urls = Array.from(
  html.matchAll(/<link\s+rel="modulepreload"[^>]+href="([^"]+)"/g),
  (match) => match[1],
)

const rows = []
for (const url of urls) {
  const path = resolve(outputRoot, url.replace(/^\//, ''))
  const bytes = readFileSync(path).byteLength
  rows.push({
    file: url,
    bytes,
    gzipBytes: gzipSize(path),
  })
}

const totals = rows.reduce(
  (acc, row) => ({
    bytes: acc.bytes + row.bytes,
    gzipBytes: acc.gzipBytes + row.gzipBytes,
  }),
  { bytes: 0, gzipBytes: 0 },
)
const largest = rows.reduce(
  (current, row) => (row.bytes > (current?.bytes ?? -1) ? row : current),
  null,
)

const assetUrls = Array.from(
  html.matchAll(/<link\s+rel="(?:stylesheet|preload)"[^>]+href="([^"]+)"/g),
  (match) => match[1],
).filter((url) => !url.startsWith('http'))
const criticalAssets = []
for (const url of new Set(assetUrls)) {
  const cleanUrl = url.split('?')[0]
  const path = resolve(outputRoot, cleanUrl.replace(/^\//, ''))
  if (!existsSync(path)) continue
  criticalAssets.push({ url, gzipBytes: gzipSize(path) })
}
const fontRoot = resolve(outputRoot, '_fonts')
const fontBytes = existsSync(fontRoot)
  ? readdirSync(fontRoot).reduce(
      (total, file) => total + readFileSync(resolve(fontRoot, file)).byteLength,
      0,
    )
  : 0
const htmlGzipBytes = gzipSync(Buffer.from(html), { level: 9 }).byteLength
const criticalTransferBytes =
  htmlGzipBytes
  + totals.gzipBytes
  + criticalAssets.reduce((total, asset) => total + asset.gzipBytes, 0)
  + fontBytes

console.table(
  rows.map((row) => ({
    file: row.file,
    minifiedKB: (row.bytes / 1024).toFixed(1),
    gzipKB: (row.gzipBytes / 1024).toFixed(1),
  })),
)
console.log(`Initial modulepreloads: ${rows.length}`)
console.log(`Initial JS: ${(totals.bytes / 1024).toFixed(1)} KB minified / ${(totals.gzipBytes / 1024).toFixed(1)} KB gzip`)
console.log(`Largest initial chunk: ${largest ? `${largest.file} (${(largest.bytes / 1024).toFixed(1)} KB)` : 'none'}`)
console.log(`Prerendered HTML: ${(readFileSync(htmlPath).byteLength / 1024).toFixed(1)} KB`)
console.log(`Estimated critical transfer: ${(criticalTransferBytes / 1024).toFixed(1)} KB gzip/WOFF2`)

if (checking) {
  const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'))
  const failures = []
  if (totals.gzipBytes > budgets.criticalJsGzipBytes) {
    failures.push(`initial JS gzip ${totals.gzipBytes} B exceeds ${budgets.criticalJsGzipBytes} B`)
  }
  if (largest && largest.bytes > budgets.largestInitialChunkBytes) {
    failures.push(`largest initial chunk ${largest.bytes} B exceeds ${budgets.largestInitialChunkBytes} B`)
  }
  if (criticalTransferBytes > budgets.criticalTransferBytes) {
    failures.push(
      `estimated critical transfer ${criticalTransferBytes} B exceeds ${budgets.criticalTransferBytes} B`,
    )
  }
  if (
    totals.gzipBytes
    > budgets.baselineCriticalJsGzipBytes + budgets.criticalJsGrowthBytes
  ) {
    failures.push(
      `initial JS grew more than ${budgets.criticalJsGrowthBytes} B over the accepted baseline`,
    )
  }
  if (failures.length) {
    for (const failure of failures) console.error(`Performance budget failed: ${failure}`)
    process.exit(1)
  }
  console.log('Performance budgets passed.')
}
