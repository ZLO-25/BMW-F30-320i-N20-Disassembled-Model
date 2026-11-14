/**
 * 手排換檔台的純邏輯（G1）。不 import React / three。
 * 所有「能不能換檔」「轉速怎麼算」都只在這裡；介面只呼叫 requestShift 與顯示結果。
 *
 * 三組轉速：引擎 ──(離合器)──► 輸入軸 ──(被鎖上的那對齒輪)──► 輸出軸
 * 一次換檔：wait_clutch → to_neutral → sync → engage
 */

export type Gear = 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6'
export type SyncId = '1_2' | '3_4' | '5_6'
export type ShiftPhase = 'wait_clutch' | 'to_neutral' | 'sync' | 'engage'
export type Refusal = 'busy' | 'same' | 'need_clutch' | 'reverse_moving' | 'over_rev'

/**
 * 手排示意齒比（實際 GS6-17BG 齒比待查證）。R 取負值 = 輸出反轉。
 * 官方值候選：BMW 新聞稿 2012（4.551/2.548/1.659/1.230/1.000/0.830、R 4.138）——
 * 實作時 PDF 開不到（網路被擋），尚未核對，所以不登記為來源，維持示意值。
 * 核對後只要改這一個常數。
 */
export const MANUAL_RATIOS: Record<Gear, number> = { R: -3.4, N: 0, 1: 3.7, 2: 2.1, 3: 1.4, 4: 1.0, 5: 0.8, 6: 0.65 }
export const IDLE = 800            // 示意怠速
export const MAX_THROTTLE_RPM = 6500
export const REDLINE = 7000        // 來源同 engineCycle.ts（wiki_n20 / bmwtuning_n20）

/** 每個前進檔用哪個同步器、套筒往哪邊（+1 = +X = 奇數檔） */
export const SYNC_OF: Record<string, [SyncId, 1 | -1]> =
  { 1: ['1_2', 1], 2: ['1_2', -1], 3: ['3_4', 1], 4: ['3_4', -1], 5: ['5_6', 1], 6: ['5_6', -1] }

export interface GearboxState {
  gear: Gear                       // 目前「鎖上」的檔；換檔途中是 'N'
  locked: boolean
  shift: { from: Gear; to: Gear; phase: ShiftPhase; p: number } | null
  pedal: number                    // 0 = 放開，1 = 踩到底
  engineRpm: number; inputRpm: number; outRpm: number
  sleeve: Record<SyncId, number>   // -1..1
  rev: number                      // 倒檔惰輪 0..1
  grind: number                    // 打齒閃紅光剩餘秒數
  grindAt: Gear | null
}
export interface GearboxInputs { throttle: number; clutchHeld: boolean; brakeHeld: boolean; autoClutch: boolean; slow: boolean }

const approach = (v: number, target: number, dt: number, tau: number) => v + (target - v) * (1 - Math.exp(-dt / tau))
const moveTo = (v: number, target: number, d: number) => (v < target ? Math.min(target, v + d) : Math.max(target, v - d))
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** 離合器傳遞程度：1 = 完全接合，0 = 完全分離 */
export const coupling = (pedal: number) => 1 - smooth(0.3, 0.7, pedal)

export const createGearbox = (): GearboxState => ({
  gear: 'N', locked: false, shift: null, pedal: 0, engineRpm: IDLE, inputRpm: IDLE, outRpm: 0,
  sleeve: { '1_2': 0, '3_4': 0, '5_6': 0 }, rev: 0, grind: 0, grindAt: null,
})

export function requestShift(s: GearboxState, to: Gear, inp: GearboxInputs): 'ok' | Refusal {
  if (s.shift) return 'busy'
  if (to === s.gear) return 'same'
  if (!inp.autoClutch && s.pedal < 0.8) { s.grind = 0.4; s.grindAt = to; return 'need_clutch' }
  if (to === 'R' && s.outRpm > 60) return 'reverse_moving'
  if (to !== 'R' && to !== 'N' && s.outRpm < -60) return 'reverse_moving'
  if (to !== 'N' && Math.abs(s.outRpm * MANUAL_RATIOS[to]) > REDLINE) return 'over_rev'
  s.shift = { from: s.gear, to, phase: 'wait_clutch', p: 0 }
  return 'ok'
}

function setSleeve(s: GearboxState, g: Gear, v: number) {
  if (g === 'R') s.rev = v
  else if (SYNC_OF[g]) s.sleeve[SYNC_OF[g][0]] = SYNC_OF[g][1] * v
}

