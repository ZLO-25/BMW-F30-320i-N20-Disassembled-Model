/**
 * R1 光與環境：讓零件像是放在真的修車廠裡。
 *
 *   ┌──────────── 修車廠環境（workshop.ts，載入時算一次）────────────┐
 *   │  日光燈管、捲門天光、工具櫃 ──► 金屬與車漆的反射、整體環境光      │
 *   └───────────────────────────────────────────────────────────────┘
 *        │
 *        ├─ 背景：工作室模式 = 同一張環境圖（模糊、調暗）；簡潔模式 = 原本的深色
 *        ├─ 地面：工作室模式 = 水泥地（有伸縮縫、油漬）；簡潔模式 = 原本的格線
 *        ├─ 接觸陰影：車底、輪胎下那圈柔和的暗影（high / mid）
 *        └─ 工作燈：鏡頭拉近時自動亮起，像技師拿手電筒照進引擎室
 *
 * 全部都不連網、不需要圖檔。low（弱手機）不掛接觸陰影。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Grid } from '@react-three/drei'
import { useAppStore } from '../store/useAppStore'
import { buildWorkshop, disposeWorkshop, concreteMaterial } from './workshop'
import type { Detail } from './procedural'

/** 背景與格線顏色（簡潔模式）。開 AO 時最後的 ACES 會把顏色壓暗，所以那組先調亮（U6 的補償，見 CLAUDE.md） */
export const STUDIO_COLORS = {
  plain: { bg: '#15171b', cell: '#262a31', section: '#363c46' },
  ao: { bg: '#27292d', cell: '#36393f', section: '#42474f' },
}

/**
 * 環境光 + 背景。環境貼圖只在第一次算（PMREM 把小房間烘成一張反射圖），切換背景模式不會重算。
 */
export function WorkshopEnvironment({ intensity, bg }: { intensity: number; bg: string }) {
  const { gl, scene } = useThree()
  const stage = useAppStore(s => s.stage)
  const [env, setEnv] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = buildWorkshop()
    const tex = pmrem.fromScene(room, 0.02).texture
    disposeWorkshop(room)
    pmrem.dispose()
    setEnv(tex)
    return () => { tex.dispose() }
  }, [gl])
  useEffect(() => {
    if (!env) return
    scene.environment = env
    scene.environmentIntensity = intensity
    return () => { scene.environment = null }
  }, [scene, env, intensity])
  useEffect(() => {
    if (stage === 'workshop' && env) {
      scene.background = env
      scene.backgroundBlurriness = 0.45
      scene.backgroundIntensity = 0.5
    } else {
      scene.background = new THREE.Color(bg)
      scene.backgroundBlurriness = 0
      scene.backgroundIntensity = 1
    }
  }, [scene, env, stage, bg])
  return null
}

/** 地面：修車廠 = 水泥地（接收陰影）；簡潔 = 原本的格線 + 只畫陰影的透明地板 */
export function StageFloor({ shadows, colors }: { shadows: boolean; colors: { cell: string; section: string } }) {
  const stage = useAppStore(s => s.stage)
  // 40 m × 40 m，貼圖每 3 m 重複一次（伸縮縫間距）
  const concrete = useMemo(() => concreteMaterial(40 / 3), [])
  useEffect(() => () => { concrete.map?.dispose(); concrete.roughnessMap?.dispose(); concrete.dispose() }, [concrete])
  if (stage === 'workshop') {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows} material={concrete}>
        <planeGeometry args={[40, 40]} />
      </mesh>
    )
  }
  return (
    <>
      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.35} />
        </mesh>
      )}
      <Grid args={[20, 20]} position={[0, 0.001, 0]} cellColor={colors.cell} sectionColor={colors.section} fadeDistance={16} infiniteGrid />
    </>
  )
}

/**
 * 接觸陰影：從車底往上拍一張深度圖再模糊，得到輪胎、底盤正下方那圈柔和的暗影
 * （平行光的陰影做不出這種「貼地才有」的效果）。
 *
 * 每畫一次等於多畫一遍整台車，所以不每格更新：零件拆裝、爆炸圖、顯示設定改變後，
 * 等最後一次變動過了 SETTLE_MS（零件飛出去的動畫大約 0.6 秒）再重畫 FRAMES 格，之後就停住。
 * 動畫進行中陰影會晚一點跟上，換來手機上幾乎不花效能。
 */
const FRAMES = 2
const SETTLE_MS = 650
export function SoftContactShadows({ detail }: { detail: Detail }) {
  const removed = useAppStore(s => s.removedIds)
  const explode = useAppStore(s => s.explode)
  const sysVis = useAppStore(s => s.sysVis)
  const bodyMode = useAppStore(s => s.bodyMode)
  const variant = useAppStore(s => s.variant)
  const [key, setKey] = useState(0)
  // 拖爆炸圖滑桿時每一格都會改值：只在停下來之後重畫一次
  useEffect(() => {
    const id = setTimeout(() => setKey(k => k + 1), SETTLE_MS)
    return () => clearTimeout(id)
  }, [removed, explode, sysVis, bodyMode, variant])
  if (detail === 'low') return null
  return (
    <ContactShadows key={key} frames={FRAMES} position={[0, 0.003, 0]} scale={[6.4, 3.4]}
      resolution={detail === 'high' ? 1024 : 512} blur={3.4} far={1.4} opacity={0.8} color="#000000" />
  )
}

/**
 * 工作燈：跟著鏡頭的聚光燈，從鏡頭右上方照向畫面中心（OrbitControls 的 target）。
 * 離得遠（> 2.4 m）完全不亮；越靠近越亮，照進引擎室深處，像技師拿手電筒。
 * 強度乘上距離平方，所以照到東西上的亮度不會因為拉近而爆掉。
 */
const NEAR = 0.7, FAR = 2.4
export function WorkLight() {
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const { camera, controls, scene } = useThree()
  useEffect(() => { scene.add(target); return () => { scene.remove(target) } }, [scene, target])
  const right = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const l = light.current
    const c = controls as unknown as { target?: THREE.Vector3 } | null
    if (!l || !c?.target) return
    const dist = camera.position.distanceTo(c.target)
    const k = THREE.MathUtils.clamp((FAR - dist) / (FAR - NEAR), 0, 1)
    l.visible = k > 0.001
    if (!l.visible) return
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    l.position.copy(camera.position).addScaledVector(right, 0.12).addScaledVector(up, 0.1)
    target.position.copy(c.target)
    l.target = target
    l.intensity = k * k * 3.2 * dist * dist
  })
  return <spotLight ref={light} angle={0.5} penumbra={0.85} decay={2} distance={0} color="#fff4e6" castShadow={false} />
}
