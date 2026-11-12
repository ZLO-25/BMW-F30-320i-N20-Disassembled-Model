import { describe, expect, it } from 'vitest'
import { cyclePhase, strokeOf, valveLift, slider, firingHz } from './engineCycle'

describe('R4 四行程循環', () => {
  it('θ = 0：1 缸剛點火、4 缸開始進氣、3 缸壓縮、2 缸排氣', () => {
    expect(strokeOf(cyclePhase(0, 1))).toBe('power')
    expect(strokeOf(cyclePhase(0, 4))).toBe('intake')
    expect(strokeOf(cyclePhase(0, 3))).toBe('compression')
    expect(strokeOf(cyclePhase(0, 2))).toBe('exhaust')
  })

  it('任何時刻四缸剛好各在不同的行程', () => {
    for (let a = 0; a < 720; a += 7) {
      const s = new Set([1, 2, 3, 4].map(c => strokeOf(cyclePhase(a, c))))
      expect(s.size).toBe(4)
    }
  })

  it('點火順序 1-3-4-2：每 180° 換下一缸做功', () => {
    const order = [0, 180, 360, 540].map(a => [1, 2, 3, 4].find(c => strokeOf(cyclePhase(a + 1, c)) === 'power'))
    expect(order).toEqual([1, 3, 4, 2])
  })

  it('同一缸的進、排氣門不會同時開（簡化模型）', () => {
    for (let p = 0; p < 720; p += 3) expect(valveLift(p, 'intake') * valveLift(p, 'exhaust')).toBe(0)
    expect(valveLift(270, 'exhaust')).toBeCloseTo(1)
    expect(valveLift(450, 'intake')).toBeCloseTo(1)
  })

  it('曲柄連桿：上死點活塞最高、行程 = 2r', () => {
    const r = 0.045, L = 0.19
    expect(slider(0, r, L).pistonY - slider(Math.PI, r, L).pistonY).toBeCloseTo(2 * r, 6)
    for (let a = 0; a < Math.PI * 2; a += 0.1) expect(slider(a, r, L).pistonY).toBeLessThanOrEqual(slider(0, r, L).pistonY + 1e-9)
  })

  it('聲音的點火頻率：3000 rpm = 100 Hz', () => {
    expect(firingHz(3000)).toBe(100)
  })
})
