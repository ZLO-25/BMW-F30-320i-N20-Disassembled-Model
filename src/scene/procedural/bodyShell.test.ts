import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAR } from '../../core/photoOverlay'
import { buildSkin, section, fineSection, regionOf, stations, BODY_X, SPLIT, type Region } from './bodyShell'

const bbox = (r: Region) => {
  const box = new THREE.Box3()
  for (const g of buildSkin('mid', r).values()) { g.computeBoundingBox(); box.union(g.boundingBox!) }
  return box
}

describe('R3 車殼（照片描邊放樣）', () => {
  it('整體尺寸對得上規格：長 4,624、寬 1,811、高 1,429 mm（誤差 < 1.5%）', () => {
    const box = new THREE.Box3()
    for (const r of ['shell', 'hood', 'fbumper', 'rbumper', 'trunk'] as Region[]) box.union(bbox(r))
    const size = box.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(4.626, 1)
    expect(Math.abs(size.z - 1.811) / 1.811).toBeLessThan(0.015)
    expect(Math.abs(box.max.y - 1.429) / 1.429).toBeLessThan(0.015)
    expect(BODY_X.front - BODY_X.rear).toBeCloseTo(4.626, 2)
  })

  it('每個截面都合理：車頂 ≥ 肩線 > 下緣，肩線不比最寬處寬', () => {
    for (const x of stations('mid')) {
      const s = section(x)
      expect(s[11][1]).toBeGreaterThanOrEqual(s[7][1])
      expect(s[7][1]).toBeGreaterThan(s[3][1])
      expect(s[7][0]).toBeLessThanOrEqual(s[6][0] + 1e-9)
    }
  })

  it('引擎蓋在前避震器上座（y 0.94、z 0.66）上方，不會再穿出來', () => {
    const { pts } = fineSection(1.5, 6)
    // 找 z = 0.66 時上半部的高度
    let y = 0
    for (let k = 7; k < pts.length - 1; k++) {
      const [z0, y0] = pts[k], [z1, y1] = pts[k + 1]
      if ((0.66 - z0) * (0.66 - z1) <= 0) { y = y0 + (y1 - y0) * (0.66 - z0) / (z1 - z0); break }
    }
    expect(y).toBeGreaterThan(0.95)
    expect(regionOf(1.5, 9)).toBe('hood')
  })

  it('可拆的蓋板各自有東西、分界正確', () => {
    for (const r of ['hood', 'fbumper', 'rbumper', 'trunk'] as Region[]) expect(buildSkin('low', r).size).toBeGreaterThan(0)
    expect(regionOf(SPLIT.cowl + 0.01, 9)).toBe('hood')
    expect(regionOf(SPLIT.cowl - 0.01, 9)).toBe('shell')
    expect(regionOf(2.15, 3)).toBe('fbumper')
    expect(regionOf(-2.0, 9)).toBe('trunk')
    expect(regionOf(-2.0, 4)).toBe('rbumper')
  })

  it('R6-B 疊圖用的車身常數 CAR 和車皮一致', () => {
    expect(CAR.centerX).toBeCloseTo((BODY_X.front + BODY_X.rear) / 2, 6)
    expect(CAR.length).toBeCloseTo(BODY_X.front - BODY_X.rear, 2)
  })
})