export function stepGearbox(s: GearboxState, inp: GearboxInputs, dtReal: number) {
  const dt = dtReal * (inp.slow ? 0.3 : 1)
  s.grind = Math.max(0, s.grind - dtReal)
  // 1) 踏板：按住，或自動離合器在換檔中
  const want = inp.clutchHeld || (inp.autoClutch && s.shift !== null) ? 1 : 0
  s.pedal = moveTo(s.pedal, want, dt / 0.25)
  const k = coupling(s.pedal)
  // 2) 換檔進度
  const sh = s.shift
  let syncing = false
  if (sh) {
    const next = () => { if (sh.to === 'N') s.shift = null; else { sh.phase = 'sync'; sh.p = 0 } }
    if (sh.phase === 'wait_clutch') {
      if (s.pedal >= 0.8) { if (sh.from === 'N') next(); else { sh.phase = 'to_neutral'; sh.p = 0 } }
    } else if (sh.phase === 'to_neutral') {
      sh.p = Math.min(1, sh.p + dt / 0.25)
      setSleeve(s, sh.from, 1 - sh.p)
      if (sh.p >= 0.4) { s.locked = false; s.gear = 'N' }     // 犬齒脫開
      if (sh.p >= 1) next()
    } else if (sh.phase === 'sync') {
      sh.p = Math.min(1, sh.p + dt / 0.2)
      setSleeve(s, sh.to, 0.6 * sh.p)
      syncing = true
      const target = s.outRpm * MANUAL_RATIOS[sh.to]
      s.inputRpm = approach(s.inputRpm, target, dt, 0.12)
      if (sh.p >= 1 && Math.abs(s.inputRpm - target) < 30) { s.inputRpm = target; sh.phase = 'engage'; sh.p = 0 }
    } else {   // engage
      sh.p = Math.min(1, sh.p + dt / 0.15)
      setSleeve(s, sh.to, 0.6 + 0.4 * sh.p)
      if (sh.p >= 1) { s.gear = sh.to; s.locked = true; s.shift = null }
    }
  }
  // 3) 三組轉速
  const target = IDLE + inp.throttle * (MAX_THROTTLE_RPM - IDLE)
  const ratio = s.locked ? MANUAL_RATIOS[s.gear] : 0
  if (inp.brakeHeld) s.outRpm = approach(s.outRpm, 0, dt, 0.5)
  if (ratio) {                                   // 在檔上：輸入軸和輸出軸用齒比綁在一起
    if (!inp.brakeHeld) {
      if (k > 0) {                               // 引擎拉車；低於怠速時快一點追上（不模擬熄火）
        const below = Math.abs(s.outRpm * ratio) < IDLE - 50
        s.outRpm = approach(s.outRpm, target / ratio, dt, (below ? 0.5 : 2.5) / k)
      } else s.outRpm = approach(s.outRpm, 0, dt, 10)   // 滑行
    }
    s.inputRpm = s.outRpm * ratio
    s.engineRpm = k > 0 ? approach(s.engineRpm, Math.max(s.inputRpm, IDLE), dt, 0.25 / k)
                        : approach(s.engineRpm, target, dt, 0.3)
  } else {                                       // 空檔或換檔途中
    if (!inp.brakeHeld) s.outRpm = approach(s.outRpm, 0, dt, 10)
    s.engineRpm = approach(s.engineRpm, target, dt, 0.3)
    if (!syncing) s.inputRpm = k > 0 ? approach(s.inputRpm, s.engineRpm, dt, 0.2 / k) : approach(s.inputRpm, 0, dt, 3)
  }
}

/** 現在要亮哪一句說明（i18n 鍵，UI 物件裡以 'shiftStep_' 開頭） */
export type ShiftPhaseKey = 'wait_clutch' | 'to_neutral' | 'sync' | 'engage' | 'neutral' | 'pedal' | 'slipping' | 'driving'
export function shiftPhaseKey(s: GearboxState): ShiftPhaseKey {
  if (s.shift) return s.shift.phase
  if (!s.locked) return 'neutral'
  if (s.pedal > 0.5) return 'pedal'
  if (s.engineRpm - Math.abs(s.inputRpm) > 150) return 'slipping'   // 離合器還在打滑：引擎明顯比輸入軸快
  return 'driving'
}

/** 拒絕原因對應的 i18n 鍵 */
export const REFUSAL_KEY: Record<Refusal, string> = {
  busy: 'shiftRefuse_busy', same: 'shiftRefuse_same', need_clutch: 'shiftRefuse_need_clutch',
  reverse_moving: 'shiftRefuse_reverse_moving', over_rev: 'shiftRefuse_over_rev',
}
