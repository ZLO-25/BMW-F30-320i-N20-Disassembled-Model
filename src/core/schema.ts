/**
 * 資料格式定義（Zod）。說明文件在 docs/DATA_SCHEMA.md，兩者要同步。
 * 這個檔案不能 import React 或 three，因為 scripts/validate.ts 也會用它。
 */
import { z } from 'zod'

export const Bilingual = z.object({ zh: z.string(), en: z.string() })
export type Bilingual = z.infer<typeof Bilingual>

export const Confidence = z.enum(['verified', 'community', 'unverified'])
export type Confidence = z.infer<typeof Confidence>

export const SystemId = z.enum([
  'car', 'engine', 'transmission', 'driveline', 'exhaust',
  'chassis', 'brakes', 'steering', 'electrical', 'body',
])
export type SystemId = z.infer<typeof SystemId>

export const TransmissionVariant = z.enum(['both', 'manual', 'auto'])
export type TransmissionVariant = z.infer<typeof TransmissionVariant>

const Vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() })
export type Vec3 = z.infer<typeof Vec3>

/** 有來源的數值。confidence 不是 unverified 時 source 不可為 null；是 unverified 時 value 必須為 null。 */
const sourcedRefine = (d: { confidence: Confidence; source: string | null; value?: unknown }, ctx: z.RefinementCtx) => {
  if (d.confidence !== 'unverified' && d.source === null) {
    ctx.addIssue({ code: 'custom', message: `confidence=${d.confidence} 但 source 是 null` })
  }
  if (d.confidence === 'unverified' && d.value !== undefined && d.value !== null) {
    ctx.addIssue({ code: 'custom', message: `confidence=unverified 但 value 不是 null（不准偷填）` })
  }
}

export const SourcedValue = z.object({
  key: z.string(),
  label: Bilingual,
  value: z.union([z.number(), z.string()]).nullable(),
  unit: z.string().nullable(),
  source: z.string().nullable(),
  confidence: Confidence,
  note: Bilingual.nullable().optional(),
}).superRefine(sourcedRefine)
export type SourcedValue = z.infer<typeof SourcedValue>

export const Fastener = z.object({
  desc: z.string(),
  qty: z.number().int().nullable(),
  torque_nm: z.number().nullable(),
  oneTimeUse: z.boolean(),
  spec: z.string().nullable().optional(),
  source: z.string().nullable(),
  confidence: Confidence,
}).superRefine((d, ctx) => sourcedRefine({ confidence: d.confidence, source: d.source, value: d.torque_nm }, ctx))
export type Fastener = z.infer<typeof Fastener>

export const Mistake = z.object({
  trigger: z.string(),            // "remove_without_tool:<tool id>" | "remove_before:<part id>"
  severity: z.enum(['info', 'warning', 'critical']),
  consequence: Bilingual,
})

export const PartNumber = z.object({
  number: z.string().nullable(),
  source: z.string().nullable(),
  confidence: Confidence,
}).superRefine((d, ctx) => sourcedRefine({ confidence: d.confidence, source: d.source, value: d.number }, ctx))

