/**
 * 零件樹（parent）與相依圖（requires）的純邏輯。不 import React / three。
 */
import type { Part, TransmissionVariant } from './schema'

export type Variant = Exclude<TransmissionVariant, 'both'>

export interface PartGraph {
  byId: Map<string, Part>
  children: Map<string, Part[]>
  roots: Part[]
  /** 這張圖是哪個變速箱變體的世界；undefined = 全部零件都在（驗證用） */
  variant?: Variant
}

/** 某零件在某變體世界裡「必須先拆」的完整清單 = requires + requiresVariant[v]（沒指定變體時取兩邊聯集） */
export function requiresOf(p: Part, v?: Variant): string[] {
  const rv = p.removal.requiresVariant
  const extra = v ? rv[v] : [...rv.manual, ...rv.auto]
  return [...new Set([...p.removal.requires, ...extra])]
}

/**
 * 建圖。給 variant 時只留該變體存在的零件，並把 requiresVariant 併進 requires，
 * 之後拆裝邏輯只看 p.removal.requires 就好。
 */
export function buildGraph(allParts: Part[], variant?: Variant): PartGraph {
  const parts = allParts
    .filter(p => !variant || existsInVariant(p, variant))
    .map(p => ({ ...p, removal: { ...p.removal, requires: requiresOf(p, variant) } }))
  const byId = new Map<string, Part>()
  const children = new Map<string, Part[]>()
  for (const p of parts) byId.set(p.id, p)
  const roots: Part[] = []
  for (const p of parts) {
    if (p.parent === null) { roots.push(p); continue }
    if (!children.has(p.parent)) children.set(p.parent, [])
    children.get(p.parent)!.push(p)
  }
  return { byId, children, roots, variant }
}

/** 零件是否存在於某個變速箱變體的世界裡 */
export function existsInVariant(p: Part, v: Exclude<TransmissionVariant, 'both'>): boolean {
  return p.transmissionVariant === 'both' || p.transmissionVariant === v
}

/** 取得某零件的所有子孫（不含自己） */
export function descendants(g: PartGraph, id: string): Part[] {
  const out: Part[] = []
  const stack = [...(g.children.get(id) ?? [])]
  while (stack.length) {
    const p = stack.pop()!
    out.push(p)
    stack.push(...(g.children.get(p.id) ?? []))
  }
  return out
}

/** 從根到該零件的路徑 id（含自己） */
export function ancestorsPath(g: PartGraph, id: string): string[] {
  const path: string[] = []
  let cur: Part | undefined = g.byId.get(id)
  while (cur) {
    path.unshift(cur.id)
    cur = cur.parent ? g.byId.get(cur.parent) : undefined
  }
  return path
}

export interface GraphIssue { partId: string; message: string }

/** 偵測有向圖是否有環，回傳第一個找到的環 */
function findCycle(ids: string[], edges: (id: string) => string[]): string[] | null {
  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string>()
  for (const id of ids) color.set(id, WHITE)
  for (const start of ids) {
    if (color.get(start) !== WHITE) continue
    const stack: Array<[string, number]> = [[start, 0]]
    color.set(start, GREY)
    while (stack.length) {
      const top = stack[stack.length - 1]
      const [node, i] = top
      const nbrs = edges(node)
      if (i < nbrs.length) {
        top[1] = i + 1
        const n = nbrs[i]
        if (!color.has(n)) continue
        if (color.get(n) === WHITE) { color.set(n, GREY); parent.set(n, node); stack.push([n, 0]) }
        else if (color.get(n) === GREY) {
          const cyc = [n]; let c = node
          while (c !== n) { cyc.push(c); c = parent.get(c)! }
          cyc.push(n)
          return cyc.reverse()
        }
      } else { color.set(node, BLACK); stack.pop() }
    }
  }
  return null
}

