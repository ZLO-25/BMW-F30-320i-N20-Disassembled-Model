import { describe, expect, it } from 'vitest'
import { mixSamples, validateSamples, synthCycle, SYNTH_BASE_RPM, RATE_MAX, type EngineSample } from './engineSoundMix'

const S: EngineSample[] = [
  { rpm: 800, file: 'idle.ogg' }, { rpm: 1500, file: 'a.ogg' }, { rpm: 2500, file: 'b.ogg' }, { rpm: 3500, file: 'c.ogg' },
]

describe('mixSamples', () => {
  it('在錄音轉速上只播那一段、原速', () => {
    expect(mixSamples(S, 1500)).toEqual([{ index: 1, gain: 1, rate: 1 }])
  })
  it('兩段之間等功率交叉淡化', () => {
    const m = mixSamples(S, 2000)
    expect(m.map(x => x.index)).toEqual([1, 2])
    expect(m[0].gain ** 2 + m[1].gain ** 2).toBeCloseTo(1, 6)
    expect(m[0].rate).toBeCloseTo(2000 / 1500)
    expect(m[1].rate).toBeCloseTo(2000 / 2500)
  })
  it('低於最低 / 高於最高：用端點那段變速，並限制在範圍內', () => {
    expect(mixSamples(S, 600)[0]).toMatchObject({ index: 0, gain: 1 })
    const hi = mixSamples(S, 7000)
    expect(hi).toHaveLength(1)
    expect(hi[0].index).toBe(3)
    expect(hi[0].rate).toBe(RATE_MAX)
  })
  it('沒有錄音時回傳空陣列', () => { expect(mixSamples([], 1000)).toEqual([]) })
  it('轉速從低掃到高，總功率一直是 1', () => {
    for (let r = 800; r <= 3500; r += 37) {
      const p = mixSamples(S, r).reduce((s, x) => s + x.gain ** 2, 0)
      expect(p).toBeCloseTo(1, 4)
    }
  })
})

describe('validateSamples', () => {
  it('正確的清單沒有錯誤', () => { expect(validateSamples(S)).toEqual([]) })
  it('抓出不遞增與間隔太大', () => {
    expect(validateSamples([{ rpm: 2000, file: 'a' }, { rpm: 1000, file: 'b' }]).length).toBe(1)
    expect(validateSamples([{ rpm: 800, file: 'a' }, { rpm: 6000, file: 'b' }]).length).toBe(1)
  })
})

describe('synthCycle', () => {
  it('長度 = 兩圈曲軸的時間，振幅正規化、沒有直流', () => {
    const sr = 22050
    const w = synthCycle(sr)
    expect(w.length).toBe(Math.round(2 * 60 / SYNTH_BASE_RPM * sr))
    let peak = 0, sum = 0
    for (const v of w) { peak = Math.max(peak, Math.abs(v)); sum += v }
    expect(peak).toBeCloseTo(0.9, 3)
    expect(Math.abs(sum / w.length)).toBeLessThan(1e-3)
  })
  it('同一個 seed 結果一樣', () => {
    expect(synthCycle(8000, 3)).toEqual(synthCycle(8000, 3))
  })
})
