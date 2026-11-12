/**
 * R5 螺栓級拆裝：把一個零件的「拆下 / 裝回」拆成一步一步（純邏輯，有 Vitest）。
 *
 *   拆下：拿工具 → 逐組鬆開螺絲（按住）→ 注意事項 → 取下
 *   裝回：放回定位 → 逐組鎖上（顯示扭力或「待查證」、一次性螺絲要換新）→ 完成
 *
 * 扭力、數量一律來自資料（有 source 才顯示數字）；資料沒有的就說「待查證」，不自己補。
 * 「多顆螺絲要對角、分次鬆開或鎖緊」是一般修車原則，介面上標「通用原則」，不是這台車的規格。
 */
import type { Part, Fastener, Bilingual } from './schema'

export type BoltAction = 'remove' | 'install'
export type BoltStep =
  | { kind: 'tools'; tools: string[] }
  | { kind: 'loosen' | 'tighten'; fastener: Fastener; index: number; multi: boolean }
  | { kind: 'warn'; text: Bilingual }
  | { kind: 'lift' | 'place' }
  | { kind: 'unknown' }

/** 這個零件在螺栓級模式下要不要跳出步驟（沒有工具也沒有螺絲資料的就直接拆） */
export const needsBoltSteps = (p: Part) => p.removal.fasteners.length > 0 || p.removal.tools.length > 0

/** qty 未知或大於 2 顆時，提醒對角分次 */
const isMulti = (f: Fastener) => f.qty === null || f.qty > 2

export function boltSteps(p: Part, action: BoltAction): BoltStep[] {
  const fs = p.removal.fasteners
  const steps: BoltStep[] = []
  if (p.removal.tools.length) steps.push({ kind: 'tools', tools: [...p.removal.tools] })
  if (action === 'remove') {
    if (!fs.length) steps.push({ kind: 'unknown' })
    fs.forEach((f, i) => steps.push({ kind: 'loosen', fastener: f, index: i, multi: isMulti(f) }))
    for (const w of p.removal.warnings) steps.push({ kind: 'warn', text: w })
    steps.push({ kind: 'lift' })
  } else {
    steps.push({ kind: 'place' })
    if (!fs.length) steps.push({ kind: 'unknown' })
    // 裝回：反順序鎖（最後鬆開的先鎖）
    fs.map((f, i) => ({ f, i })).reverse().forEach(({ f, i }) => steps.push({ kind: 'tighten', fastener: f, index: i, multi: isMulti(f) }))
  }
  return steps
}

/** 需要使用者「按住」完成的步驟（鬆開 / 鎖上） */
export const isHoldStep = (s: BoltStep) => s.kind === 'loosen' || s.kind === 'tighten'
/** 按住多久（秒）：螺絲越多越久，數量未知當 4 顆 */
export const holdSeconds = (s: BoltStep) => (isHoldStep(s) ? 0.35 + 0.15 * Math.min(8, (s as { fastener: Fastener }).fastener.qty ?? 4) : 0)

/** 這組螺絲的扭力文字所需資訊：有數字且有來源才算數 */
export function torqueInfo(f: Fastener): { nm: number | null; source: string | null; confidence: string } {
  return { nm: f.torque_nm !== null && f.source ? f.torque_nm : null, source: f.source, confidence: f.confidence }
}

/** 涵蓋率：有螺絲資料的零件比例、有來源扭力的螺絲組比例（報告用） */
export function boltCoverage(parts: Part[]) {
  const removable = parts.filter(p => p.removable)
  const withF = removable.filter(p => p.removal.fasteners.length)
  const groups = removable.flatMap(p => p.removal.fasteners)
  return { parts: removable.length, withFasteners: withF.length, groups: groups.length, torqueSourced: groups.filter(f => torqueInfo(f).nm !== null).length }
}
