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
import { Grid } from '@react-three/drei'
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib'
import { redraw } from './redraw'
import { useAppStore } from '../store/useAppStore'
import { buildWorkshop, disposeWorkshop, concreteMaterial } from './workshop'
import { applyPaint } from './procedural/registry'

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
    redraw()
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
    redraw()
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
export function SoftContactShadows({ resolution }: { resolution: 0 | 512 | 1024 }) {
  const removed = useAppStore(s => s.removedIds)
  const explode = useAppStore(s => s.explode)
  const sysVis = useAppStore(s => s.sysVis)
  const bodyMode = useAppStore(s => s.bodyMode)
  const variant = useAppStore(s => s.variant)
  const [trigger, setTrigger] = useState(0)
  // 拖爆炸圖滑桿時每一格都會改值：只在停下來之後重畫一次
  useEffect(() => {
    const id = setTimeout(() => setTrigger(k => k + 1), SETTLE_MS)
    return () => clearTimeout(id)
  }, [removed, explode, sysVis, bodyMode, variant])
  if (resolution === 0) return null
  return <ContactShadowPlane trigger={trigger} resolution={resolution} />
}

/**
 * 接觸陰影的繪製本體（照 drei ContactShadows 的做法改寫）。
 * 為什麼不直接用 drei 的：它要重畫只能靠換 key 重新掛載，而且卸載時不會釋放兩張渲染目標
 * （實測切換變速箱 6 次貼圖 +24，E0 的 F12）。這裡用 trigger 數字重畫，卸載時一定 dispose。
 */
const CS_SCALE: [number, number] = [6.4, 3.4]
function ContactShadowPlane({ trigger, resolution }: { trigger: number; resolution: number }) {
  const { gl, scene } = useThree()
  const group = useRef<THREE.Group>(null)
  const cam = useRef<THREE.OrthographicCamera>(null)
  const pending = useRef(FRAMES)
  const blur = 3.4
  const res = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution)
    const targetBlur = new THREE.WebGLRenderTarget(resolution, resolution)
    target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false
    const plane = new THREE.PlaneGeometry(CS_SCALE[0], CS_SCALE[1]).rotateX(Math.PI / 2)
    const blurPlane = new THREE.Mesh(plane)
    const depth = new THREE.MeshDepthMaterial()
    depth.depthTest = depth.depthWrite = false
    depth.onBeforeCompile = (shader) => {
      shader.uniforms = { ...shader.uniforms, ucolor: { value: new THREE.Color('#000000') } }
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ucolor;\n void main() {')
        .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );')
    }
    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader)
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader)
    vBlur.depthTest = hBlur.depthTest = false
    const mat = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity: 0.8, depthWrite: false })
    return { target, targetBlur, plane, blurPlane, depth, hBlur, vBlur, mat }
  }, [resolution])
  useEffect(() => () => {
    res.target.dispose(); res.targetBlur.dispose(); res.plane.dispose(); res.depth.dispose()
    res.hBlur.dispose(); res.vBlur.dispose(); res.mat.dispose()
  }, [res])
  useEffect(() => { pending.current = FRAMES; redraw() }, [trigger, res])

  const blurPass = (amount: number) => {
    const c = cam.current!
    res.blurPlane.visible = true
    res.blurPlane.material = res.hBlur
    res.hBlur.uniforms.tDiffuse.value = res.target.texture
    res.hBlur.uniforms.h.value = amount / 256
    gl.setRenderTarget(res.targetBlur); gl.render(res.blurPlane, c)
    res.blurPlane.material = res.vBlur
    res.vBlur.uniforms.tDiffuse.value = res.targetBlur.texture
    res.vBlur.uniforms.v.value = amount / 256
    gl.setRenderTarget(res.target); gl.render(res.blurPlane, c)
    res.blurPlane.visible = false
  }
  useFrame(() => {
    const c = cam.current, g = group.current
    if (!c || !g || pending.current <= 0) return
    pending.current--
    const bg = scene.background, ov = scene.overrideMaterial
    g.visible = false
    scene.background = null
    scene.overrideMaterial = res.depth
    gl.setRenderTarget(res.target)
    gl.render(scene, c)
    blurPass(blur)
    blurPass(blur * 0.4)
    gl.setRenderTarget(null)
    g.visible = true
    scene.overrideMaterial = ov
    scene.background = bg
    if (pending.current > 0) redraw()
  })
  return (
    <group ref={group} position={[0, 0.003, 0]} rotation-x={Math.PI / 2}>
      <mesh geometry={res.plane} material={res.mat} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      <orthographicCamera ref={cam} args={[-CS_SCALE[0] / 2, CS_SCALE[0] / 2, CS_SCALE[1] / 2, -CS_SCALE[1] / 2, 0, 1.4]} />
    </group>
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
    // E1：燈一直在場景裡（visible 不切換），遠的時候強度 0。切換 visible 會改變場景的燈數，
    // three 會讓所有材質重新編譯著色器（E0 實測第一次拉近 +17 支，會頓一下）。
    l.intensity = k * k * 3.2 * dist * dist
    if (k <= 0.001) return
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    l.position.copy(camera.position).addScaledVector(right, 0.12).addScaledVector(up, 0.1)
    target.position.copy(c.target)
    l.target = target
  })
  return <spotLight ref={light} angle={0.5} penumbra={0.85} decay={2} distance={0} color="#fff4e6" castShadow={false} />
}

/** R3 車漆：選單換顏色時直接改場景裡所有車漆材質（之後新載入的零件也會用新顏色） */
export function PaintSync() {
  const paint = useAppStore(s => s.paint)
  const scene = useThree(s => s.scene)
  applyPaint(paint)   // 先設好，之後才產生的零件就會是這個顏色（放在零件之前渲染）
  useEffect(() => { applyPaint(paint, scene) }, [paint, scene])
  return null
}
