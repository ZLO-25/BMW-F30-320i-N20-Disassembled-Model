/**
 * 拆裝邏輯（純 TS，不 import React / three）。對應 docs/PLAN.md「拆裝的三條規則」：
 *
 *   規則 1：拆一個零件，裝在它上面的子件一起走（一起走的整包叫一個「單元」）
 *   規則 2：requires 是例外清單，列出的零件必須先單獨拆掉；
 *           單元裡其他成員若 requires 單元「外面」的零件，也要先拆（外面接進來的東西要先斷開）
 *   規則 3：裝回順序 = 拆下的反順序。想裝 A，但被 A 擋住的東西還在托盤 → 先裝那個
 *
 * 狀態只有一個：依拆下順序排好的單元陣列（托盤就是它）。所有函式都回傳新物件，不改舊的。
 */
import type { PartGraph } from './partGraph'

/** 托盤上的一包：root 是使用者點的零件，members 是一起下來的（含 root） */
export interface TrayUnit {
  root: string
  members: string[]
  /** 拆這包時必須先拆掉的零件（規則 2 算出來的），裝回時用來判斷「擋住誰」 */
  req: string[]
}

export interface TeardownState { units: TrayUnit[] }

export const emptyTeardown = (): TeardownState => ({ units: [] })

export function removedSet(s: TeardownState): Set<string> {
  const out = new Set<string>()
  for (const u of s.units) for (const m of u.members) out.add(m)
  return out
}

/** 某零件所在的托盤單元（找不到 = 還裝在車上） */
export function unitOf(s: TeardownState, id: string): TrayUnit | undefined {
  return s.units.find(u => u.members.includes(id))
}

export type RemoveCheck =
  | { ok: true; unit: TrayUnit }
  | { ok: false; reason: 'fixed' | 'already' | 'unknown' }
  | { ok: false; reason: 'blocked'; blockers: string[] }

/** 規則 1：從 id 往下收集還裝著、而且會跟著父件走的子件 */
function collectUnit(g: PartGraph, removed: Set<string>, id: string): { members: string[]; stuck: string[] } {
  const members: string[] = []
  const stuck: string[] = []          // 不跟父件走（detachesWithParent=false）而且還裝著的子件
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    members.push(cur)
    for (const c of g.children.get(cur) ?? []) {
      if (removed.has(c.id)) continue
      if (!c.detachesWithParent) { stuck.push(c.id); continue }
      stack.push(c.id)
    }
  }
  return { members, stuck }
}

export function checkRemove(g: PartGraph, s: TeardownState, id: string): RemoveCheck {
  const part = g.byId.get(id)
  if (!part) return { ok: false, reason: 'unknown' }
  if (!part.removable) return { ok: false, reason: 'fixed' }
  const removed = removedSet(s)
  if (removed.has(id)) return { ok: false, reason: 'already' }

  const { members, stuck } = collectUnit(g, removed, id)
  const inUnit = new Set(members)
  const req = new Set<string>()
  // 規則 2：root 自己的 requires 一律要先拆（就算那個零件是自己的子件）
  for (const r of part.removal.requires) req.add(r)
  // 規則 2 延伸：其他成員 requires 單元外面的零件，也要先拆
  for (const m of members) {
    if (m === id) continue
    for (const r of g.byId.get(m)!.removal.requires) if (!inUnit.has(r)) req.add(r)
  }
  for (const c of stuck) req.add(c)

  const blockers = [...req].filter(r => !removed.has(r))
  if (blockers.length) return { ok: false, reason: 'blocked', blockers }
  return { ok: true, unit: { root: id, members, req: [...req] } }
}

export type InstallCheck =
  | { ok: true }
  | { ok: false; reason: 'not_in_tray' }
  | { ok: false; reason: 'blocked'; blockers: string[] }   // blockers = 要先裝回的托盤單元 root

export function checkInstall(g: PartGraph, s: TeardownState, root: string): InstallCheck {
  const unit = s.units.find(u => u.root === root)
  if (!unit) return { ok: false, reason: 'not_in_tray' }
  const blockers = new Set<string>()
  // 父件還在托盤 → 先裝父件（回報父件所在那包的 root，因為托盤上只能點 root）
  const parent = g.byId.get(root)?.parent
  if (parent) {
    const pu = unitOf(s, parent)
    if (pu) blockers.add(pu.root)
  }
  // 規則 3：被這包擋住的單元還在托盤 → 先裝那個
  const mine = new Set(unit.members)
  for (const other of s.units) {
    if (other === unit) continue
    if (other.req.some(r => mine.has(r))) blockers.add(other.root)
  }
  if (blockers.size) return { ok: false, reason: 'blocked', blockers: [...blockers] }
  return { ok: true }
}

export const applyRemove = (s: TeardownState, unit: TrayUnit): TeardownState => ({ units: [...s.units, unit] })

export function applyInstall(s: TeardownState, root: string): { state: TeardownState; unit: TrayUnit; index: number } | null {
  const index = s.units.findIndex(u => u.root === root)
  if (index < 0) return null
  const unit = s.units[index]
  return { state: { units: s.units.filter((_, i) => i !== index) }, unit, index }
}

