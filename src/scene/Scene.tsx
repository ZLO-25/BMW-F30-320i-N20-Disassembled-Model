import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, PerformanceMonitor } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DataBundle } from '../core/loadData'
import { useAppStore } from '../store/useAppStore'
import { PartNode, PartRegistryCtx } from './PartNode'
import { AnimationDriver } from './AnimationDriver'
import { PerfStats, statsEnabled } from './PerfStats'
import type { Detail } from './procedural'

const CAMERA_POS = new THREE.Vector3(2.7, 1.5, 2.3)
const TARGET = new THREE.Vector3(1.15, 0.55, 0)

/** 依裝置粗略決定面數、陰影與像素比：手機要撐 30fps */
function pickDetail(): Detail {
  // 網址加 ?quality=low|mid|high 可以強制畫質（弱電腦或測試用）
  const q = new URLSearchParams(location.search).get('quality')
  if (q === 'low' || q === 'mid' || q === 'high') return q
  const cores = navigator.hardwareConcurrency ?? 4
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
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
 * 環境光：用 three 內建的「攝影棚房間」即時產生反射貼圖。
 * 不從網路抓 HDR 檔，離線、GitHub Pages、被擋的網路都能用。
 */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = intensity
    return () => { scene.environment = null; env.dispose(); pmrem.dispose() }
  }, [gl, scene, intensity])
  return null
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
  const mobile = detail !== 'high'
  const shadows = !mobile
  // 自動降解析度：連續掉到 30 fps 以下就把像素比降到 1，順了再慢慢升回去（上限：手機 1.5、桌機 2）
  const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
  const [dpr, setDpr] = useState(maxDpr)

  return (
    <Canvas
      dpr={dpr}
      shadows={shadows}
      camera={{ position: CAMERA_POS.toArray(), fov: 42, near: 0.05, far: 100 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: !mobile, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <PerformanceMonitor bounds={() => [30, 55]} flipflops={4}
        onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} onFallback={() => setDpr(1)} />
      <color attach="background" args={['#15171b']} />
      <StudioEnvironment intensity={mobile ? 0.7 : 0.85} />
      <hemisphereLight intensity={0.35} groundColor="#1a1a1a" />
      <directionalLight position={[4, 6, 3]} intensity={2.2} castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.01}
        shadow-camera-left={-2.5} shadow-camera-right={2.5} shadow-camera-top={2.5} shadow-camera-bottom={-2.5} shadow-camera-near={1} shadow-camera-far={16} />
      <directionalLight position={[-3, 2.5, -4]} intensity={0.6} />
      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.35} />
        </mesh>
      )}
      <Grid args={[20, 20]} position={[0, 0.001, 0]} cellColor="#262a31" sectionColor="#363c46" fadeDistance={16} infiniteGrid />
      <PartRegistryCtx.Provider value={registry}>
        {data.graph.roots.map(r => <PartNode key={r.id} part={r} graph={data.graph} detail={detail} shadows={shadows} />)}
        <AnimationDriver />
      </PartRegistryCtx.Provider>
      <OrbitControls ref={controls} makeDefault target={TARGET.toArray()} enableDamping dampingFactor={0.1}
        minDistance={0.25} maxDistance={12} maxPolarAngle={Math.PI * 0.78} />
      <CameraReset controls={controls} />
      <SectionPlane />
      {statsEnabled() && <PerfStats />}
    </Canvas>
  )
}
