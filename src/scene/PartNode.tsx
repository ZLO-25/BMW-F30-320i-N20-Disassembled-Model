import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { Part } from '../core/schema'
import type { PartGraph } from '../core/partGraph'
import { useAppStore, type SysVis } from '../store/useAppStore'
import { parseModelRef, useProceduralObject, GlbObject } from './ModelResolver'
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
  const selected = useAppStore(s => s.selectedId === part.id)
  const hovered = useAppStore(s => s.hoveredId === part.id)
  const removed = useAppStore(s => s.removedIds.has(part.id))
  const parentRemoved = useAppStore(s => (part.parent ? s.removedIds.has(part.parent) : false))
  const hint = useAppStore(s => s.hint)
  const bodyMode = useAppStore(s => s.bodyMode)
  const sysVis = useAppStore(s => s.sysVis[part.subsystem] ?? 'show')
  const mode = useAppStore(s => s.mode)
  const select = useAppStore(s => s.select)
  const hover = useAppStore(s => s.hover)
  const tryRemove = useAppStore(s => s.tryRemove)
  const shellGhost = useAppStore(s => s.anim !== null)
  const registry = useContext(PartRegistryCtx)
  const children = graph.children.get(part.id) ?? []

  const isBody = part.system === 'body'
  const vis: SysVis = isBody ? (bodyMode === 'solid' ? sysVis : bodyMode === 'xray' ? 'ghost' : 'hide') : sysVis
  const ignoreClicks = vis !== 'show'   // 透視/隱藏的零件不吃點擊，才點得到後面的東西

  // 被擋住時閃紅色 2.5 秒
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!hint || hint.kind !== 'blocked_remove' || !hint.ids.includes(part.id)) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 2500)
    return () => clearTimeout(t)
  }, [hint, part.id])

  const modelRef = useMemo(() => parseModelRef(part.modelRef), [part.modelRef])
  const modelHolder = useRef<THREE.Object3D | null>(null)
  const look: Look = flash ? { color: BLOCK, intensity: 0.9 } : selected ? { color: SELECT, intensity: 0.55 } : hovered ? { color: HOVER, intensity: 0.35 } : { color: NONE, intensity: 0 }
  const lookRef = useRef(look); lookRef.current = look
  const visRef = useRef(vis); visRef.current = vis

  useEffect(() => { if (modelHolder.current) applyHighlight(modelHolder.current, look) }, [look.color, look.intensity]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (modelHolder.current) applyVisibility(modelHolder.current, vis, isBody ? 0.12 : 0.14, shellGhost) }, [vis, isBody, shellGhost])
  useEffect(() => () => { registry.delete(part.id) }, [registry, part.id])
  useEffect(() => { if (modelHolder.current) applyShadows(modelHolder.current, shadows && !isBody) }, [shadows, isBody])

  const onReady = (o: THREE.Object3D) => {
    modelHolder.current = o
    registry.set(part.id, o)
    applyHighlight(o, lookRef.current)
    applyVisibility(o, visRef.current, isBody ? 0.12 : 0.14, useAppStore.getState().anim !== null)
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
    g.position.lerp(target, Math.min(1, dt * 8))
    g.visible = !(removed && (parentRemoved || a.fly > 0.97))
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (ignoreClicks || removed) return
    e.stopPropagation()
    select(part.id)
    if (mode === 'teardown') tryRemove(graph, part.id)
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => { if (ignoreClicks || removed) return; e.stopPropagation(); hover(part.id); document.body.style.cursor = mode === 'teardown' ? 'grab' : 'pointer' }
  const onOut = () => { if (ignoreClicks) return; hover(null); document.body.style.cursor = 'auto' }

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
  useEffect(() => { onReady(obj) }, [obj]) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={obj} />
}
