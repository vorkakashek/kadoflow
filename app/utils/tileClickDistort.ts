/**
 * One-shot liquid displacement on a nav screenshot.
 * Tile-sized WebGL quad — not a fullscreen warp (that one felt sick
 * and was expensive). Hero is paused while the menu is up.
 */
import * as THREE from 'three'

type Gsap = typeof import('gsap').default

const INTENSITY = 0.42
const DURATION = 0.52
const NOISE_SIZE = 128

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
varying vec2 vUv;
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
  vec4 d = texture2D(disp, vUv);
  vec2 dispVec = vec2(d.r, d.g);
  vec2 p1 = myUV + getRotM(angle1) * dispVec * intensity1 * dispFactor;
  vec2 p2 = myUV + getRotM(angle2) * dispVec * intensity2 * (1.0 - dispFactor);
  gl_FragColor = mix(texture2D(texture1, p1), texture2D(texture2, p2), dispFactor);
}
`

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null
let dispTex: THREE.DataTexture | null = null
let tween: { kill: () => void } | null = null
let raf = 0
let resolvePlay: (() => void) | null = null

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

function ensureGpu() {
  if (renderer && mesh) return true
  try {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.NoColorSpace
    renderer.autoClear = true

    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    dispTex = new THREE.DataTexture(makeNoise(NOISE_SIZE), NOISE_SIZE, NOISE_SIZE)
    dispTex.needsUpdate = true
    dispTex.wrapS = THREE.RepeatWrapping
    dispTex.wrapT = THREE.RepeatWrapping
    dispTex.colorSpace = THREE.NoColorSpace

    const mat = new THREE.ShaderMaterial({
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
      transparent: true,
    })
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    scene.add(mesh)
    return true
  } catch {
    disposeTileClickFx()
    return false
  }
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

function draw() {
  if (!renderer || !scene || !camera) return
  renderer.render(scene, camera)
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function loop() {
  raf = 0
  draw()
  if (tween) raf = requestAnimationFrame(loop)
}

function finishPlay() {
  stopLoop()
  tween = null
  const canvas = renderer?.domElement
  if (canvas?.parentElement) canvas.parentElement.removeChild(canvas)
  const done = resolvePlay
  resolvePlay = null
  done?.()
}

export function canUseTileClickFx() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

export function abortTileClickFx() {
  tween?.kill()
  tween = null
  finishPlay()
}

export function disposeTileClickFx() {
  abortTileClickFx()
  mesh?.geometry.dispose()
  mesh?.material.dispose()
  dispTex?.dispose()
  renderer?.dispose()
  mesh = null
  dispTex = null
  scene = null
  camera = null
  renderer = null
}

function texFromImg(img: HTMLImageElement) {
  const t = new THREE.Texture(img)
  t.colorSpace = THREE.NoColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

export function playTileClickFx(
  gsap: Gsap,
  host: HTMLElement,
  img: HTMLImageElement,
): Promise<void> {
  abortTileClickFx()
  if (!ensureGpu() || !renderer || !mesh || !scene || !camera) {
    return Promise.resolve()
  }

  const w = Math.max(1, host.clientWidth)
  const h = Math.max(1, host.clientHeight)
  renderer.setSize(w, h, false)
  styleCanvas(renderer.domElement)
  host.appendChild(renderer.domElement)

  const shot = texFromImg(img)
  const prev1 = mesh.material.uniforms.texture1.value as THREE.Texture | null
  const prev2 = mesh.material.uniforms.texture2.value as THREE.Texture | null
  prev1?.dispose()
  if (prev2 && prev2 !== prev1) prev2.dispose()
  mesh.material.uniforms.texture1.value = shot
  mesh.material.uniforms.texture2.value = shot
  mesh.material.uniforms.dispFactor.value = 0
  mesh.material.uniforms.uPlane.value.set(w, h)
  mesh.material.uniforms.uImage.value.set(
    img.naturalWidth || w,
    img.naturalHeight || h,
  )

  draw()

  return new Promise<void>((resolve) => {
    resolvePlay = resolve
    tween = gsap.to(mesh!.material.uniforms.dispFactor, {
      value: 1,
      duration: DURATION,
      ease: 'sine.inOut',
      onUpdate: () => {
        if (!raf) raf = requestAnimationFrame(loop)
      },
      onComplete: () => {
        draw()
        finishPlay()
      },
    })
    if (!raf) raf = requestAnimationFrame(loop)
  })
}
