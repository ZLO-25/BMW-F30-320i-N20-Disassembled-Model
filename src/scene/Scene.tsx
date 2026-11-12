import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { EffectComposer, N8AO, ToneMapping, Bloom } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { DataBundle } from '../core/loadData'
import { useAppStore } from '../store/useAppStore'
import { PartNode, PartRegistryCtx, ghostTuning } from './PartNode'
import { AnimationDriver } from './AnimationDriver'
import { PerfStats, statsEnabled, benchEnabled } from './PerfStats'
import { Bench } from './Bench'
import { redraw, tickRedraw } from './redraw'
import { WorkshopEnvironment, StageFloor, SoftContactShadows, WorkLight, PaintSync, STUDIO_COLORS } from './Stage'
import { Governor, profileFor, type QualityProfile } from '../core/quality'

const CAMERA_POS = new THREE.Vector3(2.7, 1.5, 2.3)
const TARGET = new THREE.Vector3(1.15, 0.55, 0)

function CameraReset({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const token = useAppStore(s => s.cameraResetToken)
  const focus = useAppStore(s => s.focus)
  const { camera } = useThree()
  useEffect(() => {
    camera.position.copy(CAMERA_POS)
    controls.current?.target.copy(TARGET)
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

/**
 * U6 環境遮蔽（AO）：角落、縫隙、零件互相靠近的地方自然變暗，立體感差很多。
 *
 *   一般繪製 ──► 深度圖 ──► N8AO 算「這一點周圍被擋住多少」──► 變暗 ──► ACES 色調 ──► 畫面
 *
 * 只在 high / mid 開；low（手機）整段不掛，回到 U6 之前的直接繪製。
 * 掛了後處理之後，色調映射（ACES）改由最後一步 ToneMapping 做，renderer 自己的那份會被關掉。
 * ?ao=0 可以強制關掉（比較前後、或電腦太慢時用）。
 */
/** ?ao=0 強制關掉 AO（比較前後、或電腦太慢時用） */
const AO_FORCED_OFF = new URLSearchParams(location.search).get('ao') === '0'

const GHOST_SCALE_AO = 0.3

/** 後處理：AO / Bloom / 抗鋸齒取樣數都由畫質設定檔（core/quality.ts）決定 */
function PostFX({ profile }: { profile: QualityProfile }) {
  const full = profile.ao === 'full'
  return (
    <EffectComposer multisampling={profile.msaa}>
      {/* 半徑單位是公尺：0.15 m ≈ 零件之間的縫隙、螺栓座、凹槽這種尺度 */}
      <N8AO aoRadius={0.15} distanceFalloff={0.6} intensity={full ? 3 : 2.5} quality={full ? 'medium' : 'low'} halfRes={!full} />
      {/* R1：只有真的很亮的地方（燈管在鍍鉻、車漆上的反光）才會微微泛光，像相機拍到的那樣；只在 L5 */}
      {profile.bloom ? <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.3} intensity={0.35} mipmapBlur radius={0.55} /> : null}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

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

export function Scene({ data }: { data: DataBundle }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const registry = useMemo(() => new Map<string, THREE.Object3D>(), [])
  const select = useAppStore(s => s.select)
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
      frameloop="demand"
      dpr={dpr}
      shadows={shadows}
      camera={{ position: CAMERA_POS.toArray(), fov: 42, near: 0.05, far: 100 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: profile.nativeAA, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
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
        minDistance={0.25} maxDistance={12} maxPolarAngle={Math.PI * 0.78} />
      <CameraReset controls={controls} />
      <SectionPlane />
      {ao && <PostFX profile={profile} />}
      {statsEnabled() && <PerfStats />}
      {benchEnabled() && <Bench detail={detail} />}
    </Canvas>
  )
}
