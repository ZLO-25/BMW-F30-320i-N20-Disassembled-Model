import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import type { Part } from '../core/schema'
import type { PartGraph } from '../core/partGraph'
import { useAppStore, type SysVis, type Stage } from '../store/useAppStore'
import { redraw } from './redraw'
import { parseModelRef, useProceduralObject, disposeObject, GlbObject } from './ModelResolver'
import type { Detail } from './procedural'

const SELECT = new THREE.Color(0xffa726)
const HOVER = new THREE.Color(0x4fc3f7)
const BLOCK = new THREE.Color(0xff3b30)
const NONE = new THREE.Color(0x000000)

const deg = (v: number) => (v * Math.PI) / 180

/** 零件 id → 3D 物件，給動畫用。主場景和對照模式各自一份。 */
export const PartRegistryCtx = createContext<Map<string, THREE.Object3D>>(new Map())
const EXPLODE_SCALE = 0.35   // 爆炸圖滑桿拉滿時，每一層往外移幾公尺
const FLY_DIST = 0.9         // 拆下時飛出去的距離

type Look = { color: THREE.Color; intensity: number }

function applyHighlight(root: THREE.Object3D, look: Look) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
      const sm = mm as THREE.MeshStandardMaterial
      if (sm.emissive) { sm.emissive.copy(look.color); sm.emissiveIntensity = look.intensity }
    }
  })
}

/**
 * U6：開了 AO（後處理）之後，半透明是在「線性色彩」裡疊的，同樣 0.14 的透明度看起來會濃很多
 * （車殼變成一層藍霧）。Scene 會在 AO 開啟時把這個倍率調低，讓透視模式看起來和以前差不多。
 */
export const ghostTuning = { scale: 1 }
/** R1：修車廠背景是亮的水泥地與牆，深藍半透明的車殼疊上去幾乎看不見，所以工作室模式把車殼的透明度加倍 */
const WORKSHOP_BODY_BOOST = 2.2
const ghostOpacityFor = (isBody: boolean, stage: Stage) =>
  (isBody ? 0.12 * (stage === 'workshop' ? WORKSHOP_BODY_BOOST : 1) : 0.14) * ghostTuning.scale

type SpecBase = { metalness: number; roughness: number; envMapIntensity: number; clearcoat?: number }

/**
 * 透視時把「反光」關掉。
 * 車漆是 metalness 0.6 + clearcoat 1：攝影棚環境貼圖映在上面的高光在線性空間是很大的數值（可能 > 5），
 * 乘上 0.1 的透明度還是比 0.5 亮，所以半透明的車殼會出現一大片白光（U6 之後更明顯，因為最後才做色調映射）。
 * 透視的目的是「看得到裡面、又知道殼在哪」，所以透視時改成不反光的霧面：金屬度 0、粗糙度 1、環境反射壓低、clearcoat 0。
 * 原本的值記在 userData.baseSpec，切回實體時還原。
 */
function applyGhostSpecular(sm: THREE.MeshStandardMaterial, ghost: boolean) {
  if (typeof sm.metalness !== 'number') return   // 不是 PBR 材質（例如 shadowMaterial）就不動
  const ud = sm.userData as { baseSpec?: SpecBase }
  const phys = sm as THREE.MeshPhysicalMaterial
  if (ud.baseSpec === undefined) {
    ud.baseSpec = { metalness: sm.metalness, roughness: sm.roughness, envMapIntensity: sm.envMapIntensity, clearcoat: typeof phys.clearcoat === 'number' ? phys.clearcoat : undefined }
  }
  const b = ud.baseSpec
  sm.metalness = ghost ? 0 : b.metalness
  sm.roughness = ghost ? 1 : b.roughness
  sm.envMapIntensity = ghost ? 0.15 : b.envMapIntensity
  if (b.clearcoat !== undefined) phys.clearcoat = ghost ? 0 : b.clearcoat
}

