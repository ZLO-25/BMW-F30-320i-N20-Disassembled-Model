import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { grainData, type GrainKind } from './grain'
import { presetForMaterial } from './materialMatch'
import { M } from './registry'

const KINDS: GrainKind[] = ['castAl', 'castIron', 'plastic', 'machined']
const N = 128

describe('U6 程式產生的表面紋理', () => {
  it('每種紋理大小正確、每次產生都一樣（截圖可以對照）', () => {
    for (const k of KINDS) {
      const a = grainData(k), b = grainData(k)
      expect(a.length, k).toBe(N * N * 4)
      expect(Buffer.from(a).equals(Buffer.from(b)), k).toBe(true)
    }
  })

  it('三個通道都有變化（不是一片平），而且左右、上下邊界接得起來（無縫拼接）', () => {
    for (const k of KINDS) {
      const d = grainData(k)
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0, seam = 0, inner = 0
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const v = d[(y * N + x) * 4 + ch]
            lo = Math.min(lo, v); hi = Math.max(hi, v)
          }
          // 邊界：最後一欄 vs 第一欄的差，應該和「一般相鄰兩欄」差不多
          seam += Math.abs(d[(y * N + N - 1) * 4 + ch] - d[(y * N) * 4 + ch])
          inner += Math.abs(d[(y * N + 63) * 4 + ch] - d[(y * N + 64) * 4 + ch])
        }
        expect(hi - lo, `${k} ch${ch}`).toBeGreaterThan(60)
        expect(seam, `${k} ch${ch} 接縫`).toBeLessThan(inner * 3 + N * 4)
      }
    }
  })

  it('車削紋（machined）是方向性的：沿 u 變化比沿 v 大很多', () => {
    const d = grainData('machined')
    let du = 0, dv = 0
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
      const v = d[(y * N + x) * 4]
      du += Math.abs(d[(y * N + x + 1) * 4] - v)
      dv += Math.abs(d[((y + 1) * N + x) * 4] - v)
    }
    expect(du).toBeGreaterThan(dv * 3)
  })

  it('M.* 主要材質都接上紋理；紋理種類寫在 userData.grain（合併網格會看它）', () => {
    expect(M.castAl().userData.grain).toBe('castAl')
    expect(M.castIron().userData.grain).toBe('castIron')
    expect(M.blackPlastic().userData.grain).toBe('plastic')
    expect(M.steel().userData.grain).toBe('machined')
    expect(M.rubber().userData.grain).toBeUndefined()
    // shader 依紋理種類分開編譯
    expect(M.castAl().customProgramCacheKey()).not.toBe(M.castIron().customProgramCacheKey())
  })
})

describe('U6 GLB 材質對應到 M.*', () => {
  const c = (hex: number) => { const col = new THREE.Color(hex); return { r: col.r, g: col.g, b: col.b } }
  it('先看名稱', () => {
    expect(presetForMaterial({ name: 'Cast_Aluminium', color: c(0xffffff), metalness: 0 })).toBe('castAl')
    expect(presetForMaterial({ name: 'BlockIron', color: c(0xffffff), metalness: 0 })).toBe('castIron')
    expect(presetForMaterial({ name: 'black plastic PA66', color: c(0xffffff), metalness: 0 })).toBe('blackPlastic')
    expect(presetForMaterial({ name: 'Steel', color: c(0x000000), metalness: 0 })).toBe('steel')
    expect(presetForMaterial({ name: 'Rubber hose', color: c(0xffffff), metalness: 1 })).toBe('rubber')
  })
  it('名稱看不出來就看顏色與金屬度；有顏色的、透明的保留原樣', () => {
    expect(presetForMaterial({ name: 'Material.001', color: c(0xb8bcc2), metalness: 0.9 })).toBe('castAl')
    expect(presetForMaterial({ name: 'Material.002', color: c(0x55585d), metalness: 0.8 })).toBe('castIron')
    expect(presetForMaterial({ name: 'mat3', color: c(0x1b1d21), metalness: 0 })).toBe('blackPlastic')
    expect(presetForMaterial({ name: 'paint', color: c(0x1f4fa8), metalness: 0.6 })).toBeNull()
    expect(presetForMaterial({ name: 'Material.004', color: c(0xd9731a), metalness: 0 })).toBeNull()
    expect(presetForMaterial({ name: 'glass', color: c(0x8fb5e8), metalness: 0, transparent: true })).toBeNull()
  })
})
