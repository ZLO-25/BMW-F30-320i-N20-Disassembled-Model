import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cylinderY, CHAMFER } from './registry'

const bbox = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox! }

describe('R1 圓柱倒角', () => {
  it('high 的倒角圓柱外形尺寸和一般圓柱一樣（不會變胖變長）', () => {
    const a = bbox(cylinderY('high', 0.05, 0.1))
    const b = bbox(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 32))
    expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6)
    expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6)
  })

  it('錐形（上下半徑不同）也保持原本的上下半徑', () => {
    const g = cylinderY('high', 0.04, 0.08, 0.02)
    const p = g.attributes.position
    let topMax = 0, botMax = 0
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i))
      if (p.getY(i) > 0.03) topMax = Math.max(topMax, r)
      if (p.getY(i) < -0.03) botMax = Math.max(botMax, r)
    }
    expect(topMax).toBeCloseTo(0.02, 4)
    expect(botMax).toBeCloseTo(0.04, 4)
  })

  it('mid / low 與細圓柱（螺絲、管子）不加倒角，面數不變', () => {
    expect(cylinderY('mid', 0.05, 0.1)).toBeInstanceOf(THREE.CylinderGeometry)
    expect(cylinderY('low', 0.05, 0.1)).toBeInstanceOf(THREE.CylinderGeometry)
    expect(cylinderY('high', CHAMFER.minRadius / 2, 0.1)).toBeInstanceOf(THREE.CylinderGeometry)
    expect(cylinderY('high', 0.05, 0.1)).toBeInstanceOf(THREE.LatheGeometry)
  })
})
