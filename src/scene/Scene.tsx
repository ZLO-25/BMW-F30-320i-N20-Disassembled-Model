import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { DataBundle } from '../core/loadData'
import { useAppStore } from '../store/useAppStore'
import { PartNode, PartRegistryCtx, ghostTuning } from './PartNode'
import { AnimationDriver } from './AnimationDriver'
import { PerfStats, statsEnabled, benchEnabled } from './PerfStats'
import { Bench } from './Bench'
import { bootSet, bootDone } from '../boot'
import { redraw, tickRedraw } from './redraw'
import { WorkshopEnvironment, StageFloor, SoftContactShadows, WorkLight, PaintSync, STUDIO_COLORS } from './Stage'
import { Governor, profileFor } from '../core/quality'

/** E3：後處理（N8AO、postprocessing 約 100 KB gzip）延遲載入；L0／L1 完全用不到就不下載。分包規則見 vite.config.ts */
const PostFX = lazy(() => import('./PostFX').then(m => ({ default: m.PostFX })))

const CAMERA_POS = new THREE.Vector3(2.7, 1.5, 2.3)   // 只用於建立 Canvas 時的初始值；掛載後 CameraReset 立刻換成 defaultView()
const TARGET = new THREE.Vector3(0.1, 0.55, 0)

/**
 * E5 預設視角：退到看得到整台車（約 4.7 × 1.8 × 1.4 m，中心在 x≈0.1），距離依畫面長寬比算——
 * 寬螢幕近一點，手機直式要退很遠才塞得下車長。以前是固定 (2.7, 1.5, 2.3)，前輪占滿前景、車尾在畫面外。
 */
const CAR_CENTER = new THREE.Vector3(0.1, 0.55, 0)
const VIEW_DIR = new THREE.Vector3(0.62, 0.3, 0.72).normalize()
const CAR_HALF_SPAN = 2.75   // 車長 + 一點邊界，沿視線方向投影後的半寬（公尺）
export function defaultView(aspect: number, fovDeg = 42): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const tanH = Math.tan((fovDeg * Math.PI) / 360) * Math.max(0.3, aspect)
  const dist = Math.min(14, Math.max(4.2, CAR_HALF_SPAN / tanH))
  return { pos: CAR_CENTER.clone().addScaledVector(VIEW_DIR, dist), target: CAR_CENTER.clone() }
}

