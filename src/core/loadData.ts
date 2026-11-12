/**
 * 在瀏覽器裡載入 data/ 的 JSON，並用 Zod 驗證。
 * 之後各系統會分包延遲載入，P1 先全部 eager。
 */
import { PartFile, ToolFile, SourceFile, type Part, type Tool, type Source } from './schema'
import type { LearnData } from './learnData'
import { buildGraph, validateGraph, type PartGraph, type GraphIssue, type Variant } from './partGraph'

const partModules = import.meta.glob('../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
import toolsJson from '../../data/tools.json'
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
}

/** E3：教學資料（導覽、題庫、學習路徑、保養、情境）不在首包，點開學習／保養分頁才載入（約 41 KB gzip） */
export type FullData = DataBundle & LearnData
let learnPromise: Promise<LearnData> | null = null
export function loadLearnData(): Promise<LearnData> {
  return (learnPromise ??= import('./learnData').then(m => m.learnData))
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
  const fileIssues: GraphIssue[] = []
  for (const [file, raw] of Object.entries(partModules)) {
    const res = PartFile.safeParse(raw)
    if (!res.success) {
      // 審查 S2：壞檔不再靜默跳過，記成 issue 讓「關於」頁看得到
      console.error(`[data] ${file} 格式錯誤`, res.error.issues)
      fileIssues.push({ partId: file.split('/').pop() ?? file, message: `檔案格式錯誤：${res.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('；')}` })
      continue
    }
    parts.push(...res.data)
  }
  // 零件樹的順序：整車 → 車身 → 引擎 → 變速箱 → 傳動 → 排氣 → 底盤 → 煞車 → 轉向 → 電系（檔名順序不可靠）
  const ORDER = ['car', 'body', 'engine', 'transmission', 'driveline', 'exhaust', 'chassis', 'brakes', 'steering', 'electrical']
  parts.sort((a, b) => ORDER.indexOf(a.system) - ORDER.indexOf(b.system))
  const tools = ToolFile.parse(toolsJson)
  const sources = SourceFile.parse(sourcesJson)
  const toolIds = new Set(tools.map(t => t.id))
  const issues = [...fileIssues, ...validateGraph(parts, toolIds)]
  if (issues.length) console.warn('[data] 相依圖問題', issues)
  base = {
    parts,
    tools: new Map(tools.map(t => [t.id, t])),
    sources: new Map(sources.map(s => [s.id, s])),
    issues,
  }
  return loadData(variant)
}
