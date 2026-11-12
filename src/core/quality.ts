/**
 * E2 畫質設定檔（純邏輯，不 import React / three）。
 *
 * 以前是「猜裝置強弱 → high / mid / low 三檔」，所有桌機與筆電一律最高檔。現在改成六級階梯，
 * 先猜一個起點，再看實際 FPS 往下調（見 Scene 的 QualityGovernor），使用者也可以在檢視工具手動選：
 *
 *   級    像素比  MSAA  環境遮蔽    Bloom  陰影圖  接觸陰影  幾何   誰從這裡起跳
 *   L5    2       4x    全解析度    有     2048    1024      high   使用者手動選「精緻」
 *   L4    1.5     4x    全解析度    無     2048    1024      high   有獨立顯示卡的桌機
 *   L3    1.25    2x    半解析度    無     1024    512       high   內顯筆電、辨識不出的桌機
 *   L2    1       原生  無          無     1024    512       high   （自動降級會到這裡）
 *   L1    1.5     無    無          無     無      512       mid    手機、平板
 *   L0    1       無    無          無     無      無        low    4 核以下手機
 *
 * 自動降級只在同一種幾何內往下走（L5→L4→L3→L2）；L1、L0 不再降。不自動升級（避免來回跳動）。
 * 這張表的數值是依 E0 的相對成本排的起點，拿到實機數字後可以微調。
 */
export type Level = 0 | 1 | 2 | 3 | 4 | 5
export type QualityMode = 'auto' | 'smooth' | 'balanced' | 'fine'
export type Detail = 'high' | 'mid' | 'low'

export interface QualityProfile {
  level: Level
  detail: Detail
  dprMax: number
  /** 後處理的抗鋸齒取樣數；0 = 不用 */
  msaa: 0 | 2 | 4
  /** 畫布本身的原生抗鋸齒（只有 L2：不掛後處理時用）。這個在建立繪圖環境時就決定了，改變要重建畫布 */
  nativeAA: boolean
  ao: 'off' | 'half' | 'full'
  bloom: boolean
  shadowMap: 0 | 1024 | 2048
  contact: 0 | 512 | 1024
}

const LADDER: Record<Level, Omit<QualityProfile, 'level'>> = {
  5: { detail: 'high', dprMax: 2, msaa: 4, nativeAA: false, ao: 'full', bloom: true, shadowMap: 2048, contact: 1024 },
  4: { detail: 'high', dprMax: 1.5, msaa: 4, nativeAA: false, ao: 'full', bloom: false, shadowMap: 2048, contact: 1024 },
  3: { detail: 'high', dprMax: 1.25, msaa: 2, nativeAA: false, ao: 'half', bloom: false, shadowMap: 1024, contact: 512 },
  2: { detail: 'high', dprMax: 1, msaa: 0, nativeAA: true, ao: 'off', bloom: false, shadowMap: 1024, contact: 512 },
  1: { detail: 'mid', dprMax: 1.5, msaa: 0, nativeAA: false, ao: 'off', bloom: false, shadowMap: 0, contact: 512 },
  0: { detail: 'low', dprMax: 1, msaa: 0, nativeAA: false, ao: 'off', bloom: false, shadowMap: 0, contact: 0 },
}

/** 手機的「精緻」= 中等幾何 + 半解析度 AO（相當於 E2 之前的 mid），其他欄位照 L1 */
const MOBILE_FINE: Omit<QualityProfile, 'level'> = { ...LADDER[1], ao: 'half' }

export function profileFor(level: Level, mobile = false, mobileFine = false): QualityProfile {
  if (mobile && mobileFine) return { level: 5, ...MOBILE_FINE }
  return { level, ...LADDER[level] }
}

/** 舊網址 ?quality=low|mid|high 對應 L0 / L1 / L5；新增 ?level=0..5 直接指定（截圖、測試用） */
export function levelFromUrl(search: string): Level | null {
  const p = new URLSearchParams(search)
  const lv = p.get('level')
  if (lv !== null && /^[0-5]$/.test(lv)) return Number(lv) as Level
  const q = p.get('quality')
  if (q === 'low') return 0
  if (q === 'mid') return 1
  if (q === 'high') return 5
  return null
}