export const Part = z.object({
  id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'id 只能用小寫、數字、底線，以點分隔'),
  system: SystemId,
  subsystem: z.string(),
  level: z.number().int().min(0).max(3),
  name: Bilingual,
  modelRef: z.string().regex(/^(procedural:[a-z0-9_]+|glb:\/.+\.glb(#.+)?)$/, 'modelRef 要是 procedural:xxx 或 glb:/models/xxx.glb#node'),
  position: Vec3,
  rotation: Vec3.default({ x: 0, y: 0, z: 0 }),
  explodeDir: Vec3.default({ x: 0, y: 1, z: 0 }),
  removePath: z.array(Vec3).optional(),
  parent: z.string().nullable(),
  explain: z.object({ universal: Bilingual, specific: Bilingual }),
  removal: z.object({
    requires: z.array(z.string()),
    /** 依變速箱變體不同的額外 requires（P3）：例：正時鏈在手排要先拆手排箱、自排要先拆自排箱 */
    requiresVariant: z.object({ manual: z.array(z.string()).default([]), auto: z.array(z.string()).default([]) }).default({ manual: [], auto: [] }),
    tools: z.array(z.string()),
    fasteners: z.array(Fastener),
    warnings: z.array(Bilingual),
    mistakes: z.array(Mistake).default([]),
  }),
  detachesWithParent: z.boolean().default(true),
  /** false = 結構件（例如車身），不能拆。預設 true */
  removable: z.boolean().default(true),
  specs: z.array(SourcedValue).default([]),
  partNumbers: z.array(PartNumber),
  commonIssues: z.array(Bilingual),
  transmissionVariant: TransmissionVariant,
  animations: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** 位置是否只是示意（還沒對照實車尺寸） */
  positionApproximate: z.boolean().default(true),
})
export type Part = z.infer<typeof Part>
export type PartInput = z.input<typeof Part>

export const Tool = z.object({
  id: z.string().regex(/^tool\.[a-z0-9_]+$/),
  name: Bilingual,
  category: z.enum(['hand', 'power', 'special', 'measure', 'consumable']),
  size: z.string().nullable().optional(),
  oemRef: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  confidence: Confidence.optional(),
})
export type Tool = z.infer<typeof Tool>

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  type: z.enum(['oem', 'parts_catalog', 'repair_site', 'diy', 'wiki', 'forum', 'manufacturer', 'media']),
  accessed: z.string(),
  note: z.string().optional(),
})
export type Source = z.infer<typeof Source>

export const PartFile = z.array(Part)
export const ToolFile = z.array(Tool)
export const SourceFile = z.array(Source)

// ───────────────────────── P5：導覽、測驗、學習路徑 ─────────────────────────
export const ProcedureStep = z.object({
  /** remove / install：對零件做拆裝（導覽會真的去動 3D）；check / note：只是看一下、做一件事（按「完成」） */
  action: z.enum(['remove', 'install', 'check', 'note']),
  part: z.string().nullable().default(null),
  title: Bilingual,
  tools: z.array(z.string()).default([]),
  /** 扭力：value null = 待查證（不准偷填） */
  torque: z.object({ value: z.number().nullable(), unit: z.string().default('Nm'), source: z.string().nullable().default(null), confidence: Confidence.default('unverified') }).nullable().default(null),
  note: Bilingual.nullable().default(null),
  warning: Bilingual.nullable().default(null),
})
export type ProcedureStep = z.infer<typeof ProcedureStep>

export const Procedure = z.object({
  id: z.string().regex(/^proc\.[a-z0-9_]+$/),
  title: Bilingual,
  /** 1（最簡單）–5 */
  difficulty: z.number().int().min(1).max(5),
  level: z.number().int().min(1).max(5),
  transmissionVariant: TransmissionVariant.default('both'),
  intro: Bilingual,
  /** 大約幾分鐘（示意，不是原廠工時） */
  minutes: z.number().nullable().default(null),
  steps: z.array(ProcedureStep).min(1),
})
export type Procedure = z.infer<typeof Procedure>

export const Quiz = z.object({
  id: z.string().regex(/^quiz\.[a-z0-9_]+$/),
  level: z.number().int().min(1).max(5),
  /** identify：3D 裡亮一個零件問是什麼；choice：原理選擇題；order：把步驟排對 */
  type: z.enum(['identify', 'choice', 'order']),
  prompt: Bilingual,
  /** identify 用：要在 3D 裡亮起來的零件 */
  part: z.string().nullable().default(null),
  options: z.array(Bilingual),
  /** identify / choice：正確選項的索引；order：正確順序（選項索引陣列） */
  answer: z.union([z.number().int(), z.array(z.number().int())]),
  explain: Bilingual,
})
export type Quiz = z.infer<typeof Quiz>

export const Level = z.object({
  id: z.number().int().min(1).max(5),
  title: Bilingual,
  summary: Bilingual,
  /** 這一級該做的事（顯示成清單，可以點） */
  goals: z.array(z.object({
    kind: z.enum(['look', 'isolate', 'animation', 'procedure', 'scenario', 'text']),
    ref: z.string().nullable().default(null),
    text: Bilingual,
  })),
  /** 通過門檻（百分比） */
  passPct: z.number().int().min(0).max(100).default(80),
})
export type Level = z.infer<typeof Level>