/** 透明化 / 隱藏：記住原本的透明設定，恢復時才回得去。ghostShell = 動畫時把外殼（userData.shell）變半透明看內部 */
export function applyVisibility(root: THREE.Object3D, vis: SysVis, ghostOpacity = 0.14, ghostShell = false) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.visible = vis !== 'hide'
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
      const ud = mm.userData as { baseOpacity?: number; baseTransparent?: boolean }
      if (ud.baseOpacity === undefined) { ud.baseOpacity = mm.opacity; ud.baseTransparent = mm.transparent }
      const ghost = vis === 'ghost' || (ghostShell && !!m.userData.shell)
      mm.transparent = ghost || !!ud.baseTransparent
      mm.opacity = ghost ? ghostOpacity : ud.baseOpacity
      mm.depthWrite = !ghost
      applyGhostSpecular(mm as THREE.MeshStandardMaterial, ghost)
      mm.needsUpdate = true
    }
  })
}

function applyShadows(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) { m.castShadow = on; m.receiveShadow = on }
  })
}

interface Props { part: Part; graph: PartGraph; detail: Detail; shadows: boolean }

/** 一個零件 = 一個 group（位置/旋轉/爆炸/拆下動畫）+ 它的模型 + 遞迴的子件 */
export function PartNode({ part, graph, detail, shadows }: Props) {
  const ref = useRef<THREE.Group>(null)
  // 審查 S5：一個節點只訂閱一次（useShallow），不要 11 個 selector；163 個零件 × 11 = 1,800 個 listener，
  // 滑鼠掃過零件時每次 hover() 都要跑完它們。hint 只取「有沒有擋到我」的 token，不訂閱整個物件。
  const { selected, hovered, removed, parentRemoved, blockedToken, bodyMode, sysVis, mode, shellGhost, stage, postfx } = useAppStore(useShallow(s => ({
    selected: s.selectedId === part.id,
    hovered: s.hoveredId === part.id,
    removed: s.removedIds.has(part.id),
    parentRemoved: part.parent ? s.removedIds.has(part.parent) : false,
    blockedToken: s.hint && s.hint.kind === 'blocked_remove' && s.hint.ids.includes(part.id) ? s.hint.token : 0,
    bodyMode: s.bodyMode,
    sysVis: s.sysVis[part.subsystem] ?? 'show',
    mode: s.mode,
    shellGhost: s.anim !== null,
    stage: s.stage,
    postfx: s.postfx,   // E2：AO 開關改變時，透視的透明度倍率（ghostTuning）要重套
  })))
  const registry = useContext(PartRegistryCtx)
  const children = graph.children.get(part.id) ?? []

  const isBody = part.system === 'body'
  const vis: SysVis = isBody ? (bodyMode === 'solid' ? sysVis : bodyMode === 'xray' ? 'ghost' : 'hide') : sysVis
  const ignoreClicks = vis !== 'show'   // 透視/隱藏的零件不吃點擊，才點得到後面的東西

  // 被擋住時閃紅色 2.5 秒
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!blockedToken) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 2500)
    return () => clearTimeout(t)
  }, [blockedToken])

  const modelRef = useMemo(() => parseModelRef(part.modelRef), [part.modelRef])
  const modelHolder = useRef<THREE.Object3D | null>(null)
  const look: Look = flash ? { color: BLOCK, intensity: 0.9 } : selected ? { color: SELECT, intensity: 0.55 } : hovered ? { color: HOVER, intensity: 0.35 } : { color: NONE, intensity: 0 }
  const lookRef = useRef(look); lookRef.current = look
  const visRef = useRef(vis); visRef.current = vis

  useEffect(() => { if (modelHolder.current) { applyHighlight(modelHolder.current, look); redraw() } }, [look.color, look.intensity]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (modelHolder.current) { applyVisibility(modelHolder.current, vis, ghostOpacityFor(isBody, stage), shellGhost); redraw(true) } }, [vis, isBody, shellGhost, stage, postfx])
  useEffect(() => () => { registry.delete(part.id) }, [registry, part.id])
  useEffect(() => { if (modelHolder.current) { applyShadows(modelHolder.current, shadows && !isBody); redraw(true) } }, [shadows, isBody])

  const onReady = (o: THREE.Object3D) => {
    modelHolder.current = o
    registry.set(part.id, o)
    applyHighlight(o, lookRef.current)
    applyVisibility(o, visRef.current, ghostOpacityFor(isBody, useAppStore.getState().stage), useAppStore.getState().anim !== null)
    applyShadows(o, shadows && !isBody)
  }

  // 爆炸圖 + 拆下飛出：每格畫面平滑靠近目標位置
  const base = useMemo(() => new THREE.Vector3(part.position.x, part.position.y, part.position.z), [part.position])
  const dir = useMemo(() => new THREE.Vector3(part.explodeDir.x, part.explodeDir.y, part.explodeDir.z), [part.explodeDir])
  const flyDir = useMemo(() => {
    const v = dir.clone()
    if (v.lengthSq() === 0) v.set(0, 1, 0)
    return v.normalize().multiplyScalar(FLY_DIST).add(new THREE.Vector3(0, 0.35, 0))
  }, [dir])
  const anim = useRef({ fly: 0 })
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const s = useAppStore.getState()
    const flyHere = removed && !parentRemoved          // 只有整包的最上層會飛，子件跟著父件一起動
    const goal = flyHere ? 1 : 0
    const a = anim.current
    a.fly += (goal - a.fly) * Math.min(1, dt * 4)
    if (Math.abs(goal - a.fly) < 0.002) a.fly = goal
    target.copy(base).addScaledVector(dir, s.explode * EXPLODE_SCALE).addScaledVector(flyDir, a.fly)
    // 審查 S4：已經到位就不要再動 position（每動一次 three 就要重算這個 group 的矩陣），閒置時 163 個零件成本接近零
    const d2 = g.position.distanceToSquared(target)
    if (d2 > 1e-10) {
      if (d2 < 1e-7 && a.fly === goal) g.position.copy(target)
      else g.position.lerp(target, Math.min(1, dt * 8))
      redraw(true)   // E1：還在動 → 下一格也要畫（按需渲染）；動到的零件陰影也要更新
    }
    const visible = !(removed && (parentRemoved || a.fly > 0.97))
    if (g.visible !== visible) { g.visible = visible; redraw(true) }
    if (a.fly !== goal) redraw(true)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (ignoreClicks || removed) return
    e.stopPropagation()
    const s = useAppStore.getState()
    s.select(part.id)
    if (mode === 'teardown') s.tryRemove(graph, part.id)
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => { if (ignoreClicks || removed || e.pointerType === 'touch') return;   // E4：觸控沒有「滑鼠掃過」
     e.stopPropagation(); useAppStore.getState().hover(part.id); document.body.style.cursor = mode === 'teardown' ? 'grab' : 'pointer' }
  const onOut = () => { if (ignoreClicks) return; useAppStore.getState().hover(null); document.body.style.cursor = 'auto' }

  return (
    <group ref={ref} name={part.id}
      position={[part.position.x, part.position.y, part.position.z]}
      rotation={[deg(part.rotation.x), deg(part.rotation.y), deg(part.rotation.z)]}>
      <group onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}
        raycast={ignoreClicks ? () => null : undefined}>
        {modelRef.kind === 'procedural'
          ? <ProceduralHolder name={modelRef.name} detail={detail} onReady={onReady} />
          : <Suspense fallback={null}>
              <GlbObject url={modelRef.url} node={modelRef.node} onObject={onReady} />
            </Suspense>}
      </group>
      {children.map(c => <PartNode key={c.id} part={c} graph={graph} detail={detail} shadows={shadows} />)}
    </group>
  )
}

function ProceduralHolder({ name, detail, onReady }: { name: string; detail: Detail; onReady: (o: THREE.Object3D) => void }) {
  const obj = useProceduralObject(name, detail)
  // 審查 S1：卸載（例如切換變速箱重建場景）時把 geometry / material 從顯示卡釋放，不然每切一次就多一份
  useEffect(() => { onReady(obj); return () => disposeObject(obj) }, [obj]) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={obj} />
}
