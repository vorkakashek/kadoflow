<script setup lang="ts">
import type {
  Flowmap,
  Mesh,
  OGLRenderingContext,
  Program,
  Renderer,
  Texture,
  Vec2,
} from 'ogl'

type WaveMedia = HTMLImageElement | HTMLVideoElement
type ClipAncestor = {
  element: HTMLElement
  x: boolean
  y: boolean
}
type PointerBounds = {
  left: number
  top: number
  width: number
  height: number
}

const canvasEl = ref<HTMLCanvasElement | null>(null)
const { active: detailTransitionActive } = useCaseDetailTransition()

const vertexShader = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;

  uniform vec4 uRect;
  uniform vec4 uVisibleUv;

  varying vec2 vUv;
  varying vec2 vMediaUv;

  void main() {
    vUv = uv;
    vMediaUv = uVisibleUv.xy + uv * uVisibleUv.zw;
    vec2 clipPosition = (uRect.xy + vMediaUv * uRect.zw) * 2.0 - 1.0;
    gl_Position = vec4(clipPosition, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tImage;
  uniform sampler2D tFlow;
  uniform vec2 uUvScale;
  uniform vec4 uVisibleUv;

  varying vec2 vUv;
  varying vec2 vMediaUv;

  void main() {
    // OGL's fullscreen Triangle deliberately extends its UVs to 2.0. The
    // shared layer maps that triangle into the media rectangle, so discard
    // the overscan before sampling or it appears as diagonal image shards.
    if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;

    vec3 flow = texture2D(tFlow, vUv).rgb;
    float energy = smoothstep(0.015, 0.62, flow.b);

    float primaryWave = sin(vUv.y * 25.0 + vUv.x * 1.4);
    float secondaryWave = sin(vUv.y * 11.0 - vUv.x * 2.2 + 0.8);
    float fold = (primaryWave * 0.7 + secondaryWave * 0.3) * energy;

    vec2 displacedUv = vMediaUv;
    displacedUv.x += (flow.r * 0.068 + fold * 0.024) * uVisibleUv.z;
    displacedUv.y += (flow.g * 0.03 + cos(vUv.y * 17.0) * energy * 0.005) * uVisibleUv.w;
    vec2 textureUv = (displacedUv - 0.5) * uUvScale + 0.5;

    vec4 baseColor = texture2D(tImage, textureUv);
    vec2 flowDirection = flow.rg / max(length(flow.rg), 0.0001);
    vec2 chromaOffset = (flowDirection * energy * 0.009
      + vec2(fold * 0.0045, 0.0)) * uVisibleUv.zw;
    vec3 splitColor = vec3(
      texture2D(tImage, textureUv + chromaOffset).r,
      baseColor.g,
      texture2D(tImage, textureUv - chromaOffset).b
    );
    float chromaMix = smoothstep(0.045, 0.42, energy) * 0.88;
    baseColor.rgb = mix(baseColor.rgb, splitColor, chromaMix);

    gl_FragColor = baseColor;
  }
`

let scopeEl: HTMLElement | null = null
let mediaQuery: MediaQueryList | null = null
let renderer: Renderer | null = null
let gl: OGLRenderingContext | null = null
let mediaTexture: Texture | null = null
let mediaProgram: Program | null = null
let mediaMesh: Mesh | null = null
let trailMap: Flowmap | null = null
let pointer: Vec2 | null = null
let uvScale: Vec2 | null = null
let rectUniform: Float32Array | null = null
let visibleUvUniform: Float32Array | null = null
let activeMedia: WaveMedia | null = null
let hoveredMedia: WaveMedia | null = null
let currentTextureKey: string | WaveMedia | null = null
let activeClipAncestors: ClipAncestor[] = []
let hoveredClipAncestors: ClipAncestor[] = []
let activePointerBounds: PointerBounds | null = null
let animationFrame = 0
let initialization: Promise<void> | null = null
let activationId = 0
let lastFrameTime = 0
let targetPointerX = 0.5
let targetPointerY = 0.5
let previousPointerX = 0.5
let previousPointerY = 0.5
let flowVelocityX = 0
let flowVelocityY = 0
let trailEnergy = 0
let hoverTarget = 0
let stopTransitionWatch: (() => void) | null = null
const motionStateCache = new WeakMap<WaveMedia, { checkedAt: number, stable: boolean }>()

function isIdentityTransform(transform: string) {
  if (!transform || transform === 'none') return true
  try {
    const matrix = new DOMMatrixReadOnly(transform)
    const values = [
      matrix.m11, matrix.m12, matrix.m13, matrix.m14,
      matrix.m21, matrix.m22, matrix.m23, matrix.m24,
      matrix.m31, matrix.m32, matrix.m33, matrix.m34,
      matrix.m41, matrix.m42, matrix.m43, matrix.m44,
    ]
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    return values.every((value, index) => Math.abs(value - identity[index]!) < 0.001)
  } catch {
    return false
  }
}

function isMediaMotionStable(media: WaveMedia) {
  if (detailTransitionActive.value || scopeEl?.classList.contains('case-detail--entering')) return false

  const now = performance.now()
  const cached = motionStateCache.get(media)
  if (cached && now - cached.checkedAt < 50) return cached.stable

  const revealHost = media.closest<HTMLElement>('[data-case-reveal]')
    ?? media.closest<HTMLElement>('.case-detail__first-screen .case-detail__media')
  if (!revealHost) {
    motionStateCache.set(media, { checkedAt: now, stable: true })
    return true
  }

  const styles = getComputedStyle(revealHost)
  // Some reveal targets are the <img> itself. Its computed opacity is forced
  // to zero while the canvas substitutes it, so read GSAP's live inline value
  // in that one case instead of mistaking our own hiding class for a reveal.
  const revealOpacity = revealHost === activeMedia && revealHost.classList.contains('case-wave-media-active')
    ? Number.parseFloat(revealHost.style.opacity || '1')
    : Number.parseFloat(styles.opacity)
  const stable = styles.visibility !== 'hidden'
    && revealOpacity >= 0.999
    && isIdentityTransform(styles.transform)
  motionStateCache.set(media, { checkedAt: now, stable })
  return stable
}

function isEligibleMedia(element: Element | null): element is WaveMedia {
  if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement)) return false
  return !element.hasAttribute('data-wave-disabled')
}

function findMedia(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const media = target.closest('img, video')
  return media && scopeEl?.contains(media) && isEligibleMedia(media) ? media : null
}

function mediaDimensions(media: WaveMedia) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight }
  }
  return { width: media.naturalWidth, height: media.naturalHeight }
}

function textureKey(media: WaveMedia) {
  return media instanceof HTMLImageElement ? (media.currentSrc || media.src) : media
}

function collectClipAncestors(media: WaveMedia) {
  const ancestors: ClipAncestor[] = []
  let parent = media.parentElement
  while (parent && parent !== scopeEl) {
    const styles = getComputedStyle(parent)
    const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(styles.overflowX)
    const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(styles.overflowY)
    if (clipsX || clipsY) ancestors.push({ element: parent, x: clipsX, y: clipsY })
    parent = parent.parentElement
  }
  return ancestors
}

function visibleMediaBounds(media: WaveMedia, ancestors: ClipAncestor[]) {
  const mediaBounds = media.getBoundingClientRect()
  let left = Math.max(0, mediaBounds.left)
  let top = Math.max(0, mediaBounds.top)
  let right = Math.min(window.innerWidth, mediaBounds.right)
  let bottom = Math.min(window.innerHeight, mediaBounds.bottom)

  for (const ancestor of ancestors) {
    const bounds = ancestor.element.getBoundingClientRect()
    if (ancestor.x) {
      left = Math.max(left, bounds.left)
      right = Math.min(right, bounds.right)
    }
    if (ancestor.y) {
      top = Math.max(top, bounds.top)
      bottom = Math.min(bottom, bounds.bottom)
    }
  }

  return { mediaBounds, left, top, right, bottom, width: right - left, height: bottom - top }
}

function syncMediaGeometry() {
  if (!activeMedia || !rectUniform || !visibleUvUniform || !uvScale || !trailMap) return false
  const visible = visibleMediaBounds(activeMedia, activeClipAncestors)
  const bounds = visible.mediaBounds
  const source = mediaDimensions(activeMedia)
  if (!bounds.width || !bounds.height || visible.width <= 0 || visible.height <= 0 || !source.width || !source.height) return false

  rectUniform[0] = bounds.left / window.innerWidth
  rectUniform[1] = 1 - bounds.bottom / window.innerHeight
  rectUniform[2] = bounds.width / window.innerWidth
  rectUniform[3] = bounds.height / window.innerHeight

  visibleUvUniform[0] = (visible.left - bounds.left) / bounds.width
  visibleUvUniform[1] = (bounds.bottom - visible.bottom) / bounds.height
  visibleUvUniform[2] = visible.width / bounds.width
  visibleUvUniform[3] = visible.height / bounds.height
  activePointerBounds = {
    left: visible.left,
    top: visible.top,
    width: visible.width,
    height: visible.height,
  }

  const mediaAspect = bounds.width / bounds.height
  const sourceAspect = source.width / source.height
  uvScale.set(
    mediaAspect < sourceAspect ? mediaAspect / sourceAspect : 1,
    mediaAspect > sourceAspect ? sourceAspect / mediaAspect : 1,
  )
  trailMap.aspect = visible.width / visible.height
  return true
}

function resizeRenderer() {
  if (!renderer) return
  renderer.setSize(window.innerWidth, window.innerHeight)
  syncMediaGeometry()
}

function clearCanvas() {
  if (!renderer || !gl) return
  renderer.bindFramebuffer()
  renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
}

function clearTrail() {
  if (!renderer || !gl || !trailMap) return
  const targets = [trailMap.mask.read, trailMap.mask.write]
  for (const target of targets) {
    renderer.bindFramebuffer(target)
    renderer.setViewport(target.width, target.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  renderer.bindFramebuffer()
  renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr)
}

function draw() {
  if (!renderer || !mediaMesh || !activeMedia || !syncMediaGeometry()) return
  if (!isMediaMotionStable(activeMedia)) {
    activationId++
    hoveredMedia = null
    hoveredClipAncestors = []
    hoverTarget = 0
    releaseActiveMedia()
    return
  }
  if (activeMedia instanceof HTMLVideoElement && mediaTexture) mediaTexture.needsUpdate = true
  renderer.render({ scene: mediaMesh })
}

function releaseActiveMedia() {
  activeMedia?.classList.remove('case-wave-media-active')
  activeMedia = null
  activePointerBounds = null
  const canvas = canvasEl.value
  if (canvas) canvas.style.mixBlendMode = ''
  clearCanvas()
}

function render(time: number) {
  animationFrame = 0
  if (!pointer || !activeMedia) return

  const elapsed = lastFrameTime ? Math.min(40, time - lastFrameTime) : 16.67
  lastFrameTime = time
  const pointerEase = 1 - Math.exp(-elapsed / 125)
  const velocityEase = 1 - Math.exp(-elapsed / 105)
  const velocityDecay = 1 - Math.exp(-elapsed / 145)

  pointer.x += (targetPointerX - pointer.x) * pointerEase
  pointer.y += (targetPointerY - pointer.y) * pointerEase

  const pointerDx = pointer.x - previousPointerX
  const pointerDy = pointer.y - previousPointerY
  const targetVelocityX = hoverTarget ? Math.max(-1.25, Math.min(1.25, pointerDx * 24)) : 0
  const targetVelocityY = hoverTarget ? Math.max(-1.25, Math.min(1.25, pointerDy * 24)) : 0
  const velocityMix = hoverTarget ? velocityEase : velocityDecay
  flowVelocityX += (targetVelocityX - flowVelocityX) * velocityMix
  flowVelocityY += (targetVelocityY - flowVelocityY) * velocityMix
  previousPointerX = pointer.x
  previousPointerY = pointer.y

  const speed = Math.hypot(flowVelocityX, flowVelocityY)
  if (trailMap) {
    trailMap.mouse.set(pointer.x, pointer.y)
    trailMap.velocity.set(flowVelocityX, flowVelocityY)
    trailMap.update()
  }
  trailEnergy = Math.max(speed, trailEnergy * Math.exp(-elapsed / 540))
  draw()

  const pointerDistance = Math.hypot(targetPointerX - pointer.x, targetPointerY - pointer.y)
  if (pointerDistance > 0.0002 || speed > 0.001 || trailEnergy > 0.006) {
    animationFrame = requestAnimationFrame(render)
    return
  }

  flowVelocityX = 0
  flowVelocityY = 0
  trailEnergy = 0
  lastFrameTime = 0
  if (!hoverTarget) releaseActiveMedia()
}

function requestRender() {
  if (!animationFrame && activeMedia) animationFrame = requestAnimationFrame(render)
}

async function setupRenderer() {
  if (renderer || initialization || !mediaQuery?.matches) return initialization
  initialization = (async () => {
    const canvas = canvasEl.value
    if (!canvas) return
    const {
      Flowmap: OglFlowmap,
      Mesh: OglMesh,
      Program: OglProgram,
      Renderer: OglRenderer,
      Texture: OglTexture,
      Triangle,
      Vec2: OglVec2,
    } = await import('ogl')
    if (!canvasEl.value || canvasEl.value !== canvas || !mediaQuery?.matches) return

    const nextRenderer = new OglRenderer({
      canvas,
      dpr: Math.min(window.devicePixelRatio || 1, 1.25),
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    })
    const nextGl = nextRenderer.gl
    nextGl.clearColor(0, 0, 0, 0)

    const nextTexture = new OglTexture(nextGl, {
      generateMipmaps: false,
      minFilter: nextGl.LINEAR,
      magFilter: nextGl.LINEAR,
      wrapS: nextGl.CLAMP_TO_EDGE,
      wrapT: nextGl.CLAMP_TO_EDGE,
    })
    const nextTrailMap = new OglFlowmap(nextGl, {
      size: 256,
      falloff: 0.34,
      alpha: 0.72,
      dissipation: 0.975,
    })
    const nextPointer = new OglVec2(0.5, 0.5)
    const nextUvScale = new OglVec2(1, 1)
    const nextRect = new Float32Array([0, 0, 1, 1])
    const nextVisibleUv = new Float32Array([0, 0, 1, 1])
    const nextProgram = new OglProgram(nextGl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        tImage: { value: nextTexture },
        tFlow: nextTrailMap.uniform,
        uUvScale: { value: nextUvScale },
        uRect: { value: nextRect },
        uVisibleUv: { value: nextVisibleUv },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    })
    const nextMesh = new OglMesh(nextGl, {
      geometry: new Triangle(nextGl),
      program: nextProgram,
    })

    renderer = nextRenderer
    gl = nextGl
    mediaTexture = nextTexture
    mediaProgram = nextProgram
    mediaMesh = nextMesh
    trailMap = nextTrailMap
    pointer = nextPointer
    uvScale = nextUvScale
    rectUniform = nextRect
    visibleUvUniform = nextVisibleUv
    resizeRenderer()
    clearCanvas()
  })().catch(() => {
    destroyRenderer()
  }).finally(() => {
    initialization = null
  })
  return initialization
}

async function ensureMediaReady(media: WaveMedia) {
  if (media instanceof HTMLImageElement) {
    if (media.complete && media.naturalWidth) return true
    try {
      await media.decode()
    } catch {
      return false
    }
    return Boolean(media.naturalWidth)
  }
  if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true
  return await new Promise<boolean>((resolve) => {
    const done = () => resolve(media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    media.addEventListener('loadeddata', done, { once: true })
    media.addEventListener('error', () => resolve(false), { once: true })
  })
}

function updateTargetPointer(event: PointerEvent, media: WaveMedia, ancestors: ClipAncestor[]) {
  const bounds = media === activeMedia && activePointerBounds
    ? activePointerBounds
    : visibleMediaBounds(media, ancestors)
  if (bounds.width <= 0 || bounds.height <= 0) return
  targetPointerX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  targetPointerY = Math.min(1, Math.max(0, 1 - (event.clientY - bounds.top) / bounds.height))
}

async function activateMedia(media: WaveMedia, event: PointerEvent) {
  if (!isMediaMotionStable(media)) return
  const currentActivation = ++activationId
  hoveredMedia = media
  hoveredClipAncestors = collectClipAncestors(media)
  hoverTarget = 1
  updateTargetPointer(event, media, hoveredClipAncestors)
  await Promise.all([setupRenderer(), ensureMediaReady(media)])
  if (
    currentActivation !== activationId
    || hoveredMedia !== media
    || !mediaTexture
    || !pointer
    || !isMediaMotionStable(media)
  ) return

  if (activeMedia !== media) {
    releaseActiveMedia()
    clearTrail()
    activeMedia = media
    activeClipAncestors = hoveredClipAncestors
    const nextTextureKey = textureKey(media)
    if (currentTextureKey !== nextTextureKey) {
      mediaTexture.image = media
      mediaTexture.needsUpdate = true
      currentTextureKey = nextTextureKey
    }
    const canvas = canvasEl.value
    if (canvas) canvas.style.mixBlendMode = getComputedStyle(media).mixBlendMode
    pointer.set(targetPointerX, targetPointerY)
    previousPointerX = targetPointerX
    previousPointerY = targetPointerY
    draw()
    if (activeMedia !== media) return
    media.classList.add('case-wave-media-active')
  }
  requestRender()
}

function handlePointerOver(event: PointerEvent) {
  if (!mediaQuery?.matches || event.pointerType === 'touch') return
  const media = findMedia(event.target)
  if (media && media !== hoveredMedia) void activateMedia(media, event)
}

function handlePointerMove(event: PointerEvent) {
  if (!mediaQuery?.matches || event.pointerType === 'touch') return
  const media = findMedia(event.target)
  if (!media) return
  if (media !== hoveredMedia) {
    void activateMedia(media, event)
    return
  }
  updateTargetPointer(event, media, hoveredClipAncestors)
  hoverTarget = 1
  requestRender()
}

function handlePointerOut(event: PointerEvent) {
  const media = findMedia(event.target)
  if (!media || media !== hoveredMedia) return
  if (event.relatedTarget instanceof Node && media.contains(event.relatedTarget)) return
  activationId++
  hoveredMedia = null
  hoveredClipAncestors = []
  hoverTarget = 0
  requestRender()
}

function handleResize() {
  if (!renderer) return
  resizeRenderer()
  requestRender()
}

function handleScroll() {
  // Geometry is refreshed by the next animation frame. Never call setSize()
  // here: resizing the WebGL drawing buffer on every scroll event stalls GPU.
  requestRender()
}

function handleMediaPreferenceChange() {
  if (!mediaQuery?.matches) destroyRenderer()
}

function handleContextLost(event: Event) {
  event.preventDefault()
  destroyRenderer()
}

function destroyRenderer() {
  activationId++
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  releaseActiveMedia()
  hoveredMedia = null

  if (gl) {
    if (mediaTexture) gl.deleteTexture(mediaTexture.texture)
    if (trailMap) {
      gl.deleteTexture(trailMap.mask.read.texture.texture)
      gl.deleteTexture(trailMap.mask.write.texture.texture)
      gl.deleteFramebuffer(trailMap.mask.read.buffer)
      gl.deleteFramebuffer(trailMap.mask.write.buffer)
      trailMap.mesh.program.remove()
      trailMap.mesh.geometry.remove()
    }
    mediaProgram?.remove()
    mediaMesh?.geometry.remove()
  }

  renderer = null
  gl = null
  mediaTexture = null
  mediaProgram = null
  mediaMesh = null
  trailMap = null
  pointer = null
  uvScale = null
  rectUniform = null
  visibleUvUniform = null
  currentTextureKey = null
  activeClipAncestors = []
  hoveredClipAncestors = []
  hoverTarget = 0
  flowVelocityX = 0
  flowVelocityY = 0
  trailEnergy = 0
  lastFrameTime = 0
}

onMounted(() => {
  scopeEl = canvasEl.value?.parentElement ?? null
  mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
  mediaQuery.addEventListener('change', handleMediaPreferenceChange)
  scopeEl?.addEventListener('pointerover', handlePointerOver)
  scopeEl?.addEventListener('pointermove', handlePointerMove)
  scopeEl?.addEventListener('pointerout', handlePointerOut)
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleScroll, { passive: true })
  canvasEl.value?.addEventListener('webglcontextlost', handleContextLost)
  stopTransitionWatch = watch(detailTransitionActive, (active) => {
    if (!active) return
    activationId++
    hoveredMedia = null
    hoveredClipAncestors = []
    hoverTarget = 0
    releaseActiveMedia()
  })
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleMediaPreferenceChange)
  scopeEl?.removeEventListener('pointerover', handlePointerOver)
  scopeEl?.removeEventListener('pointermove', handlePointerMove)
  scopeEl?.removeEventListener('pointerout', handlePointerOut)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleScroll)
  canvasEl.value?.removeEventListener('webglcontextlost', handleContextLost)
  stopTransitionWatch?.()
  stopTransitionWatch = null
  destroyRenderer()
  scopeEl = null
})
</script>

<template>
  <canvas ref="canvasEl" class="case-media-wave-layer" aria-hidden="true" />
</template>

<style scoped>
.case-media-wave-layer {
  position: fixed;
  z-index: 10;
  inset: 0;
  display: block;
  width: 100vw;
  height: 100svh;
  pointer-events: none;
}

:global(.case-wave-media-active) {
  opacity: 0 !important;
}
</style>
