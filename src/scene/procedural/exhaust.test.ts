import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { loadData } from '../../core/loadData'
import type { Variant } from '../../core/partGraph'
import { getProcedural } from './registry'
import './index'
import {
  ORIGIN_DOWNPIPE, ORIGIN_MID, ORIGIN_MUFFLER, J0, J1, J2, PIPE_R, MID_PATH, MUFFLER_INLET_PATH,
  DOWNPIPE_PATH, DOWNPIPE_TOP_PATH, MUFFLER_BOX_FRONT_X, type V3,
} from './exhaustGeom'

/**
 * 排氣：接點對得上、整條連續、車底段不穿過後軸 / 副車架。
 * 全部從「產生出來的網格」算，不是只比常數。場景用資料的 position / rotation / parent 組起來（同 PartNode）。
 */
const EXH = ['exh.downpipe_cat', 'exh.mid_section', 'exh.rear_muffler']
const deg = (n: number) => (n * Math.PI) / 180
const v3 = (p: V3) => new THREE.Vector3(...p)

function buildScene(variant: Variant) {
  const d = loadData(variant)
  const root = new THREE.Group()
  const groups = new Map<string, THREE.Group>()
  const make = (id: string): THREE.Group => {
    const hit = groups.get(id)
    if (hit) return hit
    const p = d.graph.byId.get(id)!
    const g = new THREE.Group()
    g.userData.partId = id
    g.position.set(p.position.x, p.position.y, p.position.z)
    g.rotation.set(deg(p.rotation.x), deg(p.rotation.y), deg(p.rotation.z))
    groups.set(id, g)
    const gen = p.modelRef.startsWith('procedural:') ? getProcedural(p.modelRef.slice('procedural:'.length)) : undefined
    if (gen) g.add(gen('mid'))
    ;(p.parent && d.graph.byId.has(p.parent) ? make(p.parent) : root).add(g)
    return g
  }
  for (const id of d.graph.byId.keys()) make(id)
  root.updateMatrixWorld(true)
  return { d, root, groups }
}

/** 零件自己的 mesh（不含子零件） */
function ownMeshes(g: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.partId) continue
      if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh)
      walk(c)
    }
  }
  walk(g)
  return out
}
function worldVerts(m: THREE.Mesh): THREE.Vector3[] {
  const pos = m.geometry.getAttribute('position')
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
  return out
}
function worldTris(m: THREE.Mesh): THREE.Triangle[] {
  const v = worldVerts(m)
  const idx = m.geometry.index
  const n = idx ? idx.count : v.length
  const at = (i: number) => v[idx ? idx.getX(i) : i]
  const out: THREE.Triangle[] = []
  for (let i = 0; i + 2 < n; i += 3) out.push(new THREE.Triangle(at(i), at(i + 1), at(i + 2)))
  return out
}
const minVertDist = (verts: THREE.Vector3[], p: THREE.Vector3) => verts.reduce((m, v) => Math.min(m, v.distanceTo(p)), Infinity)

/** 沿折線每 step 公尺取點 */
function samplePolyline(pts: V3[], step: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = v3(pts[i]), b = v3(pts[i + 1])
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 0; k < n; k++) out.push(a.clone().lerp(b, k / n))
  }
  out.push(v3(pts[pts.length - 1]))
  return out
}
/** 和 registry.tube 同一種曲線（centripetal 0.3 的 catmullrom），取真正的中心線 */
const sampleCurve = (pts: V3[], step: number): THREE.Vector3[] => {
  const c = new THREE.CatmullRomCurve3(pts.map(v3), false, 'catmullrom', 0.3)
  return c.getSpacedPoints(Math.max(2, Math.ceil(c.getLength() / step)))
}

