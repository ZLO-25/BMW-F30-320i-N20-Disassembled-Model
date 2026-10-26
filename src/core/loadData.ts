/**
 * 在瀏覽器裡載入 data/ 的 JSON，並用 Zod 驗證。
 * 之後各系統會分包延遲載入，P1 先全部 eager。
 */
import { PartFile, ToolFile, SourceFile, ProcedureFile, QuizFile, LevelFile, MaintenanceFile, ScenarioFile, type Part, type Tool, type Source, type Procedure, type Quiz, type Level, type Maintenance, type Scenario } from './schema'
import { buildGraph, validateGraph, type PartGraph, type GraphIssue, type Variant } from './partGraph'

const partModules = import.meta.glob('../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const procModules = import.meta.glob('../../data/procedures/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const quizModules = import.meta.glob('../../data/quizzes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const maintModules = import.meta.glob('../../data/maintenance/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const scnModules = import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
import toolsJson from '../../data/tools.json'
import levelsJson from '../../data/levels.json'
import sourcesJson from '../../data/sources.json'

export interface DataBundle {
  /** 全部零件（兩種變體都在） */
  parts: Part[]
  /** 目前變體的圖：只有該變體存在的零件，requiresVariant 已併入 requires */
  graph: PartGraph
  variant: Variant
  tools: Map<string, Tool>
  sources: Map<string, Source>
  issues: GraphIssue[]
  /** P5：導覽程序、測驗題、學習路徑（都含兩種變體；介面自己過濾） */
  procedures: Procedure[]
  quizzes: Quiz[]
  levels: Level[]
  /** P6：保養項目、故障情境（都含兩種變體；介面自己過濾） */
  maintenance: Maintenance[]
  scenarios: Scenario[]
}

const cached = new Map<Variant, DataBundle>()
let base: Omit<DataBundle, 'graph' | 'variant'> | null = null

/** 載入資料（只做一次），並依變速箱變體建圖（每個變體各快取一份） */
export function loadData(variant: Variant = 'auto'): DataBundle {
  const hit = cached.get(variant)
  if (hit) return hit
  if (base) {
    const b: DataBundle = { ...base, graph: buildGraph(base.parts, variant), variant }
    cached.set(variant, b)
    return b
  }
  const parts: Part[] = []
  for (const [file, raw] of Object.entries(partModules)) {
    const res = PartFile.safeParse(raw)
    if (!res.success) {
      console.error(`[data] ${file} 格式錯誤`, res.error.issues)
      continue
    }
    parts.push(...res.data)
  }
  // 零件樹的順序：整車 → 車身 → 引擎 → 變速箱 → 傳動 → 排氣 → 底盤 → 煞車 → 轉向 → 電系（檔名順序不可靠）
  const ORDER = ['car', 'body', 'engine', 'transmission', 'driveline', 'exhaust', 'chassis', 'brakes', 'steering', 'electrical']
  parts.sort((a, b) => ORDER.indexOf(a.system) - ORDER.indexOf(b.system))
  const tools = ToolFile.parse(toolsJson)
  const sources = SourceFile.parse(sourcesJson)
  const procedures = Object.values(procModules).flatMap(m => ProcedureFile.parse(m))
  const quizzes = Object.values(quizModules).flatMap(m => QuizFile.parse(m))
  const levels = LevelFile.parse(levelsJson)
  const maintenance = Object.values(maintModules).flatMap(m => MaintenanceFile.parse(m))
  const scenarios = Object.values(scnModules).flatMap(m => ScenarioFile.parse(m))
  const toolIds = new Set(tools.map(t => t.id))
  const issues = validateGraph(parts, toolIds)
  if (issues.length) console.warn('[data] 相依圖問題', issues)
  base = {
    parts,
    tools: new Map(tools.map(t => [t.id, t])),
    sources: new Map(sources.map(s => [s.id, s])),
    procedures, quizzes, levels, maintenance, scenarios,
    issues,
  }
  return loadData(variant)
}
