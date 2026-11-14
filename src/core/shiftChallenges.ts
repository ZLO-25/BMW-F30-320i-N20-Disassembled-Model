/** 換檔挑戰（G4 加分）：判定是純函式，介面每 125 ms 餵一次狀態。完成紀錄存 localStorage（try/catch） */
import { REDLINE, type Gear, type GearboxState } from './gearbox'

export type ChallengeId = 'launch' | 'to_sixth' | 'down_6_3' | 'reverse' | 'manual_clutch'
export const CHALLENGES: ChallengeId[] = ['launch', 'to_sixth', 'down_6_3', 'reverse', 'manual_clutch']

export interface ChallengeState { done: ChallengeId[]; last: Gear | null }
export const newChallengeState = (done: ChallengeId[] = []): ChallengeState => ({ done, last: null })

/** 看一眼目前狀態；回傳新的狀態（有變才是新物件）。last = 最近一次「鎖上」的檔位 */
export function observeChallenges(c: ChallengeState, s: Readonly<GearboxState>, autoClutch: boolean): ChallengeState {
  const add = new Set<ChallengeId>()
  let last = c.last
  if (s.locked && s.gear !== last) {
    const from = last, to = s.gear
    if (from !== null) {
      if (from === '6' && to === '3' && s.engineRpm <= REDLINE) add.add('down_6_3')
      if (!autoClutch && from !== to) add.add('manual_clutch')
    }
    last = to
  }
  if (s.locked && s.gear === '1' && s.outRpm > 100) add.add('launch')
  if (s.locked && s.gear === '6') add.add('to_sixth')
  if (s.locked && s.gear === 'R' && s.outRpm < -20) add.add('reverse')
  const fresh = [...add].filter(id => !c.done.includes(id))
  if (!fresh.length && last === c.last) return c
  return { done: [...c.done, ...fresh], last }
}

const KEY = 'n20.shiftChallenges.v1'
export function loadChallenges(): ChallengeId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is ChallengeId => CHALLENGES.includes(x)) : []
  } catch { return [] }
}
export function saveChallenges(done: ChallengeId[]) { try { localStorage.setItem(KEY, JSON.stringify(done)) } catch { /* 存不了就算了 */ } }
