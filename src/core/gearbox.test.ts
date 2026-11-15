import { describe, it, expect } from 'vitest'
import { createGearbox, requestShift, stepGearbox, shiftPhaseKey, MANUAL_RATIOS, REDLINE, type Gear, type GearboxInputs, type GearboxState } from './gearbox'

const base: GearboxInputs = { throttle: 0, clutchHeld: false, brakeHeld: false, autoClutch: true, slow: false }
const run = (s: GearboxState, sec: number, inp: Partial<GearboxInputs> = {}, each?: (s: GearboxState) => void) => {
  const i = { ...base, ...inp }
  for (let n = 0; n < Math.round(sec * 60); n++) { stepGearbox(s, i, 1 / 60); each?.(s) }
}
const go = (s: GearboxState, g: Gear, inp: Partial<GearboxInputs> = {}, sec = 2.5) => { const r = requestShift(s, g, { ...base, ...inp }); run(s, sec, inp); return r }

describe('手排換檔台純邏輯', () => {
  it('1 初始跑 1 秒：N、未鎖、輸出軸 0', () => {
    const s = createGearbox(); run(s, 1)
    expect(s.gear).toBe('N'); expect(s.locked).toBe(false); expect(s.outRpm).toBe(0)
    expect(Math.abs(s.inputRpm - s.engineRpm)).toBeLessThan(100)
  })
  it('2 自動離合器請求 1 檔', () => {
    const s = createGearbox(); expect(go(s, '1')).toBe('ok')
    expect(s.gear).toBe('1'); expect(s.locked).toBe(true); expect(s.sleeve['1_2']).toBe(1); expect(s.pedal).toBe(0)
  })
  it('3 1 檔輸入軸 = 輸出軸 × 齒比', () => {
    const s = createGearbox(); go(s, '1', { throttle: 0.3 }, 12)
    expect(Math.abs(s.inputRpm - s.outRpm * MANUAL_RATIOS['1'])).toBeLessThan(1)
    expect(Math.abs(s.engineRpm - s.inputRpm)).toBeLessThan(150)
    expect(s.outRpm).toBeGreaterThan(0)
  })
  it('4 1→2：經過各階段、套筒到另一邊、升檔掉轉', () => {
    const s = createGearbox(); go(s, '1', { throttle: 0.5 }, 10)
    const before = s.engineRpm
    const phases = new Set<string>()
    requestShift(s, '2', { ...base, throttle: 0.5 })
    let doneAt = -1, t = 0
    run(s, 4, { throttle: 0.5 }, x => { t++; if (x.shift) phases.add(x.shift.phase); else if (doneAt < 0) doneAt = t })
    expect([...phases]).toEqual(expect.arrayContaining(['to_neutral', 'sync', 'engage']))
    expect(s.gear).toBe('2'); expect(s.sleeve['1_2']).toBe(-1)
    // 放開離合器後的引擎轉速低於換檔前
    const s2 = createGearbox(); go(s2, '1', { throttle: 0.5 }, 10)
    requestShift(s2, '2', { ...base, throttle: 0.5 })
    let low = Infinity
    run(s2, 3, { throttle: 0.5 }, x => { if (!x.shift && x.gear === '2') low = Math.min(low, x.engineRpm) })
    expect(low).toBeLessThan(before)
  })
  it('5 2→3：任何時刻最多一個套筒不在 0', () => {
    const s = createGearbox(); go(s, '1', { throttle: 0.4 }, 6); go(s, '2', { throttle: 0.4 }, 4)
    requestShift(s, '3', { ...base, throttle: 0.4 })
    let bad = 0
    run(s, 3, { throttle: 0.4 }, x => { if (Object.values(x.sleeve).filter(v => Math.abs(v) > 1e-9).length > 1) bad++ })
    expect(bad).toBe(0); expect(s.sleeve['1_2']).toBeCloseTo(0, 6); expect(s.sleeve['3_4']).toBe(1)
  })
  it('6 行進中請求 R 被拒', () => {
    const s = createGearbox(); go(s, '1', { throttle: 0.4 }, 6)
    run(s, 0.5, { clutchHeld: true }) ; // 離合器踩著滑行也還在動
    const g = s.gear
    expect(requestShift(s, 'R', base)).toBe('reverse_moving'); expect(s.gear).toBe(g); expect(s.shift).toBeNull()
  })
  it('7 全油門 3 檔後請求 1 檔 → over_rev', () => {
    const s = createGearbox(); go(s, '1', { throttle: 1 }, 6); go(s, '2', { throttle: 1 }, 5); go(s, '3', { throttle: 1 }, 15)
    expect(s.gear).toBe('3')
    expect(requestShift(s, '1', { ...base, throttle: 1 })).toBe('over_rev')
    expect(Math.abs(s.outRpm * MANUAL_RATIOS['1'])).toBeGreaterThan(REDLINE)
  })
  it('8 關自動離合器沒踩就請求 → need_clutch 並打齒', () => {
    const s = createGearbox()
    expect(requestShift(s, '1', { ...base, autoClutch: false })).toBe('need_clutch')
    expect(s.grind).toBeGreaterThan(0); expect(s.grindAt).toBe('1'); expect(s.shift).toBeNull()
  })
  it('9 手動離合器：按住後請求成功，放開 1 秒後引擎與輸入軸相等', () => {
    const s = createGearbox(); const m = { autoClutch: false }
    run(s, 0.5, { ...m, clutchHeld: true })
    expect(requestShift(s, '1', { ...base, ...m, clutchHeld: true })).toBe('ok')
    run(s, 1.5, { ...m, clutchHeld: true })
    expect(s.gear).toBe('1')
    run(s, 1.5, { ...m, clutchHeld: false })
    expect(Math.abs(s.engineRpm - s.inputRpm)).toBeLessThan(100)
  })
  it('10 N + 煞車到停，請求 R：輸出反轉', () => {
    const s = createGearbox(); go(s, '1', { throttle: 0.3 }, 5)
    go(s, 'N', {}, 1); run(s, 6, { brakeHeld: true })
    expect(Math.abs(s.outRpm)).toBeLessThan(60)
    expect(requestShift(s, 'R', { ...base, throttle: 0.3 })).toBe('ok')
    run(s, 6, { throttle: 0.3 })
    expect(s.gear).toBe('R'); expect(s.rev).toBe(1); expect(s.outRpm).toBeLessThan(0); expect(s.inputRpm).toBeGreaterThan(0)
  })
  it('11 換檔進行中再請求 → busy', () => {
    const s = createGearbox(); requestShift(s, '1', base); run(s, 0.1)
    expect(requestShift(s, '2', base)).toBe('busy')
  })
  it('12 隨機操作：轉速都有限、引擎在 0..7100', () => {
    const s = createGearbox(); let seed = 7
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    const gears: Gear[] = ['R', 'N', '1', '2', '3', '4', '5', '6']
    for (let n = 0; n < 4000; n++) {
      const inp: GearboxInputs = { throttle: rnd(), clutchHeld: rnd() < 0.3, brakeHeld: rnd() < 0.2, autoClutch: rnd() < 0.5, slow: rnd() < 0.2 }
      if (rnd() < 0.03) requestShift(s, gears[Math.floor(rnd() * 8)], inp)
      stepGearbox(s, inp, 1 / 60)
      for (const v of [s.engineRpm, s.inputRpm, s.outRpm, s.pedal, s.rev]) expect(Number.isFinite(v)).toBe(true)
      expect(s.engineRpm).toBeGreaterThanOrEqual(0); expect(s.engineRpm).toBeLessThanOrEqual(7100)
    }
  })
  it('shiftPhaseKey', () => {
    const s = createGearbox(); expect(shiftPhaseKey(s)).toBe('neutral')
    requestShift(s, '1', base); expect(shiftPhaseKey(s)).toBe('wait_clutch')
    run(s, 15); expect(shiftPhaseKey(s)).toBe('driving')
  })
})
