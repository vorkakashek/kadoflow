<script setup lang="ts">
import { flowSurfaceMask, registerFlowSurfacePathFlush } from '~/composables/useFlowSurfaceMask'
import { isAppleTouchDevice, isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

/**
 * Flow Surface — convex panel + clip mask.
 * Soft dent travels the perimeter; cursor adds the same inward push on hover
 * when `flowSurfaceMask.pointerInteractive` is true (hero rest only).
 * Hover also pulls edge samples 15% toward fillet corners (and lets bend reach
 * 15% closer to those corners via a shorter fade).
 */
const props = withDefaults(
  defineProps<{
    mode?: 'window' | 'panel'
    toneClass?: string
    paintFill?: boolean
  }>(),
  {
    mode: 'panel',
    toneClass: 'bg-stone',
    paintFill: true,
  },
)

const root = ref<HTMLElement | null>(null)
const clipEl = ref<HTMLElement | null>(null)
const pathD = ref('')
const size = reactive({ w: 1, h: 1 })
/** Tiled film grain — static PNG (no SVG feTurbulence; that tanks WebKit FPS). */
const GRAIN_TILE = '/textures/grain-tile.png'
/** Smaller tile = finer flecks. */
const grainTilePx = ref(72)
const grainEl = ref<HTMLElement | null>(null)
const GRAIN_OPACITY = 0.22
/** Discrete tile offset rate — hard jumps, not eased drift. */
const GRAIN_STEP_MS = 120

function applyClipToDom(clip: string) {
  const el = clipEl.value
  if (!el) return
  if (!clip) {
    el.style.clipPath = ''
    el.style.removeProperty('-webkit-clip-path')
    return
  }
  el.style.clipPath = clip
  el.style.setProperty('-webkit-clip-path', clip)
}

function setMaskPath(d: string) {
  if (d) pathD.value = d
  flowSurfaceMask.path = d
  const clip = d ? `path('${d}')` : ''
  flowSurfaceMask.clipPath = clip
  applyClipToDom(clip)
}

/** viewBox basis — frozen during mobile morph so the path stretches with the box. */
const pathView = reactive({ w: 1, h: 1 })

/** Touch / narrow UI — no living edge response (pointer dent + roam). */
function isTouchUi() {
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

let ro: ResizeObserver | null = null
let raf = 0
let grainTimer = 0
let motionQuery: MediaQueryList | null = null
let pointer: { x: number; y: number } | null = null
let softPointer: { x: number; y: number; str: number } = { x: 0, y: 0, str: 0 }

const RADIUS = 12
/** Outward edge bow depth (px at full-size surface). */
const CONVEX = 11
/** Target spacing between edge samples — count scales with edge length */
const EDGE_SAMPLE_PX = 12
const EDGE_SAMPLES_MIN = 6
const EDGE_SAMPLES_MAX = 220
/** Cursor dent depth (px, inward) at full-size surface */
const POINTER_DENT = 22
/** Influence radius — wide soft push, not a pimple */
const POINTER_RADIUS = 400
/** Gaussian sigma as fraction of radius (higher = flatter/wider hill) */
const POINTER_SIGMA = 0.58
/** Traveling hover-like dent around the perimeter (full-size) */
const ROAM_DENT = 14
/** Revolutions per second */
const ROAM_SPEED = 0.1125
/** Roaming lobe width as fraction of full perimeter (wider = softer traveling wave) */
const ROAM_SIGMA_FRAC = 0.16
/** Clamp lobe width so tiny panels stay readable */
const ROAM_SIGMA_PX_MIN = 120
const ROAM_SIGMA_PX_MAX = 340
/** Long soft run-up to immutable corners — short fade makes a crease */
const CORNER_FADE_PX = 180
/** Extra depth toward edge mid */
const CENTER_GAIN = 0.28
/** Catmull tension divisor — higher = less overshoot / fewer creases */
const SPLINE_TENSION = 32
/**
 * Min side length at which bend amplitudes are 1×.
 * Smaller surfaces scale dents down so corners stay clean.
 */
const BEND_REF_MIN = 520
const BEND_SCALE_FLOOR = 0.25
/** Final Kado state keeps motion, but at a much lower amplitude */
const KADO_BEND_SCALE = 0.32
/** Minimum protected part at each edge end — lower = bow reaches farther (wider). */
const CORNER_FADE_MIN_U = 0.2
/** How many samples at each end blend hard toward the rest anchors */
const END_BLEND_SAMPLES = 7
/**
 * Hover: pull living edge samples toward fillet corners, and shorten the
 * corner fade so bend lives 15% closer to those anchors.
 */
const HOVER_CORNER_PULL = 0.15
/**
 * Bow shape exponent on sin(πu). <1 flattens the hump → wider edge bend.
 */
const BOW_WIDEN = 0.58
/** Cap bow vs panel size (was 0.03 — choked the stronger convex). */
const CONVEX_SIZE_FRAC = 0.045
type Pt = { x: number; y: number }
type EdgeName = 'top' | 'right' | 'bottom' | 'left'
type BendAmp = {
  scale: number
  convex: number
  pointerDent: number
  roamDent: number
  roamSigmaFrac: number
  cornerFadePx: number
  pointerRadius: number
}

let animStart = 0
/** Roam phase frozen while host owns morph — path only tracks box size. */
let frozenRoamT = 0
/** Mobile morph stretch: keep one path, scale via viewBox ≠ size. */
let stretchMorph = false
/** Frozen path d for SVG during stretch; CSS clip gets a scaled copy. */
let stretchPathD = ''

function bendAmpFor(w: number, h: number): BendAmp {
  const scale = Math.min(1, Math.max(BEND_SCALE_FLOOR, Math.min(w, h) / BEND_REF_MIN))
  const morph = Math.min(1, Math.max(0, flowSurfaceMask.morph))
  const stateScale = 1 - morph * (1 - KADO_BEND_SCALE)
  const bendScale = scale * stateScale
  // Mobile: static silhouette — living dents were fighting scroll on Android.
  const touch = isTouchUi()
  return {
    scale,
    convex: CONVEX * bendScale,
    pointerDent: touch ? 0 : POINTER_DENT * bendScale,
    roamDent: touch ? 0 : ROAM_DENT * bendScale,
    // Keep wave relatively wide even on small surfaces
    roamSigmaFrac: ROAM_SIGMA_FRAC * Math.max(0.75, scale),
    // Longer fade on small panels so the corner approach stays soft
    cornerFadePx: Math.max(CORNER_FADE_PX * 0.9, CORNER_FADE_PX * scale),
    pointerRadius: POINTER_RADIUS * Math.max(0.35, scale),
  }
}

/** Sample count proportional to edge length (constant px density). */
function sampleCount(lengthPx: number) {
  const morphing =
    !flowSurfaceMask.pointerInteractive
    && flowSurfaceMask.morph > 0.01
    && flowSurfaceMask.morph < 0.99
  // Coarser silhouette while the box is scrubbing — fewer Catmull segments.
  const spacing = morphing ? EDGE_SAMPLE_PX * 2.2 : EDGE_SAMPLE_PX
  const n = Math.round(lengthPx / spacing)
  return Math.min(EDGE_SAMPLES_MAX, Math.max(EDGE_SAMPLES_MIN, n))
}

/**
 * Catmull-ish through points. Optional start/end dirs keep the join into the
 * fixed corner cubics C¹ (no crease where edge meets fillet).
 */
function smoothThrough(pts: Pt[], startDir?: Pt, endDir?: Pt): string {
  if (pts.length < 2) return ''
  const parts: string[] = []
  const k = SPLINE_TENSION
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1

    let p0: Pt
    if (i === 0 && startDir) {
      p0 = { x: p1.x - startDir.x * seg, y: p1.y - startDir.y * seg }
    } else {
      p0 = pts[Math.max(0, i - 1)]
    }

    let p3: Pt
    if (i === pts.length - 2 && endDir) {
      p3 = { x: p2.x + endDir.x * seg, y: p2.y + endDir.y * seg }
    } else {
      p3 = pts[Math.min(pts.length - 1, i + 2)]
    }

    const c1x = p1.x + (p2.x - p0.x) / k
    const c1y = p1.y + (p2.y - p0.y) / k
    const c2x = p2.x - (p3.x - p1.x) / k
    const c2y = p2.y - (p3.y - p1.y) / k
    parts.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`)
  }
  return parts.join(' ')
}

function smootherstep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Soft pin: the flank toward each corner stays nearly flat much longer,
 * then eases in — this is what removes the crease into the fillet.
 */
function cornerPinAt(u: number, spanPx: number, fadePx: number) {
  const fadeU = Math.min(0.5, Math.max(CORNER_FADE_MIN_U, fadePx / Math.max(spanPx, 1)))
  const endDist = Math.min(u, 1 - u)
  if (endDist >= fadeU) return 1
  if (endDist <= 0 || fadeU <= 0) return 0
  const t = smootherstep(endDist / fadeU)
  // Stay suppressed near the corner; only the outer half of the fade recovers
  return t * t * t
}

function circDist01(a: number, b: number) {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

/** Inward dent from cursor */
function pointerDent(x: number, y: number, amp: BendAmp) {
  if (softPointer.str < 0.01) return 0
  const dx = x - softPointer.x
  const dy = y - softPointer.y
  const dist = Math.hypot(dx, dy)
  const sigma = amp.pointerRadius * POINTER_SIGMA
  const lobe = Math.exp(-(dist * dist) / (2 * sigma * sigma))
  return lobe * softPointer.str * amp.pointerDent
}

/**
 * Soft traveling lobe — raised-cosine shoulders, not a sharp gaussian peak.
 * One primary pulse only (a second opposite pulse was adding kinks).
 */
function roamDent(s: number, t: number, perimeterPx: number, amp: BendAmp) {
  const sigmaPx = Math.min(
    ROAM_SIGMA_PX_MAX,
    Math.max(ROAM_SIGMA_PX_MIN, perimeterPx * amp.roamSigmaFrac),
  )
  const radius = Math.max(0.05, (sigmaPx * 2.2) / Math.max(perimeterPx, 1))
  const center = ((t * ROAM_SPEED) % 1 + 1) % 1
  const d = circDist01(s, center)
  if (d >= radius) return 0
  // Raised cosine: flat-ish top, soft flanks — no pointed crest
  const lobe = 0.5 + 0.5 * Math.cos((Math.PI * d) / radius)
  return lobe * lobe * amp.roamDent
}

function edgeSpans(w: number, h: number, r: number, topBleed: number) {
  const y0span = Math.max(1, h + topBleed - 2 * r)
  const xSpan = Math.max(1, w - 2 * r)
  const corner = (Math.PI / 2) * r
  const total = 2 * xSpan + 2 * y0span + 4 * corner
  return {
    top: xSpan,
    right: y0span,
    bottom: xSpan,
    left: y0span,
    corner,
    total,
    // cumulative start s for each edge (0..1)
    sTop: 0,
    sRight: (xSpan + corner) / total,
    sBottom: (xSpan + corner + y0span + corner) / total,
    sLeft: (2 * xSpan + 2 * corner + y0span) / total,
  }
}

/**
 * Sample a convex edge, then apply roaming + cursor inward dents.
 * u 0→1 along the edge between fillets.
 * On hover, samples ease toward the nearer fillet corner (HOVER_CORNER_PULL).
 */
function sampleConvexEdge(
  edge: EdgeName,
  w: number,
  h: number,
  r: number,
  convex: number,
  topBleed: number,
  t: number,
  amp: BendAmp,
): Pt[] {
  const y0 = -topBleed
  const usableH = h + topBleed
  const spans = edgeSpans(w, h, r, topBleed)
  const span = edge === 'top' || edge === 'bottom' ? spans.top : spans.right
  const s0
    = edge === 'top'
      ? spans.sTop
      : edge === 'right'
        ? spans.sRight
        : edge === 'bottom'
          ? spans.sBottom
          : spans.sLeft
  const n = sampleCount(span)
  const pts: Pt[] = []

  // Fillet anchors for this edge (immutable join points)
  let anchorA: Pt
  let anchorB: Pt
  if (edge === 'top') {
    anchorA = { x: r, y: y0 }
    anchorB = { x: w - r, y: y0 }
  } else if (edge === 'right') {
    anchorA = { x: w, y: y0 + r }
    anchorB = { x: w, y: y0 + usableH - r }
  } else if (edge === 'bottom') {
    anchorA = { x: w - r, y: h }
    anchorB = { x: r, y: h }
  } else {
    anchorA = { x: 0, y: y0 + usableH - r }
    anchorB = { x: 0, y: y0 + r }
  }

  // Let living bend reach closer to corners while the cursor is engaged
  const hover = softPointer.str
  const fadePx = amp.cornerFadePx * (1 - HOVER_CORNER_PULL * hover)
  const cornerPull = HOVER_CORNER_PULL * hover

  for (let i = 0; i <= n; i++) {
    const u = i / n
    const cornerPin = cornerPinAt(u, span, fadePx)
    // Kill outward bow near corners — otherwise Catmull + tip = ear spike.
    // BOW_WIDEN < 1 → flatter/wider lobe than plain sin.
    const bow
      = Math.pow(Math.sin(Math.PI * u), BOW_WIDEN) * convex * cornerPin
    const midBoost = 1 + CENTER_GAIN * Math.sin(Math.PI * u)
    const s = s0 + (u * span) / spans.total

    let x = 0
    let y = 0
    let nx = 0
    let ny = 0

    if (edge === 'top') {
      x = r + span * u
      y = y0 - bow
      nx = 0
      ny = 1
    } else if (edge === 'right') {
      x = w + bow
      y = y0 + r + span * u
      nx = -1
      ny = 0
    } else if (edge === 'bottom') {
      x = w - r - span * u
      y = h + bow
      nx = 0
      ny = -1
    } else {
      x = -bow
      y = y0 + usableH - r - span * u
      nx = 1
      ny = 0
    }

    const cursorDent = pointerDent(x, y, amp)
    const idleDent = roamDent(s, t, spans.total, amp)
    // Both reactions stay visible, but do not stack linearly into a sharp peak.
    const dent = Math.hypot(cursorDent, idleDent) * cornerPin * midBoost
    let px = x + nx * dent
    let py = y + ny * dent

    if (cornerPull > 0.001) {
      const corner = u < 0.5 ? anchorA : anchorB
      px += (corner.x - px) * cornerPull
      py += (corner.y - py) * cornerPull
    }

    pts.push({ x: px, y: py })
  }
  return pts
}

/** Pull the last few samples onto the rest anchors so the fillet join stays flat */
function pinEdgeEnds(pts: Pt[], a: Pt, b: Pt) {
  const n = pts.length
  if (n < 3) {
    pts[0] = a
    pts[n - 1] = b
    return
  }
  const blend = Math.min(END_BLEND_SAMPLES, Math.floor((n - 1) / 2))
  pts[0] = a
  pts[n - 1] = b
  for (let i = 1; i <= blend; i++) {
    // Keep near-corner samples almost on the rest edge; recover only late
    const t = smootherstep(i / (blend + 1)) ** 2
    const fromA = pts[i]
    const fromB = pts[n - 1 - i]
    const u = i / (n - 1)
    const restA = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
    const restB = {
      x: a.x + (b.x - a.x) * (1 - u),
      y: a.y + (b.y - a.y) * (1 - u),
    }
    pts[i] = {
      x: restA.x + (fromA.x - restA.x) * t,
      y: restA.y + (fromA.y - restA.y) * t,
    }
    pts[n - 1 - i] = {
      x: restB.x + (fromB.x - restB.x) * t,
      y: restB.y + (fromB.y - restB.y) * t,
    }
  }
}

function buildPath(w: number, h: number, topBleed = 0, t = 0) {
  const amp = bendAmpFor(w, h)
  const r = Math.min(RADIUS * Math.max(0.55, amp.scale), w / 2, h / 2)
  const convex = Math.min(
    amp.convex,
    w * CONVEX_SIZE_FRAC * amp.scale,
    h * CONVEX_SIZE_FRAC * amp.scale,
  )

  // Living silhouette always in fill space. openTop keeps the same corners/sides
  // and only adds a flat lid above for hero media — no second corner radius.
  const top = sampleConvexEdge('top', w, h, r, convex, 0, t, amp)
  const right = sampleConvexEdge('right', w, h, r, convex, 0, t, amp)
  const bottom = sampleConvexEdge('bottom', w, h, r, convex, 0, t, amp)
  const left = sampleConvexEdge('left', w, h, r, convex, 0, t, amp)

  const topA = { x: r, y: 0 }
  const topB = { x: w - r, y: 0 }
  const rightA = { x: w, y: r }
  const rightB = { x: w, y: h - r }
  const bottomA = { x: w - r, y: h }
  const bottomB = { x: r, y: h }
  const leftA = { x: 0, y: h - r }
  const leftB = { x: 0, y: r }

  pinEdgeEnds(top, topA, topB)
  pinEdgeEnds(right, rightA, rightB)
  pinEdgeEnds(bottom, bottomA, bottomB)
  pinEdgeEnds(left, leftA, leftB)

  const k = 0.5522847498307936
  const kr = k * r
  const tr = `C ${w - r + kr} 0 ${w} ${r - kr} ${rightA.x} ${rightA.y}`
  const br = `C ${w} ${h - r + kr} ${w - r + kr} ${h} ${bottomA.x} ${bottomA.y}`
  const bl = `C ${r - kr} ${h} 0 ${h - r + kr} ${leftA.x} ${leftA.y}`
  const tl = `C 0 ${r - kr} ${r - kr} 0 ${topA.x} ${topA.y}`

  const sides = [
    tr,
    smoothThrough(right, { x: 0, y: 1 }, { x: 0, y: 1 }),
    br,
    smoothThrough(bottom, { x: -1, y: 0 }, { x: -1, y: 0 }),
    bl,
    smoothThrough(left, { x: 0, y: -1 }, { x: 0, y: -1 }),
    tl,
  ].join(' ')

  if (topBleed <= 0.5) {
    return [
      `M ${topA.x} ${topA.y}`,
      smoothThrough(top, { x: 1, y: 0 }, { x: 1, y: 0 }),
      sides,
      'Z',
    ].join(' ')
  }

  const yBleed = -topBleed
  return [
    `M ${topA.x} ${yBleed}`,
    `L ${topB.x} ${yBleed}`,
    `L ${topB.x} ${topB.y}`,
    sides,
    `L ${topA.x} ${yBleed}`,
    'Z',
  ].join(' ')
}

function publish(
  t = (performance.now() - animStart) / 1000,
  box?: { top: number; left: number; width: number; height: number },
) {
  const el = root.value

  // Prefer host morph box (same numbers as applyBox). During morph the host owns
  // geometry — don't let a later rAF overwrite it with a lagged client rect.
  let w: number
  let h: number
  let top: number
  let left: number

  if (box) {
    w = Math.max(1, box.width)
    h = Math.max(1, box.height)
    top = box.top
    left = box.left
  } else if (!flowSurfaceMask.pointerInteractive && flowSurfaceMask.width > 2) {
    w = flowSurfaceMask.width
    h = flowSurfaceMask.height
    top = flowSurfaceMask.top
    left = flowSurfaceMask.left
  } else if (el) {
    const rect = el.getBoundingClientRect()
    w = Math.max(1, rect.width)
    h = Math.max(1, rect.height)
    top = rect.top
    left = rect.left
  } else {
    return
  }

  if (w < 2 || h < 2) return

  const morph = flowSurfaceMask.morph
  const interactive = flowSurfaceMask.pointerInteractive
  const mobile = isNarrowViewport() || isCoarsePointer()
  const midMorph = !interactive && morph > 0.02 && morph < 0.98

  // Mobile morph: freeze silhouette. Host scales the frame via CSS transform —
  // do NOT rewrite path coords (that desyncs window clip from the basis box).
  if (mobile && midMorph) {
    if (!stretchMorph) {
      stretchMorph = true
      pathView.w = size.w > 1 ? size.w : w
      pathView.h = size.h > 1 ? size.h : h
      stretchPathD = pathD.value
    }
    size.w = w
    size.h = h
    flowSurfaceMask.top = top
    flowSurfaceMask.left = left
    flowSurfaceMask.width = w
    flowSurfaceMask.height = h
    flowSurfaceMask.openTopPath = ''
    const frozen = stretchPathD || pathD.value
    if (frozen) setMaskPath(frozen)
    return
  }

  stretchMorph = false
  stretchPathD = ''

  // Path is local to the box — if only the box moved, keep the same d.
  if (
    !interactive
    && pathD.value
    && Math.abs(w - size.w) < 0.5
    && Math.abs(h - size.h) < 0.5
  ) {
    flowSurfaceMask.top = top
    flowSurfaceMask.left = left
    flowSurfaceMask.width = w
    flowSurfaceMask.height = h
    return
  }

  size.w = w
  size.h = h
  pathView.w = w
  pathView.h = h

  let roamT = t
  if (interactive) {
    frozenRoamT = t
  } else {
    roamT = frozenRoamT
  }

  const fill = buildPath(w, h, 0, roamT)
  pathD.value = fill
  // Width/height BEFORE path — watchers that freeze hero clip read size with the path.
  flowSurfaceMask.openTopPath = ''
  flowSurfaceMask.width = w
  flowSurfaceMask.height = h
  flowSurfaceMask.top = top
  flowSurfaceMask.left = left
  setMaskPath(fill)
}

function tick(now: number) {
  raf = 0

  // Host owns path during morph / kado rest — continuous rebuild here doubles
  // CPU and heats phones. Roam dent only runs at hero rest.
  if (!flowSurfaceMask.pointerInteractive) {
    pointer = null
    softPointer.str = 0
    return
  }

  const targetStr = pointer ? 1 : 0
  softPointer.str += (targetStr - softPointer.str) * 0.12
  if (pointer) {
    softPointer.x += (pointer.x - softPointer.x) * 0.18
    softPointer.y += (pointer.y - softPointer.y) * 0.18
  } else if (softPointer.str < 0.002) {
    softPointer.str = 0
  }

  publish((now - animStart) / 1000)
  raf = requestAnimationFrame(tick)
}

function ensureLoop() {
  // Touch UI: static edges — no per-frame path rebuild for roam/pointer.
  if (isTouchUi()) return
  if (!flowSurfaceMask.pointerInteractive) return
  if (!raf) raf = requestAnimationFrame(tick)
}

function measure() {
  const el = root.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nextW = Math.max(1, rect.width)
  const nextH = Math.max(1, rect.height)
  if (Math.abs(nextW - size.w) < 0.5 && Math.abs(nextH - size.h) < 0.5) return
  size.w = nextW
  size.h = nextH
  publish()
}

function onPointer(e: PointerEvent) {
  if (!flowSurfaceMask.pointerInteractive || e.pointerType !== 'mouse' || !root.value) {
    pointer = null
    return
  }
  const rect = root.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pad = bendAmpFor(rect.width, rect.height).pointerRadius
  if (x < -pad || y < -pad || x > rect.width + pad || y > rect.height + pad) {
    pointer = null
    return
  }
  pointer = { x, y }
  ensureLoop()
}

function onPointerLeave() {
  pointer = null
  ensureLoop()
}

function syncGrainScale() {
  grainTilePx.value = isNarrowViewport() ? 56 : 72
  const el = grainEl.value
  if (el) el.style.backgroundSize = `${grainTilePx.value}px ${grainTilePx.value}px`
}

function stepGrainOffset() {
  const el = grainEl.value
  if (!el) return
  const t = grainTilePx.value
  // Direct DOM write — no Vue/SVG invalidation (that was the hitch).
  el.style.backgroundPosition = `${Math.floor(Math.random() * t)}px ${Math.floor(Math.random() * t)}px`
}

function syncGrainMotion() {
  if (grainTimer) {
    window.clearInterval(grainTimer)
    grainTimer = 0
  }
  const el = grainEl.value
  if (motionQuery?.matches) {
    if (el) el.style.backgroundPosition = '0 0'
    return
  }
  // Mid-morph: freeze — don't fight scroll/morph compositing.
  if (flowSurfaceMask.morph > 0.02 && flowSurfaceMask.morph < 0.98) {
    return
  }
  stepGrainOffset()
  grainTimer = window.setInterval(stepGrainOffset, GRAIN_STEP_MS)
}

onMounted(async () => {
  await nextTick()
  animStart = performance.now()
  measure()
  publish(0)
  registerFlowSurfacePathFlush((box) => publish(undefined, box))
  // clipEl is mounted with mode=window — re-apply if publish raced ahead of the ref.
  applyClipToDom(flowSurfaceMask.clipPath)
  ensureLoop()

  // Resume roam when morph returns to hero rest.
  watch(
    () => flowSurfaceMask.pointerInteractive,
    (interactive) => {
      if (interactive) ensureLoop()
    },
  )

  ro = new ResizeObserver(() => measure())
  if (root.value) ro.observe(root.value)

  syncGrainScale()
  window.addEventListener('resize', syncGrainScale, { passive: true })

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  await nextTick()
  syncGrainMotion()
  motionQuery.addEventListener('change', syncGrainMotion)

  // Pause / resume grain flicker with morph corridor.
  watch(
    () => flowSurfaceMask.morph > 0.02 && flowSurfaceMask.morph < 0.98,
    () => {
      syncGrainMotion()
    },
  )

  // Cursor / touch dent — desktop mouse only. On Android this was still wired and
  // fought the scroll transition; touch UI keeps a static edge silhouette.
  if (!isTouchUi()) {
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })
  }
})

onUnmounted(() => {
  registerFlowSurfacePathFlush(null)
  window.removeEventListener('resize', syncGrainScale)
  cancelAnimationFrame(raf)
  raf = 0
  if (grainTimer) {
    window.clearInterval(grainTimer)
    grainTimer = 0
  }
  motionQuery?.removeEventListener('change', syncGrainMotion)
  motionQuery = null
  ro?.disconnect()
  window.removeEventListener('pointermove', onPointer)
  window.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <div
    ref="root"
    class="flow-surface absolute inset-0 size-full overflow-visible pointer-events-none"
    :aria-hidden="props.mode === 'panel' ? 'true' : undefined"
  >
    <div
      v-if="props.mode === 'window'"
      ref="clipEl"
      class="absolute inset-0"
    >
      <div class="absolute inset-0" :class="props.toneClass" />
      <div
        ref="grainEl"
        class="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        :style="{
          backgroundImage: `url(${GRAIN_TILE})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${grainTilePx}px ${grainTilePx}px`,
          backgroundPosition: '0 0',
          opacity: GRAIN_OPACITY,
          mixBlendMode: 'overlay',
          willChange: 'background-position',
        }"
      />
      <div class="pointer-events-none absolute inset-0 z-10 min-h-0">
        <slot />
      </div>
    </div>

    <div
      v-else-if="props.paintFill"
      ref="clipEl"
      class="absolute inset-0"
    >
      <div class="absolute inset-0" :class="props.toneClass" />
      <div
        ref="grainEl"
        class="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        :style="{
          backgroundImage: `url(${GRAIN_TILE})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${grainTilePx}px ${grainTilePx}px`,
          backgroundPosition: '0 0',
          opacity: GRAIN_OPACITY,
          mixBlendMode: 'overlay',
          willChange: 'background-position',
        }"
      />
    </div>
  </div>
</template>
