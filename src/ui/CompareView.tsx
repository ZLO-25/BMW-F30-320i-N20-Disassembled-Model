import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useThree } from '@react-three/fiber'
import type { DataBundle } from '../core/loadData'
import type { Part } from '../core/schema'
import { buildGraph, type PartGraph, type Variant } from '../core/partGraph'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { parseModelRef, useProceduralObject } from '../scene/ModelResolver'
import { applyVisibility } from '../scene/PartNode'
import { ANIM_BY_ID, GEARS, MANUAL_RATIOS, AUTO_RATIOS, AUTO_ELEMENTS, resetAnim } from '../scene/animations'

const deg = (v: number) => (v * Math.PI) / 180
const ROOTS = ['eng.assembly', 'trans.manual.assembly', 'trans.auto.assembly']

/** 只畫模型、不吃點擊的零件樹（對照模式用）；引擎本體只留飛輪那一側的零件 */
function StaticPart({ part, graph, registry, keep }: { part: Part; graph: PartGraph; registry: Map<string, THREE.Object3D>; keep: (p: Part) => boolean }) {
  const ref = useMemo(() => parseModelRef(part.modelRef), [part.modelRef])
  const obj = useProceduralObject(ref.kind === 'procedural' ? ref.name : 'empty', 'mid')
  useEffect(() => {
    registry.set(part.id, obj)
    applyVisibility(obj, 'show', 0.14, true)
    return () => { registry.delete(part.id) }
  }, [obj, part.id, registry])
  const kids = (graph.children.get(part.id) ?? []).filter(keep)
  return (
    <group position={[part.position.x, part.position.y, part.position.z]} rotation={[deg(part.rotation.x), deg(part.rotation.y), deg(part.rotation.z)]}>
      {keep(part) && part.system !== 'engine' && <primitive object={obj} />}
      {kids.map(k => <StaticPart key={k.id} part={k} graph={graph} registry={registry} keep={keep} />)}
    </group>
  )
}

function Drivetrain({ data, variant, z, registry }: { data: DataBundle; variant: Variant; z: number; registry: Map<string, THREE.Object3D> }) {
  const graph = useMemo(() => buildGraph(data.parts, variant), [data.parts, variant])
  const keep = (p: Part) => p.system === 'transmission' || ROOTS.includes(p.id) || p.subsystem === 'clutch'
  const roots = ROOTS.map(id => graph.byId.get(id)).filter((p): p is Part => !!p && p.parent === 'car.root')
  return (
    <group position={[0, 0, z]}>
      {roots.map(r => <StaticPart key={r.id} part={r} graph={graph} registry={registry} keep={keep} />)}
    </group>
  )
}

function Driver({ regs }: { regs: Record<Variant, Map<string, THREE.Object3D>> }) {
  const t0 = useMemo(() => performance.now() / 1000, [])
  useEffect(() => () => { resetAnim(id => regs.manual.get(id)); resetAnim(id => regs.auto.get(id)) }, [regs])
  useFrame(() => {
    const def = ANIM_BY_ID.get('power_path')!
    const gear = useAppStore.getState().gear
    const time = performance.now() / 1000 - t0
    for (const v of ['manual', 'auto'] as const) def.apply({ get: id => regs[v].get(id), t: 0, gear, time, variant: v })
  })
  return null
}

function Env() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env; scene.environmentIntensity = 0.8
    return () => { scene.environment = null; env.dispose(); pmrem.dispose() }
  }, [gl, scene])
  return null
}

/** 檔位小標：手排沒有 7、8 檔 → 顯示 N */
function gearText(v: Variant, gear: string): string {
  if (gear === 'N' || !GEARS[v].includes(gear)) return 'N'
  const r = (v === 'manual' ? MANUAL_RATIOS : AUTO_RATIOS)[gear]
  return `${gear}：${r?.toFixed(3)} : 1${v === 'auto' ? '　' + AUTO_ELEMENTS[gear] : ''}`
}

/** 對照模式：手排（上）與自排（下）並排，同一個檔位，動力路徑同時上色 */
export function CompareView({ data }: { data: DataBundle }) {
  const open = useAppStore(s => s.compareOpen)
  const setOpen = useAppStore(s => s.setCompareOpen)
  const lang = useAppStore(s => s.lang)
  const gear = useAppStore(s => s.gear)
  const setGear = useAppStore(s => s.setGear)
  const regs = useMemo(() => ({ manual: new Map<string, THREE.Object3D>(), auto: new Map<string, THREE.Object3D>() }), [])
  const gears = useRef(GEARS.manual)
  if (!open) return null
  const list = gears.current
  return (
    <div className="compare">
      <div className="compare-top">
        <strong>{ui('compareTitle', lang)}</strong>
        <div className="gear-row">
          <span>{ui('gearLabel', lang)}</span>
          {GEARS.auto.map(g => <button key={g} className={gear === g ? 'on' : ''} disabled={!list.includes(g) && !GEARS.auto.includes(g)} onClick={() => setGear(g)}>{g}</button>)}
        </div>
        <button onClick={() => setOpen(false)}>× {ui('close', lang)}</button>
      </div>
      <div className="compare-canvas">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0.35, 0.75, 1.45], fov: 40, near: 0.05, far: 50 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
          <color attach="background" args={['#15171b']} />
          <Env />
          <hemisphereLight intensity={0.4} groundColor="#1a1a1a" />
          <directionalLight position={[3, 5, 3]} intensity={1.8} />
          <group position={[-0.5, -0.3, 0]}>
            <Drivetrain data={data} variant="manual" z={-0.42} registry={regs.manual} />
            <Drivetrain data={data} variant="auto" z={0.42} registry={regs.auto} />
          </group>
          <Driver regs={regs} />
          <OrbitControls makeDefault target={[0.05, 0, 0]} enableDamping minDistance={0.5} maxDistance={6} />
        </Canvas>
      </div>
      <div className="compare-legend">
        <p><strong>{ui('variantManual', lang)}</strong> <span className="chip plain">{gearText('manual', gear)}</span> {ui('compareManualPath', lang)}</p>
        <p><strong>{ui('variantAuto', lang)}</strong> <span className="chip plain">{gearText('auto', gear)}</span> {ui('compareAutoPath', lang)}</p>
        <p className="muted small">{ui('compareHint', lang)}　{gear === '7' || gear === '8' ? (lang === 'zh' ? '手排只有六檔，7、8 檔時手排顯示空檔。' : 'The manual has six gears; in 7th and 8th it shows neutral.') : ''}</p>
      </div>
    </div>
  )
}
