#!/usr/bin/env node
/**
 * Generates piecewise clamp() CSS custom properties from design-tokens/responsive.json
 * plus derived 12-col grid tokens (content / column / span-N).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sourcePath = resolve(root, 'design-tokens/responsive.json')
const outPath = resolve(root, 'app/assets/css/fluid.generated.css')

const data = JSON.parse(readFileSync(sourcePath, 'utf8'))
const viewports = data.viewports
const tokens = data.tokens
const columns = data.grid?.columns ?? 12

function cssVarName(tokenKey) {
  return `--${tokenKey.replace(/\./g, '-')}`
}

const rootDecls = []
const mediaBlocks = new Map()

for (const [key, values] of Object.entries(tokens)) {
  if (!Array.isArray(values) || values.length !== viewports.length) {
    throw new Error(`Token ${key} must have ${viewports.length} values`)
  }
  const name = cssVarName(key)
  for (let i = 0; i < viewports.length - 1; i++) {
    const v1 = viewports[i]
    const v2 = viewports[i + 1]
    const s1 = values[i]
    const s2 = values[i + 1]
    const slope = (s2 - s1) / (v2 - v1)
    const intercept = s1 - slope * v1
    const slopeVw = slope * 100
    const formula = `clamp(${s1}px, calc(${intercept.toFixed(4)}px + ${slopeVw.toFixed(4)}vw), ${s2}px)`
    if (i === 0) {
      rootDecls.push(`  ${name}: ${formula};`)
    } else {
      if (!mediaBlocks.has(v1)) mediaBlocks.set(v1, [])
      mediaBlocks.get(v1).push(`    ${name}: ${formula};`)
    }
  }
}

const wide = viewports[viewports.length - 1]
let css = `/* Generated from design-tokens/responsive.json — do not edit by hand */\n`
css += `/* Control widths: ${viewports.join(' → ')}. Soft continue through ${wide}px. */\n\n`
css += `:root {\n${rootDecls.join('\n')}\n}\n\n`

for (const [bp, decls] of mediaBlocks) {
  css += `@media (min-width: ${bp}px) {\n  :root {\n${decls.join('\n')}\n  }\n}\n\n`
}

// Derived grid — always formulas over the fluid margin / gutter / content-max
const spanDecls = []
for (let n = 1; n <= columns; n++) {
  if (n === 1) {
    spanDecls.push(`  --layout-span-1: var(--layout-column);`)
  } else {
    spanDecls.push(
      `  --layout-span-${n}: calc(${n} * var(--layout-column) + ${n - 1} * var(--layout-gutter));`,
    )
  }
}

css += `/* ${columns}-col grid — derived (not breakpoint px tables) */\n`
css += `:root {\n`
css += `  --layout-columns: ${columns};\n`
css += `  --layout-content: min(var(--layout-content-max), calc(100vw - 2 * var(--layout-margin)));\n`
css += `  --layout-column: calc(\n`
css += `    (var(--layout-content) - (var(--layout-columns) - 1) * var(--layout-gutter))\n`
css += `    / var(--layout-columns)\n`
css += `  );\n`
css += `  /* Mobile copy/section inset — 3× edge margin; desktop = base margin. */\n`
css += `  --layout-margin-content: calc(3 * var(--layout-margin));\n`
css += `${spanDecls.join('\n')}\n`
css += `}\n\n`

css += `@media (min-width: 768px) {\n`
css += `  :root {\n`
css += `    --layout-margin-content: var(--layout-margin);\n`
css += `  }\n`
css += `}\n\n`

css += `/* Header ↔ hero: surface-top tracks header chrome (mobile logo −20%, inset −15%). */\n`
css += `:root {\n`
css += `  --layout-surface-top: calc(\n`
css += `    2 * var(--layout-header-inset) * 0.85\n`
css += `    + var(--layout-header-content) * 0.8\n`
css += `  );\n`
css += `}\n\n`

css += `@media (min-width: 768px) {\n`
css += `  :root {\n`
css += `    --layout-surface-top: calc(2 * var(--layout-header-inset) + var(--layout-header-content));\n`
css += `  }\n`
css += `}\n`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, css)
console.log(`Wrote ${outPath}`)
