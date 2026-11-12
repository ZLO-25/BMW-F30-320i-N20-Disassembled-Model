import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { EffectComposer, N8AO, ToneMapping, Bloom } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { DataBundle } from '../core/loadData'
import { useAppStore } from '../store/useAppStore'
import { PartNode, PartRegistryCtx, ghostTuning } from './PartNode'
import { AnimationDriver } from './AnimationDriver'
import { PerfStats, statsEnabled } from './PerfStats'
import { OverlayCamera, DEFAULT_FOV } from './OverlayCamera'
import { useOverlayStore, overlayCamera } from '../store/useOverlayStore'
import { WorkshopEnvironment, StageFloor, SoftContactShadows, WorkLight, PaintSync, STUDIO_COLORS } from './Stage'
import type { Detail } from './procedural'

const CAMERA_POS = new THREE.Vector3(2.7, 1.5, 2.3)
const TARGET = new THREE.Vector3(1.15, 0.55, 0)

/** 依裝置粗略決定面數、陰影與像素比：手機要撐 30fps */
function pickDetail(): Detail {
  // 網址加 ?quality=low|mid|high 可以強制畫質（弱電腦或測試用）
  const q = new URLSearchParams(location.search).get('quality')
  if (q === 'low' || q === 'mid' || q === 'high') return q
  const cores = navigator.hardwareConcurrency ?? 4
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1   // iPadOS 的 Safari 會偽裝成桌機
  if (mobile && cores <= 4) return 'low'
  if (mobile) return 'mid'
  return 'high'
}

function CameraReset({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const token = useAppStore(s => s.cameraResetToken)
  const focus = useAppStore(s => s.focus)
  const { camera } = useThree()
  useEffect(() => {
    camera.position.copy(CAMERA_POS)
    controls.current?.target.copy(TARGET)
    controls.current?.update()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  // 鏡頭對準某個點（動畫面板用）：從右後上方看，距離 dist
  useEffect(() => {
    if (!focus) return
    const t = new THREE.Vector3(...focus.target)
    camera.position.copy(t).add(new THREE.Vector3(-0.55, 0.45, 1).normalize().multiplyScalar(focus.dist))
    controls.current?.target.copy(t)
    controls.current?.update()
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
export const aoEnabled = (detail: Detail) => detail !== 'low' && new URLSearchParams(location.search).get('ao') !== '0'

const GHOST_SCALE_AO = 0.3

function PostFX({ detail }: { detail: Detail }) {
  const high = detail === 'high'
  return (
    <EffectComposer multisampling={high ? 4 : 0}>
      {/* 半徑單位是公尺：0.15 m ≈ 零件之間的縫隙、螺栓座、凹槽這種尺度 */}
      <N8AO aoRadius={0.15} distanceFalloff={0.6} intensity={high ? 3 : 2.5} quality={high ? 'medium' : 'low'} halfRes={!high} />
      {/* R1：只有真的很亮的地方（燈管在鍍鉻、車漆上的反光）才會微微泛光，像相機拍到的那樣；只在 high */}
      {high ? <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.3} intensity={0.35} mipmapBlur radius={0.55} /> : null}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

/** 剖面：整個畫面共用一個切割平面。x = 橫切（看前後），z = 縱切（看左右） */
function SectionPlane() {
  const { gl } = useThree()
  const axis = useAppStore(s => s.sectionAxis)
  const pos = useAppStore(s => s.sectionPos)
  useEffect(() => {
    if (axis === 'off') { gl.clippingPlanes = []; return }
    const n = axis === 'x' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1)
    gl.clippingPlanes = [new THREE.Plane(n, pos)]
    return () => { gl.clippingPlanes = [] }
  }, [gl, axis, pos])
  return null
}

export function Scene({ data }: { data: DataBundle }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const registry = useMemo(() => new Map<string, THREE.Object3D>(), [])
  const select = useAppStore(s => s.select)
  const detail = useMemo(pickDetail, [])
  // R6-B：疊遠拍、變焦的照片時鏡頭要能退得很遠
  const overlayOn = useOverlayStore(overlayCamera)
  const ao = aoEnabled(detail)
  // AO 開啟時：最後一步的 ACES 也會套到背景與格線上（會變得幾乎全黑），所以先給亮一點的顏色，
  // 算過 ACES 之後剛好回到原本的 #15171b / #262a31 / #363c46；半透明倍率也一起調（見 PartNode ghostTuning）
  const bg = ao ? STUDIO_COLORS.ao : STUDIO_COLORS.plain
  ghostTuning.scale = ao ? GHOST_SCALE_AO : 1
  const mobile = detail !== 'high'
  const shadows = !mobile
  // 自動降解析度：連續掉到 30 fps 以下就把像素比降到 1，順了再慢慢升回去（上限：手機 1.5、桌機 2）
  const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
  const [dpr, setDpr] = useState(maxDpr)

  return (
    <Canvas
      dpr={dpr}
      shadows={shadows}
      camera={{ position: CAMERA_POS.toArray(), fov: DEFAULT_FOV, near: 0.05, far: 100 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: !mobile, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <PerformanceMonitor bounds={() => [30, 55]} flipflops={4}
        onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} onFallback={() => setDpr(1)} />
      <WorkshopEnvironment intensity={mobile ? 0.9 : 1} bg={bg.bg} />
      <hemisphereLight intensity={0.35} groundColor="#1a1a1a" />
      <directionalLight position={[4, 6, 3]} intensity={2.2} castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.01}
        shadow-camera-left={-2.5} shadow-camera-right={2.5} shadow-camera-top={2.5} shadow-camera-bottom={-2.5} shadow-camera-near={1} shadow-camera-far={16} />
      <directionalLight position={[-3, 2.5, -4]} intensity={0.6} />
      <StageFloor shadows={shadows} colors={bg} />
      <SoftContactShadows detail={detail} />
      <WorkLight />
      <PaintSync />
      <PartRegistryCtx.Provider value={registry}>
        {data.graph.roots.map(r => <PartNode key={r.id} part={r} graph={data.graph} detail={detail} shadows={shadows} />)}
        <AnimationDriver />
      </PartRegistryCtx.Provider>
      <OrbitControls ref={controls} makeDefault target={TARGET.toArray()} enableDamping dampingFactor={0.1}
        minDistance={0.25} maxDistance={overlayOn ? 40 : 12} maxPolarAngle={Math.PI * 0.78} />
      <CameraReset controls={controls} />
      <OverlayCamera />
      <SectionPlane />
      {ao && <PostFX detail={detail} />}
      {statsEnabled() && <PerfStats />}
    </Canvas>
  )
}
