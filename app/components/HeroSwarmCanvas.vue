<script setup lang="ts">
/**
 * Hero swarm — tilted torus spiral (ring + helix twist), slow plane drift.
 * Desktop: cursor knocks balls; they return to moving seats.
 * Mobile (Android + iOS): 6 balls, AA + 1k HDRI, baked helix.
 */
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'

/** Flip this to A/B studio looks (files in /public/env). */
const HDRI_PRESETS = {
  studioSoft: '/env/studio_small_09_2k.hdr',
  photoStudio: '/env/photo_studio_01_2k.hdr',
  studioWarm: '/env/studio_small_03_1k.hdr',
} as const
const ACTIVE_HDRI: keyof typeof HDRI_PRESETS = 'studioSoft'
/** Desktop breakpoint — full ball count + richer materials. */
const DESKTOP_MIN_WIDTH = 1200
const BALL_COUNT_DESKTOP = 32
const BALL_COUNT_TABLET = 16
/** Mobile: few high-quality balls on a baked orbit (no physics / pointer). */
const BALL_COUNT_MOBILE = 6
/** Target on-screen diameter in CSS pixels at the cluster depth. */
const BALL_DIAMETER_PX = 200
/** Default camera distance (desktop). */
const CAMERA_Z = 8.82
/**
 * Compact: pull camera back by this factor so the swarm reads smaller.
 * Ball diameter scales by the inverse so the zoom actually shows
 * (world radius otherwise tracks camera distance).
 */
const CAMERA_ZOOM_COMPACT = 2.25
/** Soft spring back to the moving seat on the ring. */
const RETURN = 0.00004
const DAMPING = 0.982
const CURSOR_FORCE = 0.014
/** Single impulse scale (one knock per enter while moving). */
const CURSOR_IMPULSE = 1.85
/** Extra hit padding around projected ball radius (px). */
const CURSOR_HIT_PAD_PX = 56
/** Min pointer travel per event (px) to count as a swipe. */
const CURSOR_SPEED_MIN_PX = 2.5
const SEPARATION_PAD = 0.03
const SEPARATION_FORCE = 0.03
/** Ring radius in ball-radius units. Sized so 32 seats barely kiss, not explode. */
const RING_RADIUS_SCALE = 7.2
/** Mobile: tighter bagel so 6 balls read as a cluster, not a wide ring. */
const RING_RADIUS_SCALE_MOBILE = 4.2
/** Torus tube radius as a fraction of the major ring radius. */
const SPIRAL_TUBE_RATIO = 0.3
/** How many helix twists per full lap around the ring. */
const SPIRAL_TURNS = 2.75
/**
 * Must match HomeHero media padding — used to place the swarm at a
 * fraction of the *surface* height (not the taller media canvas).
 */
const MEDIA_TOP_EXTRA_VH = 0.14
const MEDIA_DIVE_VH = 0.6
/** Mobile cluster center: fraction down the visible surface (0 = top). Negative = into headroom. */
const MOBILE_ANCHOR_SURFACE_Y = -0.4
const MAX_SPEED = 0.26
const SOFT_BOUND_SCALE = 12.5
/** Radians per ms along the ring path. */
const ORBIT_SPEED = 0.00028
/** Slow drift of the ring plane orientation (radians per ms). */
const RING_TILT_SPEED = 0.000018
/** Beyond this distance from seat, return spring softens further. */
const RETURN_SOFT_DIST = 0.55
/** Tiny idle wander off the orbit. */
const CHAOS_IDLE = 0.000018
/** Occasional self-knock chance per ball per frame (at ~60fps). */
const CHAOS_POP_CHANCE = 0.0014
const CHAOS_POP_FORCE = 0.012
/** Lock to seats on boot / resize so separation doesn't grenade the swarm. */
const SETTLE_MS = 700

type Ball = {
  mesh: THREE.Mesh
  position: THREE.Vector3
  velocity: THREE.Vector3
  angle: number
  radius: number
  phase: number
  /** Cursor was inside this ball's hit radius last frame. */
  pointerInside: boolean
}

const COLORS = {
  green: new THREE.Color('#49573f'),
  white: new THREE.Color('#f5f1e8'),
  dark: new THREE.Color('#171915'),
} as const

const props = withDefaults(
  defineProps<{
    /** When false, rAF + draws stop (keeps GPU assets warm for return). */
    active?: boolean
  }>(),
  { active: true },
)

