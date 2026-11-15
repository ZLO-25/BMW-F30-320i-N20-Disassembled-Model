import { describe, it, expect } from 'vitest'
import { combustionAt, sparkAdvanceDeg, discreteMix, sparksBetween, thetaOf, averagedGlow, burnDurationDeg } from './combustion'
import { cyclePhase, fireOffset, RPM_RANGE, FIRING_ORDER } from './engineCycle'

const RPMS = [700, 1500, 3000, 5000, 7000]

/** 掃一圈 720°，回傳某個輸出最大值所在的 θ */
function argmax(rpm: number, key: 'pressure' | 'rate' | 'heat') {
  let best = -1, at = 0
  for (let ph = 0; ph < 720; ph += 0.25) {
    const v = combustionAt(ph, rpm)[key]
    if (v > best) { best = v; at = thetaOf(ph) }
  }
  return { at, best }
}

describe('F0 燃燒模型（示意）', () => {
  it('跳火在上死點之前（壓縮行程尾端）', () => {
    for (const rpm of RPMS) {
      const adv = sparkAdvanceDeg(rpm)
      expect(adv).toBeGreaterThan(5)
      expect(adv).toBeLessThan(40)
      // 跳火前一點點沒有火花、跳火後一點點有
      expect(combustionAt(720 - adv - 1, rpm).spark).toBe(0)
      expect(combustionAt(720 - adv + 1, rpm).spark).toBeGreaterThan(0)
      expect(combustionAt(1, rpm).burned).toBeGreaterThan(0)          // 到上死點時已經開始燒
      expect(combustionAt(720 - adv - 1, rpm).burned).toBe(0)
    }
  })

  it('轉速越高提前角越大（燃燒佔的曲軸角變大）', () => {
    for (let i = 1; i < RPMS.length; i++) {
      expect(sparkAdvanceDeg(RPMS[i])).toBeGreaterThan(sparkAdvanceDeg(RPMS[i - 1]))
      expect(burnDurationDeg(RPMS[i])).toBeGreaterThan(burnDurationDeg(RPMS[i - 1]))
    }
  })

  it('壓力峰值落在上死點後 5°–25°，正規化後峰值 = 1', () => {
    for (const rpm of RPMS) {
      const { at, best } = argmax(rpm, 'pressure')
      expect(at).toBeGreaterThanOrEqual(5)
      expect(at).toBeLessThanOrEqual(25)
      expect(best).toBeCloseTo(1, 2)
    }
  })

  it('所有輸出都在 0–1', () => {
    for (const rpm of [RPM_RANGE[0], 2400, RPM_RANGE[1]]) for (let ph = 0; ph < 720; ph += 0.5) {
      const c = combustionAt(ph, rpm)
      for (const v of Object.values(c)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
    }
  })

  it('720 → 0 的接縫連續（壓縮尾端已經在燒）', () => {
    for (const rpm of RPMS) {
      const a = combustionAt(719.99, rpm), b = combustionAt(0.01, rpm)
      expect(Math.abs(a.burned - b.burned)).toBeLessThan(0.01)
      expect(Math.abs(a.pressure - b.pressure)).toBeLessThan(0.01)
      expect(Math.abs(a.heat - b.heat)).toBeLessThan(0.01)
    }
  })

  it('排氣行程結束前溫度回到 0；進氣行程完全沒有燃燒', () => {
    for (const rpm of RPMS) {
      expect(combustionAt(355, rpm).heat).toBe(0)
      for (let ph = 360; ph < 540; ph += 5) {
        const c = combustionAt(ph, rpm)
        expect(c.burned + c.heat + c.spark + c.front).toBe(0)
      }
      // 燒完時溫度高、到下死點時明顯降溫
      expect(combustionAt(20, rpm).heat).toBeGreaterThan(combustionAt(175, rpm).heat)
    }
  })

  it('四缸壓力峰值各差 180°，順序 1-3-4-2', () => {
    const rpm = 2000
    const peakCrank = (cyl: number) => {
      let best = -1, at = 0
      for (let deg = 0; deg < 720; deg += 0.5) {
        const p = combustionAt(cyclePhase(deg, cyl), rpm).pressure
        if (p > best) { best = p; at = deg }
      }
      return at
    }
    const peaks = FIRING_ORDER.map(peakCrank)
    for (let i = 1; i < 4; i++) expect(peaks[i] - peaks[i - 1]).toBeCloseTo(180, 0)
    expect(FIRING_ORDER).toEqual([1, 3, 4, 2])
  })

  it('逐次 / 平均混合：每秒 2 次以下 = 1，4 次以上 = 0，中間單調', () => {
    expect(discreteMix(0.6)).toBe(1)
    expect(discreteMix(2)).toBe(1)
    expect(discreteMix(4)).toBe(0)
    expect(discreteMix(23)).toBe(0)
    expect(discreteMix(2.5)).toBeGreaterThan(discreteMix(3.5))
  })

  it('平均輝光隨轉速變亮且不出界', () => {
    expect(averagedGlow(7000)).toBeGreaterThan(averagedGlow(700))
    expect(averagedGlow(7000, 1)).toBeLessThanOrEqual(1)
    expect(averagedGlow(700, -1)).toBeGreaterThanOrEqual(0)
  })

  it('sparksBetween 找得到跨過的跳火點（含跨 720 接縫）', () => {
    const rpm = 700, adv = sparkAdvanceDeg(rpm)
    // 1 缸的跳火點在曲軸角 720 − adv
    expect(sparksBetween(720 - adv - 1, 720 - adv + 1, rpm, fireOffset)).toEqual([1])
    expect(sparksBetween(1440 - adv - 1, 1440 - adv + 1, rpm, fireOffset)).toEqual([1])
    // 3 缸 = 180 − adv
    expect(sparksBetween(180 - adv - 0.5, 180 - adv + 0.5, rpm, fireOffset)).toEqual([3])
    expect(sparksBetween(10, 20, rpm, fireOffset)).toEqual([])
    expect(sparksBetween(0, 720, rpm, fireOffset).sort()).toEqual([1, 2, 3, 4])
    expect(sparksBetween(5, 5, rpm, fireOffset)).toEqual([])
  })
})
