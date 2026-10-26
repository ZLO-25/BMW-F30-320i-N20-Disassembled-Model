import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getProcedural, mergeStaticMeshes } from './index'
import { loadData } from '../../core/loadData'

const names = (o: THREE.Object3D) => { const out: string[] = []; o.traverse(c => { if (c.name) out.push(c.name) }); return out.sort() }
const shellCount = (o: THREE.Object3D) => { let n = 0; o.traverse(c => { if ((c as THREE.Mesh).isMesh && c.userData.shell) n++ }); return n }
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o, true)

describe('P7 合併網格', () => {
  const data = loadData('manual')
  const auto = loadData('auto')
  const refs = new Set([...data.parts, ...auto.parts].map(p => p.modelRef).filter(r => r.startsWith('procedural:')).map(r => r.slice(11)))

  it('每個程式化零件合併後：有名字的節點都還在、外形範圍不變、外殼標記還在', () => {
    let before = 0, after = 0
    for (const n of refs) {
      const a = getProcedural(n)!('low'), b = getProcedural(n)!('low')
      const r = mergeStaticMeshes(b)
      before += r.before; after += r.after
      expect(names(b), n).toEqual(names(a))
      if (shellCount(a) > 0) expect(shellCount(b), n).toBeGreaterThan(0)
      const ba = box(a), bb = box(b)
      if (!ba.isEmpty()) {
        expect(bb.min.distanceTo(ba.min), n).toBeLessThan(1e-4)
        expect(bb.max.distanceTo(ba.max), n).toBeLessThan(1e-4)
      }
    }
    // 至少要省下一半的 mesh（= draw call）
    expect(after).toBeLessThan(before * 0.5)
  })

  it('壓板的彈簧指合併後還是一根根獨立的（動畫要轉）', () => {
    const pp = getProcedural('pressure_plate_v1')
    if (!pp) return
    const o = pp('mid'); mergeStaticMeshes(o)
    expect(o.getObjectByName('fingers')!.children.length).toBeGreaterThan(8)
  })
})
