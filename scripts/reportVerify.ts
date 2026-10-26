/**
 * npm run report:verify — 統計所有數值的可信度，輸出 docs/VERIFY_REPORT.md。
 * 「待查證」比例是 P7 的驗收項目之一，從 P1 就開始追蹤。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PartFile, MaintenanceFile, type Part, type Confidence } from '../src/core/schema'

const root = join(import.meta.dirname, '..')
const parts: Part[] = []
for (const f of readdirSync(join(root, 'data', 'parts')).filter(f => f.endsWith('.json'))) {
  parts.push(...PartFile.parse(JSON.parse(readFileSync(join(root, 'data', 'parts', f), 'utf-8'))))
}

type Row = { part: string; field: string; confidence: Confidence }
const rows: Row[] = []
for (const p of parts) {
  for (const s of p.specs) rows.push({ part: p.id, field: `spec:${s.key}`, confidence: s.confidence })
  for (const f of p.removal.fasteners) rows.push({ part: p.id, field: `torque:${f.desc}`, confidence: f.confidence })
  for (const pn of p.partNumbers) rows.push({ part: p.id, field: 'partNumber', confidence: pn.confidence })
}
// P6：保養週期（原廠 / 台灣保守）與耗材規格也算進來
const mntDir = join(root, 'data', 'maintenance')
for (const f of readdirSync(mntDir).filter(f => f.endsWith('.json'))) {
  for (const m of MaintenanceFile.parse(JSON.parse(readFileSync(join(mntDir, f), 'utf-8')))) {
    rows.push({ part: m.id, field: 'interval:oem', confidence: m.interval.oem.confidence })
    rows.push({ part: m.id, field: 'interval:taiwanConservative', confidence: m.interval.taiwanConservative.confidence })
    for (const c of m.consumables) rows.push({ part: m.id, field: `consumable:${c.name.en}`, confidence: c.confidence })
  }
}
const count = (c: Confidence) => rows.filter(r => r.confidence === c).length
const total = rows.length || 1
const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`

const lines = [
  `# 資料查證報表（自動產生）`, ``,
  `產生時間：${new Date().toISOString().slice(0, 10)}`, ``,
  `| 可信度 | 數量 | 比例 |`, `|---|---|---|`,
  `| verified（原廠） | ${count('verified')} | ${pct(count('verified'))} |`,
  `| community（社群/維修網站） | ${count('community')} | ${pct(count('community'))} |`,
  `| unverified（待查證） | ${count('unverified')} | ${pct(count('unverified'))} |`,
  `| 合計 | ${rows.length} | 100% |`, ``,
  `## 待查證清單`, ``,
  `| 零件 / 保養項目 | 欄位 |`, `|---|---|`,
  ...rows.filter(r => r.confidence === 'unverified').map(r => `| ${r.part} | ${r.field} |`),
]
writeFileSync(join(root, 'docs', 'VERIFY_REPORT.md'), lines.join('\n') + '\n')
console.log(lines.slice(0, 11).join('\n'))
console.log('\n→ docs/VERIFY_REPORT.md')