const canvasHost = ref<HTMLElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let animationId = 0
let resizeObserver: ResizeObserver | null = null
let removePointerListeners: (() => void) | null = null
let removeScrollPause: (() => void) | null = null
let sharedGeometry: THREE.BufferGeometry | null = null
let envMap: THREE.Texture | null = null
let microNormal: THREE.Texture | null = null
let microRough: THREE.Texture | null = null
let balls: Ball[] = []
let loopRunning = false
let lastFrame = 0
let runFrame: ((now: number) => void) | null = null

function stopLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = 0
  }
  loopRunning = false
}

function startLoop() {
  if (!runFrame || loopRunning || !renderer) return
  loopRunning = true
  lastFrame = performance.now()
  animationId = requestAnimationFrame(runFrame)
}

watch(
  () => props.active,
  (on) => {
    if (on) startLoop()
    else stopLoop()
  },
)

function readLayoutSpan1Px(host: HTMLElement) {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:var(--layout-span-1)'
  host.appendChild(probe)
  const width = probe.offsetWidth
  probe.remove()
  return width > 0 ? width : host.clientWidth * 0.06
}

/** Stable svh screen height — matches HomeHero media padding. */
function readAppScreenPx(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;height:var(--app-screen)'
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h > 0 ? h : window.innerHeight
}

function prepDataMap(tex: THREE.Texture, repeat = 2.4) {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  return tex
}

