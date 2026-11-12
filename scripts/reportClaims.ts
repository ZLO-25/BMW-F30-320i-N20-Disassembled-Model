/**
 * npm run report:claims — 把散文（explain / warnings / notes / 保養說明 / 情境說明）裡
 * 標了「待查證」或「unverified」的句子列成清單，輸出 docs/CLAIMS_REPORT.md。
 *
 * 為什麼需要它（審查 H5）：數字有 confidence 欄位、validate 擋得住；
 * 但「正時鏈在後方」這種錯誤是藏在句子裡的，沒有欄位管它。這份清單就是散文版的待辦。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PartFile, MaintenanceFile, ScenarioFile, ProcedureFile, type Bilingual } from '../src/core/schema'

const root = join(import.meta.dirname, '..')
const read = (dir: string) => readdirSync(join(root, 'data', dir)).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(root, 'data', dir, f), 'utf-8')))

type Row = { id: string; field: string; zh: string }
const rows: Row[] = []
const MARK = /待查證|unverified|示意/
const push = (id: string, field: string, b: Bilingual | null | undefined) => {
  if (!b) return
  // 只列出含標記的句子（用中文句號切）
  for (const sentence of b.zh.split(/(?<=[。；])/)) if (MARK.test(sentence)) rows.push({ id, field, zh: sentence.trim() })
}

for (const file of read('parts')) for (const p of PartFile.parse(file)) {
  push(p.id, 'explain.specific', p.explain.specific)
  p.removal.warnings.forEach((w, i) => push(p.id, `warning[${i}]`, w))
  p.specs.forEach(s => push(p.id, `spec:${s.key}.note`, s.note))
}
for (const file of read('maintenance')) for (const m of MaintenanceFile.parse(file)) {
  push(m.id, 'f30Method', m.f30Method)
  m.warnings.forEach((w, i) => push(m.id, `warning[${i}]`, w))
  push(m.id, 'interval.oem.text', m.interval.oem.text)
  push(m.id, 'interval.taiwanConservative.text', m.interval.taiwanConservative.text)
}
for (const file of read('scenarios')) for (const s of ScenarioFile.parse(file)) {
  push(s.id, 'replaceNote', s.replaceNote); push(s.id, 'reassembleNote', s.reassembleNote)
}
for (const file of read('procedures')) for (const p of ProcedureFile.parse(file)) {
  p.steps.forEach((st, i) => { push(p.id, `step[${i + 1}].note`, st.note); push(p.id, `step[${i + 1}].warning`, st.warning) })
}

const lines = [
  '# 散文待查證清單（自動產生）', '',
  `產生時間：${new Date().toISOString().slice(0, 10)}　共 ${rows.length} 句`, '',
  '這些句子不是數字，所以沒有 confidence 欄位；它們是寫在說明文字裡、作者自己標了「待查證」或「示意」的陳述。查到來源後：改句子、把來源登記進 `data/sources.json`、把這裡的標記拿掉。', '',
  '| 零件 / 項目 | 欄位 | 句子 |', '|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.field} | ${r.zh.replace(/\|/g, '｜')} |`),
]
writeFileSync(join(root, 'docs', 'CLAIMS_REPORT.md'), lines.join('\n') + '\n')
console.log(`散文待查證：${rows.length} 句 → docs/CLAIMS_REPORT.md`)
