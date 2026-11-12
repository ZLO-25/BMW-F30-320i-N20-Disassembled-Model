/**
 * R4 四行程循環的純邏輯（不碰 three），運轉動畫與面板共用，有 Vitest。
 *
 *   曲軸角 θ（度）── 每缸各差 180° 點火 ──► 這一缸在 720° 循環的哪裡（φ）
 *
 *     φ:   0 ──── 180 ──── 360 ──── 540 ──── 720
 *          │ 做功  │  排氣  │  進氣  │  壓縮  │
 *          ▲ 點火（上死點）
 *
 * 點火順序 1-3-4-2 是直列四缸常見的順序；N20 原廠資料還沒查到（待查證），所以介面上會註明「示意」。
 * 氣門開關簡化成整個行程開著（實際有重疊角、早開晚關，而且 VANOS / Valvetronic 會一直調整）。
 */
export type Stroke = 'power' | 'exhaust' | 'intake' | 'compression'
export const FIRING_ORDER = [1, 3, 4, 2]
/** 每缸「做功開始」時的曲軸角：照點火順序每缸晚 180° */
export const fireOffset = (cyl: number) => FIRING_ORDER.indexOf(cyl) * 180

/** 這一缸在 720° 循環裡的位置（0–720） */
export const cyclePhase = (crankDeg: number, cyl: number) => (((crankDeg - fireOffset(cyl)) % 720) + 720) % 720

export function strokeOf(phase: number): Stroke {
  if (phase < 180) return 'power'
  if (phase < 360) return 'exhaust'
  if (phase < 540) return 'intake'
  return 'compression'
}

/** 氣門開度 0–1：排氣門在排氣行程、進氣門在進氣行程畫一個正弦弧 */
export function valveLift(phase: number, which: 'intake' | 'exhaust') {
  const start = which === 'exhaust' ? 180 : 360
  const p = phase - start
  return p > 0 && p < 180 ? Math.sin((p / 180) * Math.PI) : 0
}

/**
 * 曲柄連桿：給曲柄銷角度（0 = 朝上）、曲柄半徑 r、連桿長 L，
 * 回傳曲柄銷位置（相對曲軸中心）、活塞銷高度、連桿傾角（繞 X 軸）。
 */
export function slider(pinAngle: number, r: number, L: number) {
  const py = Math.cos(pinAngle) * r, pz = Math.sin(pinAngle) * r
  const h = Math.sqrt(L * L - pz * pz)
  return { py, pz, pistonY: py + h, rodAngle: Math.atan2(pz, h) }
}

/** 轉速 → 每秒幾轉；慢動作時除以 SLOW */
export const SLOW = 40
export const revPerSec = (rpm: number, slow: boolean) => rpm / 60 / (slow ? SLOW : 1)
export const RPM_RANGE = [700, 7000] as const   // 上限 = 紅線 7,000 rpm（wiki_n20、bmwtuning_n20，社群）；下限是示意
export const rpmAt = (t: number) => Math.round(RPM_RANGE[0] + t * (RPM_RANGE[1] - RPM_RANGE[0]))
/** 四行程四缸：曲軸每轉一圈點火兩次 */
export const firingHz = (rpm: number) => (rpm / 60) * 2
