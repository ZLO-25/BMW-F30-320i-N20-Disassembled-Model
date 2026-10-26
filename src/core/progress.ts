/**
 * 學習進度（P5）：純邏輯，沒有 React。
 * 存在 localStorage，讀寫都包 try/catch（無痕模式、空間滿了都不能讓程式掛掉）。
 */
import type { Level, Quiz, Part } from './schema'

export interface MistakeRecord { partId: string; trigger: string; severity: 'info' | 'warning' | 'critical'; at: number }

export interface Progress {
  /** 每一級最好的成績（百分比） */
  levelBest: Record<number, number>
  /** 做完的導覽 id */
  completedProcedures: string[]
  /** 錯誤示範紀錄（最新在後面，最多留 50 筆） */
  mistakes: MistakeRecord[]
  /** 設定：關掉解鎖條件（PLAN：可在設定中關閉） */
  unlockAll: boolean
  /** P6：每個故障情境最好的成績（百分比） */
  scenarioBest: Record<string, number>
}

export const emptyProgress = (): Progress => ({ levelBest: {}, completedProcedures: [], mistakes: [], unlockAll: false, scenarioBest: {} })

const KEY = 'n20.progress.v1'

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProgress()
    const p = JSON.parse(raw) as Partial<Progress>
    return { ...emptyProgress(), ...p, levelBest: p.levelBest ?? {}, completedProcedures: p.completedProcedures ?? [], mistakes: p.mistakes ?? [], scenarioBest: p.scenarioBest ?? {} }
  } catch { return emptyProgress() }
}

export function saveProgress(p: Progress): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true } catch { return false }
}

/** Lv1 永遠開著；LvN 要上一級達到 passPct，或設定關掉解鎖條件 */
export function isLevelUnlocked(level: number, levels: Level[], p: Progress): boolean {
  if (level <= 1 || p.unlockAll) return true
  const prev = levels.find(l => l.id === level - 1)
  if (!prev) return false
  return (p.levelBest[prev.id] ?? 0) >= prev.passPct
}

/** 記成績：只在比之前好的時候更新 */
export function recordScore(p: Progress, level: number, pct: number): Progress {
  const best = p.levelBest[level] ?? 0
  return pct > best ? { ...p, levelBest: { ...p.levelBest, [level]: pct } } : p
}

export function recordProcedure(p: Progress, id: string): Progress {
  return p.completedProcedures.includes(id) ? p : { ...p, completedProcedures: [...p.completedProcedures, id] }
}

export function recordMistake(p: Progress, m: Omit<MistakeRecord, 'at'>, now = Date.now()): Progress {
  return { ...p, mistakes: [...p.mistakes, { ...m, at: now }].slice(-50) }
}

/** 一題對不對；order 題要整個順序一樣 */
export function isCorrect(q: Quiz, answer: number | number[]): boolean {
  if (q.type === 'order') return Array.isArray(answer) && Array.isArray(q.answer) && answer.length === q.answer.length && answer.every((v, i) => v === (q.answer as number[])[i])
  return !Array.isArray(answer) && answer === q.answer
}

/** 整份測驗的百分比（四捨五入到整數） */
export function scorePct(qs: Quiz[], answers: Array<number | number[] | null>): number {
  if (!qs.length) return 0
  const right = qs.filter((q, i) => answers[i] != null && isCorrect(q, answers[i]!)).length
  return Math.round((right / qs.length) * 100)
}

// ───────────────────────── 錯誤示範 ─────────────────────────
/** 拆零件時會觸發哪些錯誤示範：沒用正確工具、或該先拆的東西還裝著 */
export interface TriggeredMistake { trigger: string; severity: 'info' | 'warning' | 'critical'; consequence: Part['removal']['mistakes'][number]['consequence']; toolId?: string; partId?: string }

export function mistakesFor(part: Part, removed: Set<string>, toolsInHand: Set<string>): TriggeredMistake[] {
  const out: TriggeredMistake[] = []
  for (const m of part.removal.mistakes) {
    const [kind, ref] = m.trigger.split(':')
    if (kind === 'remove_without_tool' && !toolsInHand.has(ref)) out.push({ trigger: m.trigger, severity: m.severity, consequence: m.consequence, toolId: ref })
    if (kind === 'remove_before' && !removed.has(ref)) out.push({ trigger: m.trigger, severity: m.severity, consequence: m.consequence, partId: ref })
  }
  return out
}

// ───────────────────────── P6：故障情境 ─────────────────────────
/**
 * 情境成績：問診與判斷「第一次就答對」的比例。拆裝過程犯的錯不扣分（錯誤示範本來就鼓勵試），
 * 但會在結果畫面另外列出次數。
 */
export function scenarioPct(firstTry: boolean[]): number {
  if (!firstTry.length) return 0
  return Math.round((firstTry.filter(Boolean).length / firstTry.length) * 100)
}

export function recordScenario(p: Progress, id: string, pct: number): Progress {
  const best = p.scenarioBest[id]
  return best != null && best >= pct ? p : { ...p, scenarioBest: { ...p.scenarioBest, [id]: pct } }
}