/** 驗證規則（對應 docs/DATA_SCHEMA.md「驗證規則」） */
export function validateGraph(parts: Part[], toolIds: Set<string> = new Set()): GraphIssue[] {
  const issues: GraphIssue[] = []
  const g = buildGraph(parts)
  const seen = new Set<string>()
  for (const p of parts) {
    if (seen.has(p.id)) issues.push({ partId: p.id, message: 'id 重複' })
    seen.add(p.id)
  }
  for (const p of parts) {
    if (p.parent !== null && !g.byId.has(p.parent)) issues.push({ partId: p.id, message: `parent 不存在：${p.parent}` })
    if (p.parent === null && p.level !== 0) issues.push({ partId: p.id, message: 'parent 為 null 但 level 不是 0' })
    // level 是「語意層級」（總成/次總成/零件），不等於樹的深度，但子件不可比父件更上層
    const lp = p.parent ? g.byId.get(p.parent) : undefined
    if (lp && p.level < lp.level) issues.push({ partId: p.id, message: `level ${p.level} 比父件 ${lp.id}（${lp.level}）還上層` })
    for (const r of requiresOf(p)) {
      if (!g.byId.has(r)) issues.push({ partId: p.id, message: `requires 不存在：${r}` })
      if (r === p.id) issues.push({ partId: p.id, message: 'requires 自己' })
      // requires 祖先 = 永遠拆不下來（要先拆掉自己的父件，但父件一拆自己就跟著走了）
      if (r !== p.id && ancestorsPath(g, p.id).includes(r)) issues.push({ partId: p.id, message: `requires 自己的祖先 ${r}，會永遠拆不下來` })
      const rp = g.byId.get(r)
      if (rp && !rp.removable) issues.push({ partId: p.id, message: `requires 的 ${r} 是不能拆的結構件` })
    }
    for (const t of p.removal.tools) {
      if (t.startsWith('tool.') && !toolIds.has(t)) issues.push({ partId: p.id, message: `工具不存在於 tools.json：${t}` })
    }
    // 子件變體必須落在父件範圍內
    if (p.parent) {
      const par = g.byId.get(p.parent)
      if (par && par.transmissionVariant !== 'both' && p.transmissionVariant !== par.transmissionVariant) {
        issues.push({ partId: p.id, message: `變體 ${p.transmissionVariant} 不在父件 ${par.id}（${par.transmissionVariant}）範圍內` })
      }
    }
  }
  const ids = parts.map(p => p.id)
  const parentCycle = findCycle(ids, id => { const par = g.byId.get(id)?.parent; return par ? [par] : [] })
  if (parentCycle) issues.push({ partId: parentCycle[0], message: `parent 成環：${parentCycle.join(' → ')}` })
  const reqCycle = findCycle(ids, id => { const p = g.byId.get(id); return p ? requiresOf(p) : [] })
  if (reqCycle) issues.push({ partId: reqCycle[0], message: `requires 成環：${reqCycle.join(' → ')}` })

  // 依變體各檢查一次：手排模式下，手排零件 requires 的每個零件都必須在手排模式存在
  for (const v of ['manual', 'auto'] as const) {
    for (const p of parts) {
      if (!existsInVariant(p, v)) continue
      for (const r of requiresOf(p, v)) {
        const rp = g.byId.get(r)
        if (rp && !existsInVariant(rp, v)) issues.push({ partId: p.id, message: `在 ${v} 模式下 requires 的 ${r} 不存在，會永遠拆不下來` })
      }
      // requiresVariant 只能指向「只在那個變體存在」的零件，否則應該寫在 requires
      for (const r of p.removal.requiresVariant[v]) {
        const rp = g.byId.get(r)
        if (rp && rp.transmissionVariant === 'both') issues.push({ partId: p.id, message: `requiresVariant.${v} 的 ${r} 兩種變體都有，應改寫在 requires` })
      }
    }
  }
  return issues
}

/** 零件樹用：依名稱 / id / tags 搜尋，回傳符合的 id 以及它們的祖先（讓樹能展開到它） */
export function searchParts(g: PartGraph, query: string): { matches: Set<string>; expand: Set<string> } {
  const q = query.trim().toLowerCase()
  const matches = new Set<string>()
  const expand = new Set<string>()
  if (!q) return { matches, expand }
  for (const p of g.byId.values()) {
    const hay = [p.id, p.name.zh, p.name.en, p.subsystem, ...p.tags].join(' ').toLowerCase()
    if (hay.includes(q)) {
      matches.add(p.id)
      for (const a of ancestorsPath(g, p.id)) expand.add(a)
    }
  }
  return { matches, expand }
}

/** 零件在整車座標系的位置（把每一層 parent 的 position 加起來；旋轉忽略，鏡頭對準夠用） */
export function worldPosition(g: PartGraph, id: string): [number, number, number] | null {
  const p = g.byId.get(id)
  if (!p) return null
  let x = p.position.x, y = p.position.y, z = p.position.z
  let cur = p.parent ? g.byId.get(p.parent) : undefined
  while (cur) { x += cur.position.x; y += cur.position.y; z += cur.position.z; cur = cur.parent ? g.byId.get(cur.parent) : undefined }
  return [x, y, z]
}
