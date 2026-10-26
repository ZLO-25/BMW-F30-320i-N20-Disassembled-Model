import { describe, it, expect } from 'vitest'
import { loadData } from './loadData'
import { worldPosition } from './partGraph'

/**
 * 子件的 position 是「相對父件」的。之前後五連桿把整車座標直接寫在副車架底下，
 * 結果全部飄到車尾外面（P7 上線後回報）。這裡檢查每個零件換算成整車座標後都在車子範圍內。
 */
describe('零件位置', () => {
  for (const v of ['manual', 'auto'] as const) {
    const d = loadData(v)
    it(`${v}：每個零件的整車座標都在車身範圍內`, () => {
      const out: string[] = []
      for (const p of d.graph.byId.values()) {
        const [x, y, z] = worldPosition(d.graph, p.id)!
        if (Math.abs(x) > 2.4 || y < -0.1 || y > 1.6 || Math.abs(z) > 1.0) out.push(`${p.id} (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`)
      }
      expect(out).toEqual([])
    })
    it(`${v}：後五連桿都在同側後輪架附近（< 0.6 m）`, () => {
      for (const k of ['l', 'r']) {
        const kn = worldPosition(d.graph, `chs.rear_knuckle_${k}`)!
        for (const key of ['upper_wishbone', 'lower_arm', 'trailing_arm', 'toe_link', 'camber_link']) {
          const w = worldPosition(d.graph, `chs.rear_${key}_${k}`)!
          expect(Math.hypot(w[0] - kn[0], w[1] - kn[1], w[2] - kn[2]), `chs.rear_${key}_${k}`).toBeLessThan(0.6)
        }
      }
    })
  }
})