/** 復原「裝回」用：把單元放回原本在托盤的位置 */
export function reinsertUnit(s: TeardownState, unit: TrayUnit, index: number): TeardownState {
  const units = [...s.units]
  units.splice(Math.min(index, units.length), 0, unit)
  return { units }
}

/** 復原 / 重做的紀錄 */
export type HistoryEntry =
  | { kind: 'remove'; unit: TrayUnit }
  | { kind: 'install'; unit: TrayUnit; index: number }

/** 復原：一定成功（回到上一步的狀態，不用再檢查規則） */
export function undoEntry(s: TeardownState, h: HistoryEntry): TeardownState {
  if (h.kind === 'remove') return { units: s.units.filter(u => u.root !== h.unit.root) }
  return reinsertUnit(s, h.unit, h.index)
}

/** 重做：照原動作再做一次 */
export function redoEntry(s: TeardownState, h: HistoryEntry): TeardownState {
  if (h.kind === 'remove') return applyRemove(s, h.unit)
  return { units: s.units.filter(u => u.root !== h.unit.root) }
}

/**
 * 測試與驗證用：從全車裝好的狀態開始，每一輪拆掉「現在能拆」的零件，
 * 直到所有可拆的零件都拆下來（或卡住）。回傳拆下順序與卡住的零件。
 * onlyIds 有給時只試著拆這些（其他照常可以當作被一起帶走）。
 */
export function greedyTeardown(g: PartGraph, onlyIds?: Set<string>): { state: TeardownState; order: string[]; stuck: string[] } {
  let s = emptyTeardown()
  const order: string[] = []
  const candidates = [...g.byId.values()].filter(p => p.removable && (!onlyIds || onlyIds.has(p.id)))
  // 由「葉子」往上試：先拆深的，這樣每個零件都會單獨出現在托盤上
  const depth = (id: string) => { let d = 0, c = g.byId.get(id); while (c?.parent) { d++; c = g.byId.get(c.parent) } return d }
  candidates.sort((a, b) => depth(b.id) - depth(a.id))
  // 先只拆「單獨一個」的（子件都已經拆掉了），真的拆不動才允許整包帶走
  for (let progress = true; progress;) {
    progress = false
    for (const singleOnly of [true, false]) {
      for (const p of candidates) {
        const r = checkRemove(g, s, p.id)
        if (r.ok && (!singleOnly || r.unit.members.length === 1)) { s = applyRemove(s, r.unit); order.push(p.id); progress = true }
      }
      if (progress) break
    }
  }
  const removed = removedSet(s)
  const stuck = candidates.filter(p => !removed.has(p.id)).map(p => p.id)
  return { state: s, order, stuck }
}

/** 測試用：把托盤裡的東西全部裝回（每輪裝回現在能裝的） */
export function greedyReinstall(g: PartGraph, start: TeardownState): { state: TeardownState; order: string[] } {
  let s = start
  const order: string[] = []
  for (let progress = true; progress && s.units.length;) {
    progress = false
    for (const u of [...s.units].reverse()) {
      if (checkInstall(g, s, u.root).ok) {
        s = applyInstall(s, u.root)!.state
        order.push(u.root)
        progress = true
      }
    }
  }
  return { state: s, order }
}

/**
 * P6 情境任務的「提示」：為了拆下 target，現在「下一個」該拆誰？
 * 從 target 往回找擋住它的零件，一路找到第一個現在就拆得下來的。拆不到（不存在、不可拆）回傳 null。
 */
export function nextRemovalStep(g: PartGraph, s: TeardownState, target: string, seen: Set<string> = new Set()): string | null {
  if (removedSet(s).has(target)) return null
  const r = checkRemove(g, s, target)
  if (r.ok) return target
  if (r.reason !== 'blocked') return null
  for (const b of r.blockers) {
    if (seen.has(b)) continue
    seen.add(b)
    const n = nextRemovalStep(g, s, b, seen)
    if (n) return n
  }
  return null
}

/** 從目前狀態開始，要把 targets 全部拆下的完整順序（模擬，不改 s）。拆不完時 stuck 會列出拆不到的 target。 */
export function removalPlan(g: PartGraph, s: TeardownState, targets: string[]): { order: string[]; stuck: string[] } {
  let cur = s
  const order: string[] = []
  for (let guard = 0; guard < 1000; guard++) {
    const removed = removedSet(cur)
    const left = targets.filter(t => !removed.has(t))
    if (!left.length) return { order, stuck: [] }
    let step: string | null = null
    for (const t of left) { step = nextRemovalStep(g, cur, t); if (step) break }
    if (!step) return { order, stuck: left }
    const r = checkRemove(g, cur, step)
    if (!r.ok) return { order, stuck: left }
    cur = applyRemove(cur, r.unit)
    order.push(step)
  }
  return { order, stuck: targets.filter(t => !removedSet(cur).has(t)) }
}