/** 辨識不出強弱、或已知是內顯 / 行動 GPU 的名稱關鍵字 */
const WEAK_GPU = /intel|uhd|iris|swiftshader|llvmpipe|softpipe|mali|adreno|powervr|apple gpu|microsoft basic|software|angle \(unknown/i
export function isWeakGpu(renderer: string | null | undefined): boolean {
  if (!renderer || renderer === 'unknown') return true
  return WEAK_GPU.test(renderer)
}

export interface InitialInput {
  mobile: boolean
  cores: number
  gpuRenderer: string | null
  saved: SavedQuality | null
  search: string
}

export interface SavedQuality { mode: QualityMode; level: Level }

export function modeLevel(mode: QualityMode, mobile: boolean, guess: Level): Level {
  if (mode === 'auto') return guess
  if (mode === 'smooth') return mobile ? 0 : 2
  if (mode === 'balanced') return mobile ? 1 : 3
  return mobile ? 1 : 5   // fine（手機的精緻另外用 mobileFine 旗標）
}

/** 猜起點（沒有網址指定、沒有儲存值時） */
export function guessLevel(mobile: boolean, cores: number, gpuRenderer: string | null): Level {
  if (mobile) return cores <= 4 ? 0 : 1
  return isWeakGpu(gpuRenderer) ? 3 : 4
}

/** 網址 > 儲存值 > 猜。回傳實際模式與級別 */
export function initialQuality(i: InitialInput): SavedQuality {
  const forced = levelFromUrl(i.search)
  if (forced !== null) return { mode: 'auto', level: forced }
  const guess = guessLevel(i.mobile, i.cores, i.gpuRenderer)
  if (i.saved) {
    const level = i.saved.mode === 'auto' ? clampLevel(i.saved.level, i.mobile) : modeLevel(i.saved.mode, i.mobile, guess)
    return { mode: i.saved.mode, level }
  }
  return { mode: 'auto', level: guess }
}

/** 儲存值可能是舊的或被改過：手機不會有 L2–L5，桌機不會有 L0–L1（自動降級只在同一種幾何內） */
function clampLevel(level: Level, mobile: boolean): Level {
  if (mobile) return level <= 1 ? level : 1
  return level >= 2 ? level : 2
}

/** 自動降級的下一級；沒有下一級回傳 null */
export function stepDown(level: Level): Level | null {
  return level >= 3 ? ((level - 1) as Level) : null
}

/** 儲存 / 讀取（storage 由呼叫端傳入，方便測試；讀不到、格式不對都回 null） */
export const QUALITY_KEY = 'n20.quality.v1'
export function parseSaved(raw: string | null): SavedQuality | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<SavedQuality>
    const modes: QualityMode[] = ['auto', 'smooth', 'balanced', 'fine']
    if (!o || !modes.includes(o.mode as QualityMode)) return null
    if (typeof o.level !== 'number' || o.level < 0 || o.level > 5 || !Number.isInteger(o.level)) return null
    return { mode: o.mode as QualityMode, level: o.level as Level }
  } catch { return null }
}

/** 自動降級的判斷：連續兩個窗口的每格中位數都高於門檻就降 */
export const GOVERNOR = { windowMs: 1000, slowMs: 28, strikes: 2, warmupMs: 2000, maxGapMs: 500 } as const

export class Governor {
  private dts: number[] = []
  private winMs = 0
  private strikes = 0
  private start: number
  constructor(now: number) { this.start = now }
  /** 重置（換了畫質或換了畫布之後，重新暖機） */
  reset(now: number) { this.start = now; this.dts = []; this.winMs = 0; this.strikes = 0 }
  /**
   * 每格呼叫一次。dtMs = 距離上一格的毫秒。回傳 true = 該降級了。
   * 間隔超過 maxGapMs 視為中間閒置過（按需渲染）：這格不算，也清掉進行中的窗口。
   */
  push(now: number, dtMs: number): boolean {
    if (now - this.start < GOVERNOR.warmupMs) return false
    if (dtMs > GOVERNOR.maxGapMs) { this.dts = []; this.winMs = 0; this.strikes = 0; return false }
    this.dts.push(dtMs); this.winMs += dtMs
    if (this.winMs < GOVERNOR.windowMs) return false
    const s = [...this.dts].sort((a, b) => a - b)
    const med = s[Math.floor(s.length / 2)]
    this.dts = []; this.winMs = 0
    if (med > GOVERNOR.slowMs) this.strikes++; else this.strikes = 0
    if (this.strikes >= GOVERNOR.strikes) { this.strikes = 0; return true }
    return false
  }
}
