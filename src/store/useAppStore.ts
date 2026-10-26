import { create } from 'zustand'
import type { Lang } from '../core/i18n'
import type { PartGraph, Variant } from '../core/partGraph'
import { loadProgress, saveProgress, recordMistake, recordProcedure, recordScore, recordScenario, mistakesFor, type Progress, type TriggeredMistake } from '../core/progress'
import {
  emptyTeardown, removedSet, checkRemove, checkInstall, applyRemove, applyInstall, undoEntry, redoEntry,
  type TeardownState, type HistoryEntry,
} from '../core/disassembly'

export type BodyMode = 'solid' | 'xray' | 'hidden'
export type DrawerTab = 'tree' | 'info' | 'tray' | 'anim' | 'learn' | 'maint'
export type Mode = 'inspect' | 'teardown'
export type SysVis = 'show' | 'ghost' | 'hide'
export type SectionAxis = 'off' | 'x' | 'z'

/** 被擋住時的提示：要先拆（remove）或要先裝回（install）哪些零件 */
export interface Hint {
  kind: 'blocked_remove' | 'blocked_install' | 'fixed' | 'removed' | 'installed' | 'mistake'
  target: string
  ids: string[]
  token: number
  /** kind=mistake 時：發生了什麼後果（已依語言選好） */
  text?: string
}

/** 導覽進行中的狀態（P5） */
export interface GuideState { procId: string; step: number }
/**
 * 故障情境進行中的狀態（P6）。step：0..n-1 是問診題，n 是判斷原因。
 * firstTry[i]：第 i 題第一次就答對嗎（成績用）。
 */
export interface ScenarioState {
  id: string
  phase: 'ask' | 'remove' | 'replace' | 'install' | 'done'
  step: number
  firstTry: boolean[]
  /** 目前這一題答錯過的選項 */
  wrong: number[]
  /** 目前這一題答對了沒 */
  solved: boolean
  /** 開始時的錯誤示範紀錄筆數（結束時相減 = 這次犯了幾個錯） */
  mistakes0: number
  pct: number | null
}
/** 測驗進行中的狀態（P5） */
export interface QuizState { level: number; index: number; answers: Array<number | number[] | null>; done: boolean }

interface AppState {
  lang: Lang
  /** 變速箱變體；預設自排，上方可切換（「?」可叫出說明視窗） */
  variant: Variant | null
  variantModalOpen: boolean
  compareOpen: boolean
  /** 動畫：目前播放的動畫 id、參數 t（0–1）、檔位 */
  anim: string | null
  animT: number
  gear: string
  animPlaying: boolean
  /** 鏡頭對準：改 token 讓 Scene 把鏡頭移到 target */
  focus: { target: [number, number, number]; dist: number; token: number } | null
  selectedId: string | null
  hoveredId: string | null
  expanded: Set<string>
  search: string
  bodyMode: BodyMode
  drawerOpen: boolean
  drawerTab: DrawerTab
  drawerHeight: number
  cameraResetToken: number
  aboutOpen: boolean

  mode: Mode
  teardown: TeardownState
  removedIds: Set<string>
  history: HistoryEntry[]
  future: HistoryEntry[]
  hint: Hint | null

  explode: number
  sectionAxis: SectionAxis
  sectionPos: number
  sysVis: Record<string, SysVis>
  toolsOpen: boolean

  // ── P5 ──
  progress: Progress
  /** 手上拿著的工具（InfoCard 可以勾），拆零件時用來判斷有沒有「沒用對工具」的錯誤示範 */
  toolsInHand: Set<string>
  /** 正要拆某零件但會犯錯：先問使用者「照正確方式」還是「故意做錯看後果」 */
  pendingMistake: { id: string; mistakes: TriggeredMistake[] } | null
  guide: GuideState | null
  quiz: QuizState | null
  /** 學習分頁裡目前展開的等級 */
  learnLevel: number
  scenario: ScenarioState | null