function CameraReset({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const token = useAppStore(s => s.cameraResetToken)
  const focus = useAppStore(s => s.focus)
  const { camera, size } = useThree()
  useEffect(() => {
    const v = defaultView(size.width / Math.max(1, size.height))
    camera.position.copy(v.pos)
    controls.current?.target.copy(v.target)
    controls.current?.update()
    redraw()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  // 鏡頭對準某個點（動畫面板用）：從右後上方看，距離 dist
  useEffect(() => {
    if (!focus) return
    const t = new THREE.Vector3(...focus.target)
    camera.position.copy(t).add(new THREE.Vector3(-0.55, 0.45, 1).normalize().multiplyScalar(focus.dist))
    controls.current?.target.copy(t)
    controls.current?.update()
    redraw()
  }, [focus?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** E5：資訊卡的「看這個零件」。依該零件在場景裡的世界包圍盒對準；距離 = 大小的 2.5 倍（最近 0.35 m）。選取零件時不會自動移鏡頭，避免使用者迷失方向 */
function FocusPart({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const req = useAppStore(s => s.focusPartReq)
  const registry = useContext(PartRegistryCtx)
  const { camera } = useThree()
  useEffect(() => {
    if (!req) return
    const obj = registry.get(req.id)
    if (!obj) return
    obj.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(obj)
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const dist = Math.max(0.35, box.getSize(new THREE.Vector3()).length() * 2.5)
    camera.position.copy(c).add(VIEW_DIR.clone().multiplyScalar(dist))
    controls.current?.target.copy(c)
    controls.current?.update()
    redraw()
  }, [req?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** ?ao=0 強制關掉 AO（比較前後、或電腦太慢時用） */
const AO_FORCED_OFF = new URLSearchParams(location.search).get('ao') === '0'

const GHOST_SCALE_AO = 0.3

/**
 * E2 自動降級：量「連續在畫」期間的每格時間，連續兩個 1 秒窗口的中位數都高於 28 ms 就降一級。
 * 靜止（按需渲染沒在畫）的空檔不算；載入後前 2 秒不量（著色器還在編譯）；只降不升。
 * 使用者手動選過畫質、或網址強制指定畫質時不會動。
 */
function QualityGovernor() {
  const enabled = useAppStore(s => s.qualityMode === 'auto' && !s.qualityLocked)
  const level = useAppStore(s => s.qualityLevel)
  const gov = useRef<Governor | null>(null)
  const last = useRef(0)
  useEffect(() => { gov.current = new Governor(performance.now()); last.current = 0 }, [level, enabled])
  useFrame(() => {
    const now = performance.now()
    const dt = last.current ? now - last.current : 0
    last.current = now
    if (!enabled || !gov.current || dt === 0 || document.hidden) return
    if (gov.current.push(now, dt)) useAppStore.getState().degradeQuality()
  }, -1000)
  return null
}

/** 剖面：整個畫面共用一個切割平面。x = 橫切（看前後），z = 縱切（看左右） */
function SectionPlane() {
  const { gl } = useThree()
  const axis = useAppStore(s => s.sectionAxis)
  const pos = useAppStore(s => s.sectionPos)
  useEffect(() => {
    if (axis === 'off') { gl.clippingPlanes = []; redraw(true); return }
    const n = axis === 'x' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1)
    gl.clippingPlanes = [new THREE.Plane(n, pos)]
    redraw(true)
    return () => { gl.clippingPlanes = [] }
  }, [gl, axis, pos])
  return null
}

/**
 * E1：按需渲染的安全網。store 裡任何東西改變（選取、拆裝、爆炸、顯示、模式……）就重畫幾格；
 * 其中會改變外形的欄位另外要求更新陰影圖。陰影圖本身不再每格重畫（見下面 ShadowSync）。
 */
const SHAPE_KEYS = ['removedIds', 'explode', 'sysVis', 'bodyMode', 'variant', 'anim'] as const
function InvalidateOnStore() {
  useEffect(() => useAppStore.subscribe((s, prev) => {
    const shape = SHAPE_KEYS.some(k => s[k] !== prev[k])
    redraw(shape)
  }), [])
  return null
}

/**
 * E1：陰影圖不要每格把整台車再畫一遍（實測 high 的 draw call 差一倍）。
 * 平行光不動，只有「物體動了／出現／消失」陰影才會變：這時 redraw(true)，這裡就在接下來幾格更新陰影圖。
 * 同時負責「補畫幾格」：每格消耗一次 redraw() 登記的額外格數（見 redraw.ts）。
 */
function RedrawDriver({ shadows }: { shadows: boolean }) {
  const gl = useThree(s => s.gl)
  const invalidate = useThree(s => s.invalidate)
  useEffect(() => {
    if (!shadows) return
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    // 載入時零件陸續就位、effect 陸續套用 castShadow：開頭幾秒多補幾次
    const ids = [300, 1000, 3000].map(ms => setTimeout(() => redraw(true), ms))
    return () => { ids.forEach(clearTimeout); gl.shadowMap.autoUpdate = true }
  }, [gl, shadows])
  useFrame(() => {
    const { more, shadow } = tickRedraw()
    if (shadows && shadow) gl.shadowMap.needsUpdate = true
    if (more) invalidate()
  }, -900)
  return null
}

/**
 * E3 開機：場景掛載後先用 compileAsync 把著色器編好（支援平行編譯的瀏覽器上不會卡住主執行緒，載入畫面的動畫還在動），
 * 編完才開始畫第一格（Canvas 在這之前是 frameloop="never"）。第一格畫出來就收掉載入畫面。
 * 不支援的瀏覽器上 compileAsync 會退回同步編譯，效果和以前一樣，不會更差。
 */
function BootGate({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    bootSet(66, '組裝零件、編譯著色器… / Building parts, compiling shaders…')
    let alive = true
    const id = setTimeout(async () => {   // 等一個 tick，讓零件的 primitive 都掛上 scene
      try { await gl.compileAsync(scene, camera) } catch { /* 編譯失敗就讓第一次繪製去報錯 */ }
      if (alive) onReady()
    }, 0)
    return () => { alive = false; clearTimeout(id) }
  }, [gl, scene, camera, onReady])
  return null
}

/**
 * E4：拖曳旋轉時停止「滑鼠掃過哪個零件」的偵測。按下後移動超過 4 px 才算拖曳（單純點一下不受影響，點選零件照常）；
 * 放開後下一個 tick 恢復，所以拖曳結束那一下不會誤點到零件。
 */
function DragGuard() {
  const gl = useThree(s => s.gl)
  const setEvents = useThree(s => s.setEvents)
  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number } | null = null
    let off = false
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onMove = (e: PointerEvent) => {
      if (!down || off) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { off = true; setEvents({ enabled: false }) }
    }
    const onUp = () => { down = null; if (off) { off = false; setTimeout(() => setEvents({ enabled: true }), 0) } }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp)
      if (off) setEvents({ enabled: true })
    }
  }, [gl, setEvents])
  return null
}

/** 第一格真的畫出來之後收掉載入畫面 */
function FirstFrame() {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    bootSet(100, '完成 / Ready')
    bootDone()
  }, -800)
  return null
}

export function Scene({ data }: { data: DataBundle }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const registry = useMemo(() => new Map<string, THREE.Object3D>(), [])
  const select = useAppStore(s => s.select)
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => { setReady(true); redraw() }, [])
  const level = useAppStore(s => s.qualityLevel)
  const qmode = useAppStore(s => s.qualityMode)
  const mobileDevice = useAppStore(s => s.mobile)
  const setPostfx = useAppStore(s => s.setPostfx)
  const profile = useMemo(() => profileFor(level, mobileDevice, qmode === 'fine'), [level, mobileDevice, qmode])
  const detail = profile.detail
  const ao = profile.ao !== 'off' && !AO_FORCED_OFF
  // AO 開啟時：最後一步的 ACES 也會套到背景與格線上（會變得幾乎全黑），所以先給亮一點的顏色，
  // 算過 ACES 之後剛好回到原本的 #15171b / #262a31 / #363c46；半透明倍率也一起調（見 PartNode ghostTuning）。
  // E2：AO 可以在執行中被關掉，所以 postfx 旗標放進 store，PartNode 看到變化會重套透明度。
  const bg = ao ? STUDIO_COLORS.ao : STUDIO_COLORS.plain
  ghostTuning.scale = ao ? GHOST_SCALE_AO : 1
  useEffect(() => { setPostfx(ao) }, [ao, setPostfx])
  const shadows = profile.shadowMap > 0
  const dpr = Math.min(window.devicePixelRatio || 1, profile.dprMax)

  return (
    <Canvas
      key={profile.nativeAA ? 'aa' : 'plain'}   // 原生抗鋸齒在建立繪圖環境時決定，只有 L2 ↔ 其他級之間切換才需要重建畫布
      frameloop={ready ? 'demand' : 'never'}
      dpr={dpr}
      shadows={shadows}
      camera={{ position: CAMERA_POS.toArray(), fov: 42, near: 0.05, far: 100 }}
      raycaster={{ firstHitOnly: true } as never}   // E4：配合 BVH，只回傳最近的一個三角形
      onPointerMissed={() => select(null)}
      gl={{ antialias: profile.nativeAA, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <BootGate onReady={onReady} />
      <FirstFrame />
      <DragGuard />
      <InvalidateOnStore />
      <RedrawDriver shadows={shadows} />
      <QualityGovernor />
      <WorkshopEnvironment intensity={detail === 'high' ? 1 : 0.9} bg={bg.bg} />
      <hemisphereLight intensity={0.35} groundColor="#1a1a1a" />
      <directionalLight key={profile.shadowMap} position={[4, 6, 3]} intensity={2.2} castShadow={shadows}
        shadow-mapSize={[profile.shadowMap || 1024, profile.shadowMap || 1024]} shadow-bias={-0.0004} shadow-normalBias={0.01}
        shadow-camera-left={-2.5} shadow-camera-right={2.5} shadow-camera-top={2.5} shadow-camera-bottom={-2.5} shadow-camera-near={1} shadow-camera-far={16} />
      <directionalLight position={[-3, 2.5, -4]} intensity={0.6} />
      <StageFloor shadows={shadows} colors={bg} />
      <SoftContactShadows resolution={profile.contact} />
      <WorkLight />
      <PaintSync />
      <PartRegistryCtx.Provider value={registry}>
        {data.graph.roots.map(r => <PartNode key={r.id} part={r} graph={data.graph} detail={detail} shadows={shadows} />)}
        <AnimationDriver />
      </PartRegistryCtx.Provider>
      <OrbitControls ref={controls} makeDefault target={TARGET.toArray()} enableDamping dampingFactor={0.1}
        minDistance={0.25} maxDistance={20} maxPolarAngle={Math.PI * 0.78} />
      <CameraReset controls={controls} />
      <PartRegistryCtx.Provider value={registry}><FocusPart controls={controls} /></PartRegistryCtx.Provider>
      <SectionPlane />
      {ao && <Suspense fallback={null}><PostFX profile={profile} /></Suspense>}
      {statsEnabled() && <PerfStats />}
      {benchEnabled() && <Bench detail={detail} />}
    </Canvas>
  )
}
