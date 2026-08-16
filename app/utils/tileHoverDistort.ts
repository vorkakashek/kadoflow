/**
 * Desktop tile hover — Codrops / robin-dela displacement.
 * B&W → color through a liquid warp with a horizontal slide.
 * Two GL layers so a leave on one plaque can finish while another enters.
 */
import * as THREE from 'three'

type Gsap = typeof import('gsap').default

const INTENSITY = 0.62
const SPEED_IN = 1.2
const SPEED_OUT = 0.9
const NOISE_SIZE = 128
const MAX_LAYERS = 2

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float dispFactor;
uniform sampler2D disp;
uniform sampler2D texture1;
uniform sampler2D texture2;
uniform float angle1;
uniform float angle2;
uniform float intensity1;
uniform float intensity2;
uniform vec2 uPlane;
uniform vec2 uImage;
out vec4 fragColor;

mat2 getRotM(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

vec2 coverTop(vec2 uv) {
  float plane = uPlane.x / max(uPlane.y, 0.001);
  float image = uImage.x / max(uImage.y, 0.001);
  if (plane > image) {
    float vis = image / plane;
    return vec2(uv.x, uv.y * vis + (1.0 - vis));
  }
  float vis = plane / image;
  return vec2(uv.x * vis + (1.0 - vis) * 0.5, uv.y);
}

void main() {
  vec2 myUV = coverTop(vUv);
  vec4 d = texture(disp, vUv);
  vec2 dispVec = vec2(d.r, d.g);
  vec2 p1 = myUV + getRotM(angle1) * dispVec * intensity1 * dispFactor;
  vec2 p2 = myUV + getRotM(angle2) * dispVec * intensity2 * (1.0 - dispFactor);
  fragColor = mix(texture(texture1, p1), texture(texture2, p2), dispFactor);
}
`

type Layer = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>
  dispTex: THREE.DataTexture
  tween: { kill: () => void } | null
  tweenTo: number
  parent: HTMLElement | null
  held: boolean
  dispProxy: { t: number }
  texCache: Map<string, THREE.Texture>
}

const layers: Layer[] = []
let gsapLib: Gsap | null = null
let raf = 0

function makeNoise(size: number) {
  const data = new Uint8Array(size * size * 4)
  const grid = 8
  const cell = size / grid
  const pts: number[] = []
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      pts.push(Math.random(), Math.random())
    }
  }
  const idx = (x: number, y: number) => (y * (grid + 1) + x) * 2
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const fade = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cell
      const gy = y / cell
      const x0 = Math.min(grid, Math.floor(gx))
      const y0 = Math.min(grid, Math.floor(gy))
      const x1 = Math.min(grid, x0 + 1)
      const y1 = Math.min(grid, y0 + 1)
      const fx = fade(gx - x0)
      const fy = fade(gy - y0)
      const i00 = idx(x0, y0)
      const i10 = idx(x1, y0)
      const i01 = idx(x0, y1)
      const i11 = idx(x1, y1)
      const r = lerp(lerp(pts[i00], pts[i10], fx), lerp(pts[i01], pts[i11], fx), fy)
      const gch = lerp(
        lerp(pts[i00 + 1], pts[i10 + 1], fx),
        lerp(pts[i01 + 1], pts[i11 + 1], fx),
        fy,
      )
      const o = (y * size + x) * 4
      data[o] = r * 255
      data[o + 1] = gch * 255
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  return data
}

function styleCanvas(el: HTMLCanvasElement) {
  el.style.position = 'absolute'
  el.style.inset = '0'
  el.style.zIndex = '3'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.pointerEvents = 'none'
  el.style.display = 'block'
}

function glMount(host: HTMLElement) {
  return (
    (host.querySelector('.pc-frame__paint') as HTMLElement | null) || host
  )
}

function factorOf(layer: Layer) {
  return layer.mesh.material.uniforms.dispFactor.value as number
}

function draw(layer: Layer) {
  layer.renderer.render(layer.scene, layer.camera)
}

function loop() {
  raf = 0
  let keep = false
  for (const layer of layers) {
    if (layer.tween || layer.held) {
      draw(layer)
      keep = true
    }
  }
  if (keep) raf = requestAnimationFrame(loop)
}

function kickLoop() {
  if (!raf) raf = requestAnimationFrame(loop)
}

function createLayer(): Layer | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
    })
    renderer.setClearColor(0x000000, 1)
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1))
    renderer.debug.checkShaderErrors = true
    renderer.autoClear = true

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    const dispTex = new THREE.DataTexture(
      makeNoise(NOISE_SIZE),
      NOISE_SIZE,
      NOISE_SIZE,
      THREE.RGBAFormat,
    )
    dispTex.needsUpdate = true
    dispTex.wrapS = THREE.RepeatWrapping
    dispTex.wrapT = THREE.RepeatWrapping
    dispTex.magFilter = THREE.LinearFilter
    dispTex.minFilter = THREE.LinearFilter
    dispTex.colorSpace = THREE.NoColorSpace

    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        dispFactor: { value: 0 },
        disp: { value: dispTex },
        texture1: { value: null },
        texture2: { value: null },
        angle1: { value: Math.PI / 4 },
        angle2: { value: (-Math.PI / 4) * 3 },
        intensity1: { value: INTENSITY },
        intensity2: { value: INTENSITY },
        uPlane: { value: new THREE.Vector2(1, 1) },
        uImage: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    scene.add(mesh)
    return {
      renderer,
      scene,
      camera,
      mesh,
      dispTex,
      tween: null,
      tweenTo: 0,
      parent: null,
      held: false,
      dispProxy: { t: 0 },
      texCache: new Map(),
    }
  } catch (err) {
    console.warn('[tileHover] gpu init failed', err)
    return null
  }
}

function texFromImg(layer: Layer, img: HTMLImageElement) {
  const key = img.currentSrc || img.src
  const hit = layer.texCache.get(key)
  if (hit) return hit
  const t = new THREE.Texture(img)
  t.colorSpace = THREE.NoColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  layer.texCache.set(key, t)
  return t
}

function fitToHost(layer: Layer, host: HTMLElement, img: HTMLImageElement) {
  const w = Math.max(1, host.clientWidth)
  const h = Math.max(1, host.clientHeight)
  layer.renderer.setSize(w, h, false)
  styleCanvas(layer.renderer.domElement)
  layer.mesh.material.uniforms.uPlane.value.set(w, h)
  layer.mesh.material.uniforms.uImage.value.set(
    img.naturalWidth || w,
    img.naturalHeight || h,
  )
}

function detachLayer(layer: Layer) {
  layer.parent?.classList.remove('pc-frame__sheet--gl')
  const canvas = layer.renderer.domElement
  if (canvas.parentElement) canvas.parentElement.removeChild(canvas)
  layer.parent = null
  layer.held = false
}

function tweenFactor(
  layer: Layer,
  gsap: Gsap,
  to: number,
  duration: number,
  ease = 'power2.inOut',
  onDone?: () => void,
) {
  layer.tween?.kill()
  layer.tweenTo = to
  layer.dispProxy.t = factorOf(layer)
  layer.tween = gsap.to(layer.dispProxy, {
    t: to,
    duration,
    ease,
    overwrite: true,
    onUpdate: () => {
      layer.mesh.material.uniforms.dispFactor.value = layer.dispProxy.t
      kickLoop()
    },
    onComplete: () => {
      layer.tween = null
      layer.mesh.material.uniforms.dispFactor.value = to
      draw(layer)
      if (!layer.held && !layers.some((l) => l.tween || l.held)) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      }
      onDone?.()
    },
  })
  kickLoop()
}

function layerFor(host: HTMLElement) {
  return layers.find((l) => l.parent === host) ?? null
}

function abortLayer(layer: Layer) {
  layer.held = false
  layer.tween?.kill()
  layer.tween = null
  layer.tweenTo = 0
  layer.dispProxy.t = 0
  layer.mesh.material.uniforms.dispFactor.value = 0
  detachLayer(layer)
}

function acquireLayer(host: HTMLElement): Layer | null {
  const existing = layerFor(host)
  if (existing) return existing

  const idle = layers.find((l) => !l.parent)
  if (idle) return idle

  if (layers.length < MAX_LAYERS) {
    const created = createLayer()
    if (!created) return null
    layers.push(created)
    return created
  }

  const steal = [...layers]
    .filter((l) => !l.held)
    .sort((a, b) => {
      const aOut = a.tweenTo === 0 ? 0 : 1
      const bOut = b.tweenTo === 0 ? 0 : 1
      if (aOut !== bOut) return aOut - bOut
      return factorOf(a) - factorOf(b)
    })[0]
  if (!steal) return null
  abortLayer(steal)
  return steal
}

export function canUseTileHoverFx() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(max-width: 767.98px)').matches) return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

export function resizeTileHover() {
  for (const layer of layers) {
    if (!layer.parent) continue
    const img =
      (layer.parent.querySelector(
        '.pc-frame__shot--color',
      ) as HTMLImageElement | null) ||
      (layer.parent.querySelector('.pc-frame__shot') as HTMLImageElement | null)
    if (!img) continue
    fitToHost(layer, layer.parent, img)
    draw(layer)
  }
}

export function abortTileHover() {
  for (const layer of layers) abortLayer(layer)
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

export function disposeTileHover() {
  abortTileHover()
  gsapLib = null
  for (const layer of layers) {
    layer.mesh.geometry.dispose()
    layer.mesh.material.dispose()
    layer.dispTex.dispose()
    for (const t of layer.texCache.values()) t.dispose()
    layer.texCache.clear()
    layer.renderer.dispose()
  }
  layers.length = 0
}

export function settleTileHover(host?: HTMLElement | null) {
  const targets = host
    ? [layerFor(host)].filter((l): l is Layer => !!l)
    : layers.filter((l) => l.parent?.matches(':hover'))
  for (const layer of targets) {
    layer.held = true
    kickLoop()
    const cur = factorOf(layer)
    if (cur >= 0.995 || (layer.tween && layer.tweenTo === 1)) continue
    if (!gsapLib) continue
    const remain = Math.max(0.18, SPEED_IN * (1 - cur) * 0.55)
    tweenFactor(layer, gsapLib, 1, remain, 'none')
  }
}

/** Wait until hover distort reaches full blend (used before iris hop / close). */
export function waitTileHoverSettle(host?: HTMLElement | null): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  const layer = host
    ? layerFor(host)
    : (layers.find((l) => l.held && l.parent) ?? null)
  if (!layer?.parent) return Promise.resolve()

  const cur = factorOf(layer)
  if (cur >= 0.995 && !layer.tween) return Promise.resolve()

  const maxMs =
    (Math.max(0.18, SPEED_IN * (1 - Math.min(cur, 0.99)) * 0.55) + 0.1) * 1000
  const deadline = performance.now() + maxMs

  return new Promise((resolve) => {
    const tick = () => {
      const f = factorOf(layer)
      if ((f >= 0.995 && !layer.tween) || performance.now() >= deadline) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

export function leaveTileHover(host?: HTMLElement | null) {
  const targets = host
    ? [layerFor(host)].filter((l): l is Layer => !!l)
    : layers.filter((l) => l.parent && !l.held)
  for (const layer of targets) {
    if (layer.held) continue
    const leaving = layer.parent
    if (!leaving) continue
    if (!gsapLib) {
      abortLayer(layer)
      continue
    }
    tweenFactor(layer, gsapLib, 0, SPEED_OUT, 'power2.inOut', () => {
      if (layer.parent !== leaving) return
      detachLayer(layer)
    })
  }
}

export function enterTileHover(
  gsap: Gsap,
  host: HTMLElement,
  bw: HTMLImageElement,
  color: HTMLImageElement,
): boolean {
  gsapLib = gsap
  const layer = acquireLayer(host)
  if (!layer) return false

  if (layer.parent === host) {
    host.classList.add('pc-frame__sheet--gl')
    if (layer.held || (layer.tween && layer.tweenTo === 1)) return true
    tweenFactor(layer, gsap, 1, SPEED_IN)
    return true
  }

  layer.parent = host
  const mount = glMount(host)
  host.classList.add('pc-frame__sheet--gl')
  fitToHost(layer, host, color)
  if (layer.renderer.domElement.parentElement !== mount) {
    mount.appendChild(layer.renderer.domElement)
  }
  layer.mesh.material.uniforms.texture1.value = texFromImg(layer, bw)
  layer.mesh.material.uniforms.texture2.value = texFromImg(layer, color)
  layer.mesh.material.uniforms.dispFactor.value = 0
  layer.dispProxy.t = 0
  draw(layer)
  tweenFactor(layer, gsap, 1, SPEED_IN)
  return true
}