  setLang: (l: Lang) => void
  setVariant: (v: Variant) => void
  setVariantModalOpen: (o: boolean) => void
  setCompareOpen: (o: boolean) => void
  setAnim: (id: string | null) => void
  setAnimT: (t: number) => void
  setGear: (g: string) => void
  setAnimPlaying: (p: boolean) => void
  focusOn: (target: [number, number, number], dist?: number) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  toggleExpanded: (id: string) => void
  expandMany: (ids: Iterable<string>) => void
  setSearch: (q: string) => void
  setBodyMode: (m: BodyMode) => void
  setDrawer: (open: boolean, tab?: DrawerTab) => void
  setDrawerHeight: (px: number) => void
  resetCamera: () => void
  setAboutOpen: (o: boolean) => void

  setMode: (m: Mode) => void
  /** 試著拆下；被擋住時設定 hint 並回傳 false */
  tryRemove: (g: PartGraph, id: string, opts?: { skipMistakes?: boolean; lang?: Lang }) => boolean
  tryInstall: (g: PartGraph, root: string) => boolean
  installAll: (g: PartGraph) => void
  undo: () => void
  redo: () => void
  clearHint: () => void

  setExplode: (v: number) => void
  setSection: (axis: SectionAxis, pos?: number) => void
  setSysVis: (sub: string, v: SysVis) => void
  isolate: (sub: string | null, all: string[]) => void
  setToolsOpen: (o: boolean) => void

  // ── P5 ──
  setProgress: (p: Progress) => void
  toggleTool: (id: string) => void
  /** 錯誤示範對話框：故意做錯 → 記一筆、顯示後果、真的拆下 */
  confirmMistake: (g: PartGraph, lang: Lang) => void
  cancelMistake: () => void
  startGuide: (procId: string) => void
  setGuideStep: (step: number) => void
  finishGuide: (procId: string) => void
  exitGuide: () => void
  startQuiz: (level: number, n: number) => void
  answerQuiz: (answer: number | number[]) => void
  nextQuiz: (total: number) => void
  finishQuiz: (pct: number) => void
  exitQuiz: () => void
  setLearnLevel: (l: number) => void
  setUnlockAll: (on: boolean) => void
  // ── P6 ──
  startScenario: (id: string) => void
  patchScenario: (patch: Partial<ScenarioState>) => void
  finishScenario: (pct: number) => void
  exitScenario: () => void
}

const safeGet = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 無痕模式等情況，忽略 */ } }

let hintToken = 0
const mkHint = (kind: Hint['kind'], target: string, ids: string[] = []): Hint => ({ kind, target, ids, token: ++hintToken })

