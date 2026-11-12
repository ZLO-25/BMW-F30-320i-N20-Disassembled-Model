import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildWorkshop, concreteData, disposeWorkshop, workshopLayout } from './workshop'

describe('R1 修車廠環境', () => {
  it('天花板有 12 支日光燈，而且比牆面亮很多（反射裡才看得到燈管）', () => {
    const tubes = workshopLayout().filter(b => b.pos[1] > 4.5)
    expect(tubes).toHaveLength(12)
    for (const t of tubes) expect(t.k ?? 1).toBeGreaterThan(5)
  })

  it('房間建得出來、也釋放得掉', () => {
    const s = buildWorkshop()
    let meshes = 0
    s.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++ })
    expect(meshes).toBe(workshopLayout().length + 1)
    disposeWorkshop(s)
  })

  it('水泥地貼圖可以無縫重複：左右兩邊、上下兩邊的亮度接得起來', () => {
    const N = 64
    const d = concreteData(N)
    const at = (x: number, y: number) => d[(y * N + x) * 4]
    // 伸縮縫在邊緣，左右兩邊都是深色線
    let diff = 0
    for (let y = 0; y < N; y++) diff += Math.abs(at(0, y) - at(N - 1, y))
    expect(diff / N).toBeLessThan(30)
    // 中間不是一片死灰：要有斑駁
    const mid: number[] = []
    for (let y = 8; y < N - 8; y++) for (let x = 8; x < N - 8; x++) mid.push(at(x, y))
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(25)
  })
})