export const ProcedureFile = z.array(Procedure)
export const QuizFile = z.array(Quiz)
export const LevelFile = z.array(Level)

// ───────────────────────── P6：保養、故障情境 ─────────────────────────
/**
 * 保養週期：km / months 是給程式比較用的數字；text 是給人看的完整說法（含原文英里數、「先到先算」等）。
 * confidence = unverified 時 km 與 months 必須是 null（沒有來源就不給數字），text 寫清楚要看什麼。
 */
export const Interval = z.object({
  km: z.number().nullable(),
  months: z.number().nullable(),
  text: Bilingual,
  source: z.string().nullable(),
  confidence: Confidence,
}).superRefine((d, ctx) => {
  if (d.confidence !== 'unverified' && d.source === null) ctx.addIssue({ code: 'custom', message: `confidence=${d.confidence} 但 source 是 null` })
  if (d.confidence === 'unverified' && (d.km !== null || d.months !== null)) ctx.addIssue({ code: 'custom', message: 'confidence=unverified 但 km / months 不是 null（不准偷填）' })
})
export type Interval = z.infer<typeof Interval>

export const Consumable = z.object({
  name: Bilingual,
  /** 規格或料號，例如「MTF LT-3（83222339221）」；不知道就 null */
  spec: z.string().nullable().default(null),
  /** 用量，例如「約 4.5 L」；不知道就 null */
  qty: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  confidence: Confidence.default('unverified'),
}).superRefine((d, ctx) => {
  if (d.confidence !== 'unverified' && d.source === null) ctx.addIssue({ code: 'custom', message: `confidence=${d.confidence} 但 source 是 null` })
  if (d.confidence === 'unverified' && (d.spec !== null || d.qty !== null)) ctx.addIssue({ code: 'custom', message: 'confidence=unverified 但 spec / qty 有填（不准偷填）' })
})

export const Maintenance = z.object({
  id: z.string().regex(/^mnt\.[a-z0-9_]+$/),
  title: Bilingual,
  /** 同一組的項目在列表上排在一起（例：自排 ATF 與手排齒輪油都是 gearbox_oil） */
  group: z.string().nullable().default(null),
  transmissionVariant: TransmissionVariant.default('both'),
  /** 通用層：這個保養在做什麼、為什麼要做 */
  purpose: Bilingual,
  /** 專屬層：F30 / N20 怎麼做 */
  f30Method: Bilingual,
  interval: z.object({
    /** 原廠建議 */
    oem: Interval,
    /** 台灣高溫、走走停停路況的保守建議（和原廠分開標示） */
    taiwanConservative: Interval,
  }),
  tools: z.array(z.string()).default([]),
  consumables: z.array(Consumable).default([]),
  /** 一鍵跳到 3D：要對準的零件 */
  focusPart: z.string().nullable().default(null),
  /** 用導覽帶著做：導覽 id */
  procedure: z.string().nullable().default(null),
  warnings: z.array(Bilingual).default([]),
})
export type Maintenance = z.infer<typeof Maintenance>

const Choice = z.object({ prompt: Bilingual, options: z.array(Bilingual).min(2), answer: z.number().int(), explain: Bilingual })

export const Scenario = z.object({
  id: z.string().regex(/^scn\.[a-z0-9_]+$/),
  title: Bilingual,
  level: z.number().int().min(1).max(5).default(5),
  difficulty: z.number().int().min(1).max(5),
  transmissionVariant: TransmissionVariant.default('both'),
  /** 車主描述的症狀 */
  symptom: Bilingual,
  /** 問診：一題一題問（選擇題） */
  questions: z.array(Choice).min(1),
  /** 判斷：最可能的原因 */
  cause: Choice,
  /** 要拆下來換新的零件（全部拆下才算拆完） */
  replace: z.array(z.string()).min(1),
  /** 換零件時要知道的事 */
  replaceNote: Bilingual,
  /** 裝回時要注意的事 */
  reassembleNote: Bilingual,
  sources: z.array(z.string()).default([]),
})
export type Scenario = z.infer<typeof Scenario>

export const MaintenanceFile = z.array(Maintenance)
export const ScenarioFile = z.array(Scenario)