export const useAppStore = create<AppState>((set, get) => ({
  lang: (safeGet('n20.lang') as Lang) || 'zh',
  variant: (safeGet('n20.variant') as Variant) || 'auto',
  variantModalOpen: false,
  compareOpen: false,
  anim: null,
  animT: 0,
  gear: '1',
  animPlaying: false,
  focus: null,
  selectedId: null,
  hoveredId: null,
  expanded: new Set<string>(['car.root', 'eng.assembly', 'eng.head.cylinder_head']),
  search: '',
  bodyMode: 'xray',
  drawerOpen: true,
  drawerTab: 'tree',
  drawerHeight: Number(safeGet('n20.drawerH')) || 0,
  cameraResetToken: 0,
  aboutOpen: false,

  mode: 'teardown',
  teardown: emptyTeardown(),
  removedIds: new Set(),
  history: [],
  future: [],
  hint: null,

  explode: 0,
  sectionAxis: 'off',
  sectionPos: 0,
  sysVis: {},
  toolsOpen: false,

  progress: loadProgress(),
  toolsInHand: new Set(),
  pendingMistake: null,
  guide: null,
  quiz: null,
  learnLevel: 1,
  scenario: null,

  setLang: (lang) => { safeSet('n20.lang', lang); set({ lang }) },
  /** 換變速箱 = 換一個世界：托盤、歷史、選取全部歸零 */
  setVariant: (variant) => {
    safeSet('n20.variant', variant)
    set({ variant, variantModalOpen: false, teardown: emptyTeardown(), removedIds: new Set(), history: [], future: [], hint: null, selectedId: null, anim: null, animT: 0, gear: '1', guide: null, scenario: null })
  },
  setVariantModalOpen: (variantModalOpen) => set({ variantModalOpen }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setAnim: (anim) => set({ anim, animT: 0, animPlaying: false }),
  setAnimT: (animT) => set({ animT }),
  setGear: (gear) => set({ gear }),
  setAnimPlaying: (animPlaying) => set({ animPlaying }),
  focusOn: (target, dist = 1.2) => set((s) => ({ focus: { target, dist, token: (s.focus?.token ?? 0) + 1 } })),
  select: (id) => set(() => {
    // 選到零件時，手機抽屜切到資訊頁
    const next: Partial<AppState> = { selectedId: id }
    if (id) { next.drawerTab = 'info'; next.drawerOpen = true }
    return next
  }),
  hover: (id) => set({ hoveredId: id }),
  toggleExpanded: (id) => set((s) => {
    const e = new Set(s.expanded)
    if (e.has(id)) e.delete(id); else e.add(id)
    return { expanded: e }
  }),
  expandMany: (ids) => set((s) => {
    const e = new Set(s.expanded)
    let changed = false
    for (const id of ids) if (!e.has(id)) { e.add(id); changed = true }
    return changed ? { expanded: e } : {}
  }),
  setSearch: (search) => set({ search }),
  setBodyMode: (bodyMode) => set({ bodyMode }),
  setDrawer: (open, tab) => set((s) => ({ drawerOpen: open, drawerTab: tab ?? s.drawerTab })),
  setDrawerHeight: (px) => { safeSet('n20.drawerH', String(Math.round(px))); set({ drawerHeight: px }) },
  resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),

  setMode: (mode) => set({ mode }),

  tryRemove: (g, id, opts) => {
    const s = get()
    const r = checkRemove(g, s.teardown, id)
    if (!r.ok) {
      if (r.reason === 'blocked') set({ hint: mkHint('blocked_remove', id, r.blockers) })
      else if (r.reason === 'fixed') set({ hint: mkHint('fixed', id) })
      return false
    }
    // 錯誤示範：規則上拆得下來，但沒用對工具或少做一件事 → 先攔下來問
    if (!opts?.skipMistakes) {
      const part = g.byId.get(id)
      const ms = part ? mistakesFor(part, s.removedIds, s.toolsInHand) : []
      if (ms.length) { set({ pendingMistake: { id, mistakes: ms } }); return false }
    }
    const teardown = applyRemove(s.teardown, r.unit)
    set({
      teardown, removedIds: removedSet(teardown),
      history: [...s.history, { kind: 'remove', unit: r.unit }], future: [],
      hint: mkHint('removed', id, r.unit.members),
      selectedId: s.selectedId && r.unit.members.includes(s.selectedId) ? id : s.selectedId,
    })
    return true
  },

  tryInstall: (g, root) => {
    const s = get()
    const r = checkInstall(g, s.teardown, root)
    if (!r.ok) {
      if (r.reason === 'blocked') set({ hint: mkHint('blocked_install', root, r.blockers) })
      return false
    }
    const res = applyInstall(s.teardown, root)!
    set({
      teardown: res.state, removedIds: removedSet(res.state),
      history: [...s.history, { kind: 'install', unit: res.unit, index: res.index }], future: [],
      hint: mkHint('installed', root, res.unit.members),
    })
    return true
  },

  /** 照反順序全部裝回（每一步都走規則檢查，所以一定合法） */
  installAll: (g) => {
    for (let guard = 0; guard < 500; guard++) {
      const units = get().teardown.units
      if (!units.length) break
      if (!get().tryInstall(g, units[units.length - 1].root)) break
    }
    set({ hint: null })
  },

  undo: () => set((s) => {
    const h = s.history[s.history.length - 1]
    if (!h) return {}
    const teardown = undoEntry(s.teardown, h)
    return { teardown, removedIds: removedSet(teardown), history: s.history.slice(0, -1), future: [...s.future, h], hint: null }
  }),
  redo: () => set((s) => {
    const h = s.future[s.future.length - 1]
    if (!h) return {}
    const teardown = redoEntry(s.teardown, h)
    return { teardown, removedIds: removedSet(teardown), history: [...s.history, h], future: s.future.slice(0, -1), hint: null }
  }),
  clearHint: () => set({ hint: null }),

  setExplode: (explode) => set({ explode }),
  setSection: (sectionAxis, pos) => set((s) => ({ sectionAxis, sectionPos: pos ?? s.sectionPos })),
  setSysVis: (sub, v) => set((s) => ({ sysVis: { ...s.sysVis, [sub]: v } })),
  isolate: (sub, all) => set(() => {
    if (!sub) return { sysVis: {} }
    const sysVis: Record<string, SysVis> = {}
    for (const a of all) sysVis[a] = a === sub ? 'show' : 'ghost'
    return { sysVis }
  }),
  setToolsOpen: (toolsOpen) => set({ toolsOpen }),

  // ── P5 ──
  setProgress: (progress) => { saveProgress(progress); set({ progress }) },
  toggleTool: (id) => set((s) => { const t = new Set(s.toolsInHand); if (t.has(id)) t.delete(id); else t.add(id); return { toolsInHand: t } }),
  confirmMistake: (g, lang) => {
    const s = get()
    const pm = s.pendingMistake
    if (!pm) return
    let progress = s.progress
    for (const m of pm.mistakes) progress = recordMistake(progress, { partId: pm.id, trigger: m.trigger, severity: m.severity })
    saveProgress(progress)
    set({ pendingMistake: null, progress })
    if (get().tryRemove(g, pm.id, { skipMistakes: true })) {
      // 最嚴重的那一條後果放在提示列（紅色、停留久一點）
      const worst = [...pm.mistakes].sort((a, b) => rank(b.severity) - rank(a.severity))[0]
      set({ hint: { ...mkHint('mistake', pm.id), text: worst.consequence[lang] } })
    }
  },
  cancelMistake: () => set({ pendingMistake: null }),
  startGuide: (procId) => set({ guide: { procId, step: 0 }, quiz: null, scenario: null, drawerOpen: true, drawerTab: 'learn', mode: 'teardown' }),
  setGuideStep: (step) => set((s) => (s.guide ? { guide: { ...s.guide, step } } : {})),
  finishGuide: (procId) => { const p = recordProcedure(get().progress, procId); saveProgress(p); set({ progress: p, guide: null }) },
  exitGuide: () => set({ guide: null }),
  startQuiz: (level, n) => set({ quiz: { level, index: 0, answers: Array(n).fill(null), done: false }, guide: null, scenario: null, drawerOpen: true, drawerTab: 'learn' }),
  answerQuiz: (answer) => set((s) => { if (!s.quiz) return {}; const answers = [...s.quiz.answers]; answers[s.quiz.index] = answer; return { quiz: { ...s.quiz, answers } } }),
  nextQuiz: (total) => set((s) => (s.quiz ? { quiz: { ...s.quiz, index: Math.min(total, s.quiz.index + 1) } } : {})),
  finishQuiz: (pct) => { const s = get(); if (!s.quiz) return; const p = recordScore(s.progress, s.quiz.level, pct); saveProgress(p); set({ progress: p, quiz: { ...s.quiz, done: true } }) },
  exitQuiz: () => set({ quiz: null }),
  setLearnLevel: (learnLevel) => set({ learnLevel }),
  setUnlockAll: (unlockAll) => { const p = { ...get().progress, unlockAll }; saveProgress(p); set({ progress: p }) },

  // ── P6 ──
  startScenario: (id) => set((s) => ({
    scenario: { id, phase: 'ask', step: 0, firstTry: [], wrong: [], solved: false, mistakes0: s.progress.mistakes.length, pct: null },
    guide: null, quiz: null, drawerOpen: true, drawerTab: 'learn', mode: 'teardown', bodyMode: 'xray',
  })),
  patchScenario: (patch) => set((s) => (s.scenario ? { scenario: { ...s.scenario, ...patch } } : {})),
  finishScenario: (pct) => {
    const s = get()
    if (!s.scenario) return
    const p = recordScenario(s.progress, s.scenario.id, pct)
    saveProgress(p)
    set({ progress: p, scenario: { ...s.scenario, phase: 'done', pct } })
  },
  exitScenario: () => set({ scenario: null }),
}))

const rank = (sv: 'info' | 'warning' | 'critical') => (sv === 'critical' ? 2 : sv === 'warning' ? 1 : 0)