onMounted(async () => {
  const host = canvasHost.value
  if (!host) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isCoarse = isCoarsePointer()
  const isMobile = isNarrowViewport()
  const isIOS = isAppleTouchDevice()
  /**
   * Mobile (Android + iOS): 6 balls, AA + 1k HDRI, baked helix orbit.
   * No pointer / separation / chaos — budget goes into look, not physics.
   */
  const lite = isMobile || isIOS
  const wide =
    Math.max(window.innerWidth, host.clientWidth) >= DESKTOP_MIN_WIDTH
  const ballCount = wide
    ? BALL_COUNT_DESKTOP
    : lite
      ? BALL_COUNT_MOBILE
      : BALL_COUNT_TABLET
  const sphereSegments = wide && !isCoarse ? 64 : lite ? 40 : 32
  const pixelRatioCap = wide && !isCoarse ? 2 : lite ? 1.5 : 1.25
  const cameraZ = wide ? CAMERA_Z : CAMERA_Z * CAMERA_ZOOM_COMPACT
  const ballDiameterPx = wide
    ? BALL_DIAMETER_PX
    : BALL_DIAMETER_PX / CAMERA_ZOOM_COMPACT

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(0, 0.12, cameraZ)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.sortObjects = true
  host.appendChild(renderer.domElement)
  // Canvas defaults to pointer-events:auto — even under a PE:none host it can
  // steal iOS touch and fight document scroll (hero section is PE:none → hole).
  if (lite) {
    host.style.pointerEvents = 'none'
    host.style.cursor = 'default'
    renderer.domElement.style.pointerEvents = 'none'
    renderer.domElement.style.touchAction = 'pan-y'
  } else {
    renderer.domElement.style.touchAction = 'pan-y'
  }

  // HDRI — mobile uses the smaller 1k warm studio.
  {
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()

    const texLoader = new THREE.TextureLoader()
    const hdrUrl = wide ? HDRI_PRESETS[ACTIVE_HDRI] : HDRI_PRESETS.studioWarm
    const assetLoads: Promise<THREE.DataTexture | THREE.Texture>[] = [
      new HDRLoader().loadAsync(hdrUrl),
    ]
    if (wide) {
      assetLoads.push(
        texLoader.loadAsync('/textures/micro/plaster_nor.jpg'),
        texLoader.loadAsync('/textures/micro/plaster_rough.jpg'),
      )
    }
    const assets = await Promise.all(assetLoads)
    const hdrTex = assets[0] as THREE.DataTexture

    envMap = pmrem.fromEquirectangular(hdrTex).texture
    hdrTex.dispose()
    pmrem.dispose()
    scene.environment = envMap
    scene.environmentIntensity = lite ? 1.1 : 1.05

    if (wide && assets[1] && assets[2]) {
      microNormal = prepDataMap(assets[1], 2.6)
      microRough = prepDataMap(assets[2], 2.6)
    }
  }

  const hemi = new THREE.HemisphereLight(0xe8eef5, 0xb8a990, lite ? 0.34 : 0.28)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xf5f8fc, lite ? 0.62 : 0.55)
  key.position.set(3.8, 5.2, 4.5)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xc5d4e4, lite ? 0.28 : 0.22)
  fill.position.set(-4.5, 1.2, 2.8)
  scene.add(fill)

  if (!lite) {
    const rim = new THREE.DirectionalLight(0xd0dcea, 0.32)
    rim.position.set(-1.8, 2.8, -4.8)
    scene.add(rim)
  }

  const matte = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.86,
      metalness: 0.02,
      clearcoat: lite ? 0.18 : 0.12,
      clearcoatRoughness: lite ? 0.5 : 0.62,
      sheen: lite ? 0.18 : 0.28,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color('#d7e4f0'),
      envMapIntensity: lite ? 0.85 : 0.7,
      specularIntensity: 0.5,
      ...(microRough ? { roughnessMap: microRough } : null),
      ...(microNormal
        ? {
            normalMap: microNormal,
            normalScale: new THREE.Vector2(0.28, 0.28),
          }
        : null),
    })

  const frosted = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: lite ? 0.42 : 0.48,
      metalness: 0,
      transmission: lite ? 0.82 : 0.88,
      thickness: lite ? 1.1 : 1.6,
      ior: 1.42,
      transparent: true,
      opacity: 1,
      attenuationColor: color.clone().lerp(new THREE.Color('#e4eef7'), 0.4),
      attenuationDistance: lite ? 1.2 : 1.6,
      clearcoat: lite ? 0.28 : 0.4,
      clearcoatRoughness: lite ? 0.4 : 0.35,
      envMapIntensity: lite ? 1.05 : 1.15,
      depthWrite: false,
    })

  const glossy = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: lite ? 0.22 : 0.18,
      metalness: 0.08,
      clearcoat: lite ? 0.45 : 0.55,
      clearcoatRoughness: lite ? 0.22 : 0.16,
      reflectivity: 0.6,
      envMapIntensity: lite ? 1.12 : 1.05,
      specularIntensity: 0.75,
      ior: 1.45,
    })

  const materialPlan: THREE.Material[] = []
  if (lite) {
    // Mobile: swap shiny green + glossy black for frosted glass (clear).
    materialPlan.push(
      matte(COLORS.green.clone()),
      frosted(COLORS.white.clone()),
      matte(COLORS.dark.clone()),
      frosted(COLORS.white.clone()),
      matte(COLORS.white.clone()),
      frosted(COLORS.white.clone()),
    )
  } else {
    for (const color of [COLORS.green, COLORS.dark]) {
      materialPlan.push(matte(color.clone()), glossy(color.clone()))
    }
    materialPlan.push(
      matte(COLORS.white.clone()),
      frosted(COLORS.white.clone()),
      glossy(COLORS.white.clone()),
    )
  }

  sharedGeometry = new THREE.SphereGeometry(1, sphereSegments, sphereSegments)
  balls = []

  for (let i = 0; i < ballCount; i++) {
    const material = materialPlan[i % materialPlan.length].clone()
    const mesh = new THREE.Mesh(sharedGeometry, material)
    mesh.renderOrder = material.transparent ? 2 : 1
    scene.add(mesh)
    balls.push({
      mesh,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      angle: (i / ballCount) * Math.PI * 2,
      radius: 0.35,
      // Spread along the helix so the swarm reads as a twisted strand, not a flat pack.
      phase: (i / ballCount) * Math.PI * 2 * SPIRAL_TURNS,
      pointerInside: false,
    })
  }
  for (const material of materialPlan) material.dispose()

  const anchor = new THREE.Vector3(1.55, 0.05, 0)
  /** Base ring orientation: tilted, receding into depth — then slowly drifts. */
  const ringBaseEuler = new THREE.Euler(-0.62, 0.78, 0.18, 'XYZ')
  const ringQuat = new THREE.Quaternion().setFromEuler(ringBaseEuler)
  const ringEuler = ringBaseEuler.clone()
  let ringRadius = 1.2
  let ringTiltPhase = 0

  const pointer = new THREE.Vector3()
  const pointerPrev = new THREE.Vector3()
  const pointerVel = new THREE.Vector3()
  const pointerNdc = new THREE.Vector2()
  const pointerNdcPrev = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const hitPlane = new THREE.Plane()
  const planeNormal = new THREE.Vector3()
  let pointerActive = false
  let pointerSampled = false
  let pointerSpeedPx = 0
  const size = { w: 1, h: 1 }
  const tmp = new THREE.Vector3()
  const push = new THREE.Vector3()
  const seat = new THREE.Vector3()
  const seatPull = new THREE.Vector3()
  const local = new THREE.Vector3()
  let lastBallRadius = 0
  let settleLeft = SETTLE_MS

  const pointOnOrbit = (angle: number, phase: number, out: THREE.Vector3) => {
    // Torus helix: major angle around the bagel, minor angle winds the tube.
    const tube = ringRadius * SPIRAL_TUBE_RATIO
    const phi = angle * SPIRAL_TURNS + phase
    const rho = ringRadius + tube * Math.cos(phi)
    local.set(
      rho * Math.cos(angle),
      rho * Math.sin(angle),
      tube * Math.sin(phi),
    )
    local.applyQuaternion(ringQuat)
    out.copy(anchor).add(local)
  }

  const seatAll = () => {
    for (const ball of balls) {
      pointOnOrbit(ball.angle, ball.phase, ball.position)
      ball.velocity.set(0, 0, 0)
      ball.pointerInside = false
      ball.mesh.position.copy(ball.position)
    }
    settleLeft = SETTLE_MS
  }

  const worldRadiusForPixels = (diameterPx: number) => {
    const dist = camera.position.distanceTo(anchor)
    const visibleHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * dist
    return (diameterPx * 0.5 * visibleHeight) / Math.max(size.h, 1)
  }

  const syncCamera = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    if (w < 2 || h < 2 || !renderer) return
    // Ignore sub-pixel / transform noise — reseating the swarm every frame = flicker.
    if (Math.abs(w - size.w) < 1 && Math.abs(h - size.h) < 1 && size.w > 0) return
    size.w = w
    size.h = h
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    const column = readLayoutSpan1Px(host)
    const rightNdc = 1 - ((column * 2 + w * 0.16) / w) * 2

    // Desktop: bias to the right column band. Mobile: center X, 30% down the surface.
    let anchorNdcX = rightNdc
    let anchorNdcY = 0.02
    if (lite) {
      const screen = readAppScreenPx()
      const topExtraPx = screen * MEDIA_TOP_EXTRA_VH
      const divePx = screen * MEDIA_DIVE_VH
      const slotPx = Math.max(h - topExtraPx - divePx, h * 0.45)
      const cssY = topExtraPx + slotPx * MOBILE_ANCHOR_SURFACE_Y
      anchorNdcX = 0
      anchorNdcY = 1 - (2 * cssY) / h
    }

    camera.getWorldDirection(planeNormal)
    hitPlane.setFromNormalAndCoplanarPoint(
      planeNormal.clone().negate(),
      new THREE.Vector3(0, 0, 0),
    )
    pointerNdc.set(anchorNdcX, anchorNdcY)
    raycaster.setFromCamera(pointerNdc, camera)
    if (!raycaster.ray.intersectPlane(hitPlane, anchor)) {
      anchor.set(lite ? 0 : 1.55, lite ? 0.55 : 0.05, 0)
    }

    camera.lookAt(anchor.x * (lite ? 0.5 : 0.28), anchor.y, 0)

    const radius = worldRadiusForPixels(ballDiameterPx)
    ringRadius = radius * (lite ? RING_RADIUS_SCALE_MOBILE : RING_RADIUS_SCALE)

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]
      ball.radius = radius
      ball.mesh.scale.setScalar(radius)
    }

    // First layout or real size jump — re-seat. Skipping this after a tiny
    // first measure left balls overlapping at the new radius → grenade.
    if (
      lastBallRadius < 1e-6 ||
      Math.abs(radius - lastBallRadius) > radius * 0.04
    ) {
      seatAll()
      lastBallRadius = radius
    }
  }

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = renderer?.domElement ?? host
    const rect = canvas.getBoundingClientRect()
    pointerNdcPrev.copy(pointerNdc)
    pointerNdc.set(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    )

    if (pointerSampled) {
      const dx = ((pointerNdc.x - pointerNdcPrev.x) * rect.width) / 2
      const dy = ((pointerNdc.y - pointerNdcPrev.y) * rect.height) / 2
      pointerSpeedPx = Math.hypot(dx, dy)
    } else {
      pointerSpeedPx = 0
      pointerSampled = true
    }

    raycaster.setFromCamera(pointerNdc, camera)
    camera.getWorldDirection(planeNormal)
    hitPlane.setFromNormalAndCoplanarPoint(planeNormal.clone().negate(), anchor)

    pointerPrev.copy(pointer)
    if (!raycaster.ray.intersectPlane(hitPlane, pointer)) {
      pointer.copy(anchor)
    }
    pointerVel.copy(pointer).sub(pointerPrev)
  }

  const onPointerMove = (event: PointerEvent) => {
    pointerActive = true
    clientToWorld(event.clientX, event.clientY)
  }
  const onPointerDown = (event: PointerEvent) => {
    pointerActive = true
    pointerSampled = false
    pointerSpeedPx = 0
    clientToWorld(event.clientX, event.clientY)
  }
  const onPointerLeave = () => {
    pointerActive = false
    pointerSampled = false
    pointerVel.set(0, 0, 0)
    pointerSpeedPx = 0
    for (const ball of balls) ball.pointerInside = false
  }

  if (!lite) {
    host.addEventListener('pointermove', onPointerMove, { passive: true })
    host.addEventListener('pointerdown', onPointerDown, { passive: true })
    host.addEventListener('pointerleave', onPointerLeave)
    host.addEventListener('pointercancel', onPointerLeave)
    removePointerListeners = () => {
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointerleave', onPointerLeave)
      host.removeEventListener('pointercancel', onPointerLeave)
    }
  }

  syncCamera()
  resizeObserver = new ResizeObserver(syncCamera)
  resizeObserver.observe(host)

  // No scroll stopLoop — that froze/restarted the GL layer every finger move (flicker).
  // Scene lifetime is owned by sceneLive / opacity fade only.
  let scrollPaused = false

  const tick = (now: number) => {
    if (!loopRunning) return
    animationId = requestAnimationFrame(tick)
    if (!renderer) return

    if (lite && scrollPaused) {
      lastFrame = now
      return
    }

    const dt = Math.min(32, now - lastFrame)
    lastFrame = now
    const step = reduced ? 0 : dt

    if (!reduced) {
      ringTiltPhase += RING_TILT_SPEED * step
      ringEuler.set(
        ringBaseEuler.x + Math.sin(ringTiltPhase) * 0.22,
        ringBaseEuler.y + ringTiltPhase * 0.35,
        ringBaseEuler.z + Math.cos(ringTiltPhase * 0.7) * 0.12,
        'XYZ',
      )
      ringQuat.setFromEuler(ringEuler)
    }

    // Mobile: baked helix seats only — no physics / pointer / separation.
    if (lite) {
      for (const ball of balls) {
        if (!reduced) ball.angle += ORBIT_SPEED * step
        pointOnOrbit(ball.angle, ball.phase, ball.position)
        ball.mesh.position.copy(ball.position)
      }
      renderer.render(scene, camera)
      return
    }

    const softBound = balls[0].radius * SOFT_BOUND_SCALE
    const settling = settleLeft > 0
    if (settling) settleLeft = Math.max(0, settleLeft - dt)
    const cursorMoving =
      !settling && pointerActive && pointerSpeedPx >= CURSOR_SPEED_MIN_PX

    const halfW = size.w * 0.5
    const halfH = size.h * 0.5
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]

      if (!reduced) ball.angle += ORBIT_SPEED * step
      pointOnOrbit(ball.angle, ball.phase, seat)

      // Boot / post-resize: stick to seats until layout + radius are stable.
      if (settling) {
        ball.position.copy(seat)
        ball.velocity.set(0, 0, 0)
        ball.pointerInside = false
        ball.mesh.position.copy(ball.position)
        continue
      }

      if (!reduced) {
        const chaos = CHAOS_IDLE * step
        ball.velocity.x += Math.sin(now * 0.00037 + ball.phase) * chaos
        ball.velocity.y += Math.cos(now * 0.00041 + ball.phase * 1.3) * chaos
        ball.velocity.z += Math.sin(now * 0.00029 + ball.phase * 0.7) * chaos

        if (Math.random() < CHAOS_POP_CHANCE * (step / 16.67)) {
          push.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          )
          if (push.lengthSq() > 1e-8) {
            push
              .normalize()
              .multiplyScalar(CHAOS_POP_FORCE * (0.6 + Math.random() * 0.8))
            ball.velocity.add(push)
          }
        }
      }

      seatPull.copy(seat).sub(ball.position)
      const distToSeat = seatPull.length()
      let returnForce = RETURN
      if (distToSeat > RETURN_SOFT_DIST * ball.radius) {
        returnForce *= 0.28
      }

      // Screen-space hit for ALL balls — knock on enter while cursor is moving
      let near = false
      tmp.copy(ball.position).project(camera)
      if (pointerActive && tmp.z < 1 && tmp.z > -1) {
        const dx = (tmp.x - pointerNdc.x) * halfW
        const dy = (tmp.y - pointerNdc.y) * halfH
        const pixelDist = Math.hypot(dx, dy)
        const ballCamDist = camera.position.distanceTo(ball.position)
        const screenRadius =
          ((ball.radius / Math.max(ballCamDist, 0.001)) / tanHalfFov) *
            halfH *
            1.35 +
          CURSOR_HIT_PAD_PX
        near = pixelDist < screenRadius

        if (cursorMoving && near && !ball.pointerInside) {
          returnForce *= 0.02
          const falloff = 1 - pixelDist / Math.max(screenRadius, 1)
          const strength =
            CURSOR_FORCE *
            CURSOR_IMPULSE *
            (0.45 + 0.55 * falloff) *
            Math.min(Math.max(pointerSpeedPx, CURSOR_SPEED_MIN_PX) / 8, 2.2)

          if (pointerVel.lengthSq() > 1e-8) {
            push.copy(pointerVel).normalize().multiplyScalar(strength)
          } else {
            local.set(1, 0, 0).applyQuaternion(camera.quaternion)
            push.set(0, 1, 0).applyQuaternion(camera.quaternion)
            const upX = push.x
            const upY = push.y
            const upZ = push.z
            push
              .copy(local)
              .multiplyScalar(pointerNdc.x - pointerNdcPrev.x)
              .addScaledVector(
                local.set(upX, upY, upZ),
                pointerNdc.y - pointerNdcPrev.y,
              )
            if (push.lengthSq() > 1e-10) {
              push.normalize().multiplyScalar(strength)
            } else {
              push
                .copy(ball.position)
                .sub(camera.position)
                .setLength(strength)
            }
          }
          ball.velocity.add(push)
        }
      }
      ball.pointerInside = near

      ball.velocity.addScaledVector(seatPull, returnForce * step)

      for (let j = i + 1; j < balls.length; j++) {
        const other = balls[j]
        tmp.copy(ball.position).sub(other.position)
        const dist = tmp.length()
        const minDist = ball.radius + other.radius + SEPARATION_PAD
        if (dist > 0.0001 && dist < minDist) {
          const overlap = (minDist - dist) / minDist
          push
            .copy(tmp)
            .normalize()
            .multiplyScalar(overlap * SEPARATION_FORCE * step)
          ball.velocity.add(push)
          other.velocity.sub(push)
        }
      }

      ball.velocity.multiplyScalar(DAMPING)
      const speed = ball.velocity.length()
      if (speed > MAX_SPEED) ball.velocity.multiplyScalar(MAX_SPEED / speed)
      ball.position.addScaledVector(ball.velocity, 1)

      // Soft leash around ring center — orbit path itself never moves
      tmp.copy(ball.position).sub(anchor)
      const leash = tmp.length()
      if (leash > softBound) {
        tmp.multiplyScalar(softBound / leash)
        ball.position.copy(anchor).add(tmp)
        ball.velocity.multiplyScalar(0.8)
      }

      ball.mesh.position.copy(ball.position)
    }

    // Decay swipe speed so a stopped cursor ends the stroke
    pointerSpeedPx *= 0.78
    pointerVel.multiplyScalar(0.82)

    renderer.render(scene, camera)
  }

  runFrame = tick
  if (props.active) startLoop()
  else stopLoop()
})

onUnmounted(() => {
  stopLoop()
  runFrame = null
  resizeObserver?.disconnect()
  removePointerListeners?.()
  removeScrollPause?.()
  sharedGeometry?.dispose()
  envMap?.dispose()
  microNormal?.dispose()
  microRough?.dispose()
  for (const ball of balls) {
    const material = ball.mesh.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material.dispose()
  }
  balls = []
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }
})
</script>

<template>
  <div
    ref="canvasHost"
    class="hero-swarm size-full touch-pan-y"
    aria-hidden="true"
  />
</template>

<style scoped>
.hero-swarm {
  cursor: grab;
  /* Belt-and-suspenders: never let the GL surface own vertical gestures. */
  touch-action: pan-y;
}

.hero-swarm:active {
  cursor: grabbing;
}

.hero-swarm :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
