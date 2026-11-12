import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { hexHead, hoseClamp } from './registry'
import { Part } from '../../core/schema'
import engine from '../../../data/parts/engine.json'

const bbox = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox! }

describe('R2 連接件', () => {
  it('六角螺栓頭：對邊 10 mm 的頭，寬度不超過凸緣、底部貼在 y=0', () => {
    for (const d of ['high', 'mid', 'low'] as const) {
      const b = bbox(hexHead(d))
      expect(b.min.y).toBeCloseTo(0, 5)
      expect(b.max.x - b.min.x).toBeLessThan(0.016)
      expect(b.max.x - b.min.x).toBeGreaterThan(0.009)
    }
  })

  it('管束：套在半徑 r 的管子外面，不會比管子小', () => {
    const r = 0.03
    for (const d of ['high', 'mid', 'low'] as const) {
      const g = hoseClamp(d, r)
      const p = g.attributes.position
      let minR = Infinity
      for (let i = 0; i < p.count; i++) minR = Math.min(minR, Math.hypot(p.getX(i), p.getZ(i)))
      expect(minR).toBeGreaterThanOrEqual(r)
    }
  })
})

describe('R2 外形依據欄位', () => {
  it('沒寫 shape 的零件預設是「示意」', () => {
    const raw = (engine as { shape?: unknown }[]).find(p => !p.shape)!
    expect(Part.parse(raw).shape).toEqual({ basis: 'schematic', source: null })
  })
})