for (const variant of ['manual', 'auto'] as const) {
  describe(`排氣 ${variant}`, () => {
    const { d, groups } = buildScene(variant)
    const exh = EXH.map(id => ({ id, meshes: ownMeshes(groups.get(id)!) }))
    const verts = (id: string) => exh.find(e => e.id === id)!.meshes.flatMap(worldVerts)
    // 管徑 + 1.2 cm（比要求的 +2 cm 嚴：平移 5 cm 的 x 偏移要抓得到）
    const near = PIPE_R + 0.012
    it('三個排氣零件都有產生出網格', () => { for (const e of exh) expect(e.meshes.length, e.id).toBeGreaterThan(0) })

    it('資料座標 = exhaustGeom 的零件原點', () => {
      const pos = (id: string) => { const p = d.graph.byId.get(id)!.position; return [p.x, p.y, p.z] }
      expect(pos('exh.downpipe_cat')).toEqual([...ORIGIN_DOWNPIPE])
      expect(pos('exh.mid_section')).toEqual([...ORIGIN_MID])
      expect(pos('exh.rear_muffler')).toEqual([...ORIGIN_MUFFLER])
    })

    it('三個接點：兩邊零件的開口都真的在接點上', () => {
      const turbo = groups.get('eng.boost.turbo')!
      const turboVerts = ownMeshes(turbo).flatMap(worldVerts)
      expect(minVertDist(turboVerts, v3(J0)), '渦輪出口').toBeLessThan(near)
      expect(minVertDist(verts('exh.downpipe_cat'), v3(J0)), '下導管 @J0').toBeLessThan(near)
      expect(minVertDist(verts('exh.downpipe_cat'), v3(J1)), '下導管 @J1').toBeLessThan(near)
      expect(minVertDist(verts('exh.mid_section'), v3(J1)), '中段 @J1').toBeLessThan(near)
      expect(minVertDist(verts('exh.mid_section'), v3(J2)), '中段 @J2').toBeLessThan(near)
      expect(minVertDist(verts('exh.rear_muffler'), v3(J2)), '消音器 @J2').toBeLessThan(near)
    })

    it('從渦輪出口到消音器箱體沒有斷點（每 2 cm 取樣，離網格 < 6 cm）', () => {
      const tris = exh.flatMap(e => e.meshes.flatMap(worldTris))
      const path: V3[] = [...DOWNPIPE_TOP_PATH, ...DOWNPIPE_PATH, ...MID_PATH, ...MUFFLER_INLET_PATH]
      const bad: string[] = []
      const tmp = new THREE.Vector3()
      for (const s of samplePolyline(path, 0.02)) {
        let best = Infinity
        for (const t of tris) { t.closestPointToPoint(s, tmp); best = Math.min(best, tmp.distanceTo(s)) }
        if (best > 0.06) bad.push(`(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}) ${best.toFixed(3)}`)
      }
      expect(bad).toEqual([])
    })

    it('車底段（J1 → 消音器箱體）不穿過 drv.* / chs.rear_* / chs.trans_crossmember 的任何 mesh', () => {
      const r = PIPE_R - 0.002
      const obstacles: { id: string; box: THREE.Box3 }[] = []
      for (const [id, g] of groups) {
        if (!(id.startsWith('drv.') || id.startsWith('chs.rear_') || id === 'chs.trans_crossmember')) continue
        for (const m of ownMeshes(g)) obstacles.push({ id, box: new THREE.Box3().setFromObject(m, true) })
      }
      expect(obstacles.length).toBeGreaterThan(10)
      // 中心線用「零件實際的世界矩陣」轉出來，所以資料裡的 position 被改動時這裡會跟著動
      const viaPart = (id: string, origin: V3, pts: V3[]) =>
        pts.map(p => groups.get(id)!.localToWorld(v3(p).sub(v3(origin))).toArray() as unknown as V3)
      const run = [
        ...samplePolyline(viaPart('exh.mid_section', ORIGIN_MID, MID_PATH), 0.02),
        ...sampleCurve(viaPart('exh.rear_muffler', ORIGIN_MUFFLER, MUFFLER_INLET_PATH), 0.02),
      ].filter(p => p.x >= MUFFLER_BOX_FRONT_X)
      const hits = new Set<string>()
      const sphere = new THREE.Sphere()
      for (const p of run) {
        sphere.set(p, r)
        for (const o of obstacles) if (o.box.intersectsSphere(sphere)) hits.add(`${o.id} @x=${p.x.toFixed(2)}`)
      }
      expect([...hits]).toEqual([])
    })
  })
}
