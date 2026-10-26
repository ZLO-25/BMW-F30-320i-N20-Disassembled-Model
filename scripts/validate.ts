/**
 * npm run validate — 檢查 data/ 下所有 JSON 的格式與相依圖。
 * 有錯誤就以非 0 結束，CI 或建置前可以擋下壞資料。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PartFile, ToolFile, SourceFile, ProcedureFile, QuizFile, LevelFile, MaintenanceFile, ScenarioFile, type Part } from '../src/core/schema'
import { validateGraph } from '../src/core/partGraph'

const root = join(import.meta.dirname, '..', 'data')
let errors = 0
const fail = (msg: string) => { errors++; console.error('✗', msg) }

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8'))

const tools = ToolFile.safeParse(readJson(join(root, 'tools.json')))
if (!tools.success) fail(`tools.json: ${tools.error.message}`)
const sources = SourceFile.safeParse(readJson(join(root, 'sources.json')))
if (!sources.success) fail(`sources.json: ${sources.error.message}`)
const sourceIds = new Set((sources.success ? sources.data : []).map(s => s.id))

const parts: Part[] = []
for (const f of readdirSync(join(root, 'parts')).filter(f => f.endsWith('.json'))) {
  const res = PartFile.safeParse(readJson(join(root, 'parts', f)))
  if (!res.success) {
    for (const i of res.error.issues) fail(`parts/${f} ${i.path.join('.')}: ${i.message}`)
    continue
  }
  parts.push(...res.data)
}

// 來源 id 必須存在（允許直接寫網址）
const checkSource = (ctx: string, s: string | null) => {
  if (s && !s.startsWith('http') && !sourceIds.has(s)) fail(`${ctx}: source "${s}" 不在 sources.json`)
}
for (const p of parts) {
  for (const s of p.specs) checkSource(`${p.id}.specs.${s.key}`, s.source)
  for (const f of p.removal.fasteners) checkSource(`${p.id}.fasteners "${f.desc}"`, f.source)
  for (const pn of p.partNumbers) checkSource(`${p.id}.partNumbers`, pn.source)
}

const toolIds = new Set((tools.success ? tools.data : []).map(t => t.id))
for (const i of validateGraph(parts, toolIds)) fail(`${i.partId}: ${i.message}`)

// ── P5：導覽、測驗、學習路徑的引用都必須存在 ──
const partIds = new Set(parts.map(p => p.id))
const readDir = (dir: string) => readdirSync(join(root, dir)).filter(f => f.endsWith('.json')).map(f => [f, readJson(join(root, dir, f))] as const)
let nProc = 0, nQuiz = 0
const procIds = new Set<string>()
for (const [f, raw] of readDir('procedures')) {
  const res = ProcedureFile.safeParse(raw)
  if (!res.success) { for (const i of res.error.issues) fail(`procedures/${f} ${i.path.join('.')}: ${i.message}`); continue }
  for (const pr of res.data) {
    nProc++; procIds.add(pr.id)
    pr.steps.forEach((st, i) => {
      if ((st.action === 'remove' || st.action === 'install') && !st.part) fail(`${pr.id} 步驟 ${i + 1}：remove/install 一定要指定 part`)
      if (st.part && !partIds.has(st.part)) fail(`${pr.id} 步驟 ${i + 1}：零件 ${st.part} 不存在`)
      for (const t of st.tools) if (t.startsWith('tool.') && !toolIds.has(t)) fail(`${pr.id} 步驟 ${i + 1}：工具 ${t} 不存在`)
      if (st.torque) { checkSource(`${pr.id} 步驟 ${i + 1} torque`, st.torque.source); if (st.torque.confidence === 'unverified' && st.torque.value !== null) fail(`${pr.id} 步驟 ${i + 1}：待查證的扭力不准填數值`) }
    })
  }
}
const quizLevels = new Map<number, number>()
for (const [f, raw] of readDir('quizzes')) {
  const res = QuizFile.safeParse(raw)
  if (!res.success) { for (const i of res.error.issues) fail(`quizzes/${f} ${i.path.join('.')}: ${i.message}`); continue }
  for (const q of res.data) {
    nQuiz++; quizLevels.set(q.level, (quizLevels.get(q.level) ?? 0) + 1)
    if (q.type === 'identify' && !q.part) fail(`${q.id}：identify 題要指定 part`)
    if (q.part && !partIds.has(q.part)) fail(`${q.id}：零件 ${q.part} 不存在`)
    if (q.type === 'order') {
      const a = q.answer
      if (!Array.isArray(a) || a.length !== q.options.length || [...a].sort().join() !== q.options.map((_, i) => i).join()) fail(`${q.id}：order 題的 answer 必須是 options 索引的排列`)
    } else if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) fail(`${q.id}：answer 超出 options 範圍`)
  }
}
const levels = LevelFile.safeParse(readJson(join(root, 'levels.json')))
if (!levels.success) fail(`levels.json: ${levels.error.message}`)
else {
  if (levels.data.map(l => l.id).join() !== '1,2,3,4,5') fail('levels.json 必須剛好是 1–5 五級')
  for (const l of levels.data) {
    if (!quizLevels.get(l.id)) fail(`Lv${l.id} 沒有任何題目，解鎖條件會永遠達不到`)
    for (const g of l.goals) {
      if (g.kind === 'procedure' && g.ref && !procIds.has(g.ref)) fail(`Lv${l.id}：導覽 ${g.ref} 不存在`)
      if (g.kind === 'look' && g.ref && g.ref !== 'body' && !partIds.has(g.ref)) fail(`Lv${l.id}：零件 ${g.ref} 不存在`)
    }
  }
}

// ── P6：保養、故障情境、題數 ──
const partById = new Map(parts.map(p => [p.id, p]))
const procById = new Map<string, string>()   // proc id → transmissionVariant
for (const [, raw] of readDir('procedures')) { const r = ProcedureFile.safeParse(raw); if (r.success) for (const pr of r.data) procById.set(pr.id, pr.transmissionVariant) }
const variantOk = (itemV: string, refV: string | undefined) => !refV || refV === 'both' || refV === itemV
let nMnt = 0, nScn = 0
const mntPerVariant = { manual: 0, auto: 0 }, scnPerVariant = { manual: 0, auto: 0 }
for (const [f, raw] of readDir('maintenance')) {
  const res = MaintenanceFile.safeParse(raw)
  if (!res.success) { for (const i of res.error.issues) fail(`maintenance/${f} ${i.path.join('.')}: ${i.message}`); continue }
  for (const m of res.data) {
    nMnt++
    for (const v of ['manual', 'auto'] as const) if (m.transmissionVariant === 'both' || m.transmissionVariant === v) mntPerVariant[v]++
    checkSource(`${m.id}.interval.oem`, m.interval.oem.source); checkSource(`${m.id}.interval.taiwanConservative`, m.interval.taiwanConservative.source)
    for (const c of m.consumables) checkSource(`${m.id}.consumables`, c.source)
    for (const t of m.tools) if (!toolIds.has(t)) fail(`${m.id}：工具 ${t} 不存在`)
    if (m.focusPart) { const p = partById.get(m.focusPart); if (!p) fail(`${m.id}：focusPart ${m.focusPart} 不存在`); else if (!variantOk(m.transmissionVariant, p.transmissionVariant) && m.transmissionVariant !== 'both') fail(`${m.id}：focusPart 變體不符`) }
    if (m.procedure) { if (!procById.has(m.procedure)) fail(`${m.id}：導覽 ${m.procedure} 不存在`); else if (m.transmissionVariant === 'both' && procById.get(m.procedure) !== 'both') fail(`${m.id}：兩種變體都看得到，但導覽只限一種`) }
  }
}
for (const [f, raw] of readDir('scenarios')) {
  const res = ScenarioFile.safeParse(raw)
  if (!res.success) { for (const i of res.error.issues) fail(`scenarios/${f} ${i.path.join('.')}: ${i.message}`); continue }
  for (const s of res.data) {
    nScn++
    for (const v of ['manual', 'auto'] as const) if (s.transmissionVariant === 'both' || s.transmissionVariant === v) scnPerVariant[v]++
    for (const src of s.sources) checkSource(`${s.id}.sources`, src)
    for (const c of [...s.questions, s.cause]) if (c.answer < 0 || c.answer >= c.options.length) fail(`${s.id}：answer 超出 options 範圍`)
    for (const r of s.replace) {
      const p = partById.get(r)
      if (!p) fail(`${s.id}：要換的零件 ${r} 不存在`)
      else if (s.transmissionVariant === 'both' && p.transmissionVariant !== 'both') fail(`${s.id}：兩種變體都看得到，但 ${r} 只存在一種`)
      else if (!p.removable) fail(`${s.id}：${r} 不能拆`)
    }
  }
}
// PLAN P6 驗收：至少 5 個情境、50 題、14 項保養（每一種變速箱看到的數量都要達標）
if (nQuiz < 50) fail(`測驗只有 ${nQuiz} 題，P6 要求至少 50 題`)
for (const v of ['manual', 'auto'] as const) {
  if (mntPerVariant[v] < 14) fail(`${v} 只看得到 ${mntPerVariant[v]} 項保養，P6 要求 14 項`)
  if (scnPerVariant[v] < 5) fail(`${v} 只有 ${scnPerVariant[v]} 個情境，P6 要求至少 5 個`)
}
for (const l of (levels.success ? levels.data : [])) for (const g of l.goals) if (g.kind === 'scenario' && g.ref && !res_has_scn(g.ref)) fail(`Lv${l.id}：情境 ${g.ref} 不存在`)
function res_has_scn(id: string) { for (const [, raw] of readDir('scenarios')) { const r = ScenarioFile.safeParse(raw); if (r.success && r.data.some(s => s.id === id)) return true } return false }

console.log(`檢查了 ${parts.length} 個零件、${toolIds.size} 個工具、${sourceIds.size} 個來源、${nProc} 個導覽、${nQuiz} 題測驗、${nMnt} 項保養（手排 ${mntPerVariant.manual} / 自排 ${mntPerVariant.auto}）、${nScn} 個情境（手排 ${scnPerVariant.manual} / 自排 ${scnPerVariant.auto}）`)
if (errors) { console.error(`\n${errors} 個錯誤`); process.exit(1) }
console.log('✓ 資料全部通過')
