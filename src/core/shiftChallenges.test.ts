import { describe, it, expect } from 'vitest'
import { createGearbox, requestShift, stepGearbox, type Gear, type GearboxInputs, type GearboxState } from './gearbox'
import { observeChallenges, newChallengeState, loadChallenges } from './shiftChallenges'

const base: GearboxInputs = { throttle: 0.5, clutchHeld: false, brakeHeld: false, autoClutch: true, slow: false }
function play(steps: Array<{ g: Gear; sec: number; inp?: Partial<GearboxInputs>; pre?: number }>) {
  const s: GearboxState = createGearbox(); let c = newChallengeState()
  for (const st of steps) {
    const inp = { ...base, ...st.inp }
    for (let i = 0; i < (st.pre ?? 0) * 60; i++) { stepGearbox(s, inp, 1 / 60); c = observeChallenges(c, s, inp.autoClutch) }   // 先按住離合器
    requestShift(s, st.g, inp)
    for (let i = 0; i < st.sec * 60; i++) { stepGearbox(s, inp, 1 / 60); c = observeChallenges(c, s, inp.autoClutch) }
  }
  return c
}
describe('換檔挑戰', () => {
  it('起步與升到 6 檔', () => {
    const c = play([{ g: '1', sec: 8 }, { g: '2', sec: 5 }, { g: '3', sec: 5 }, { g: '4', sec: 5 }, { g: '5', sec: 5 }, { g: '6', sec: 8 }])
    expect(c.done).toEqual(expect.arrayContaining(['launch', 'to_sixth']))
  })
  it('6 降 3 且不超轉', () => {
    const c = play([{ g: '1', sec: 8 }, { g: '2', sec: 5 }, { g: '3', sec: 5 }, { g: '4', sec: 5 }, { g: '5', sec: 5 }, { g: '6', sec: 8, inp: { throttle: 0.3 } }, { g: '3', sec: 4, inp: { throttle: 0.3 } }])
    expect(c.done).toContain('down_6_3')
  })
  it('停車後倒檔', () => {
    const c = play([{ g: '1', sec: 6 }, { g: 'N', sec: 2 }, { g: 'N', sec: 8, inp: { brakeHeld: true } }, { g: 'R', sec: 8 }])
    expect(c.done).toContain('reverse')
  })
  it('沒開自動離合器完成一次換檔', () => {
    const c = play([{ g: '1', sec: 6 }, { g: '2', sec: 6, pre: 0.6, inp: { autoClutch: false, clutchHeld: true } }])
    expect(c.done).toContain('manual_clutch')
  })
  it('localStorage 讀不到時回傳空陣列', () => { expect(loadChallenges()).toEqual([]) })
})
