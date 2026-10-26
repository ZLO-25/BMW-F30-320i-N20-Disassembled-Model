import { describe, it, expect } from 'vitest'
import { PartFile, ScenarioFile, MaintenanceFile, QuizFile } from './schema'
import { buildGraph, type Variant } from './partGraph'
import { emptyTeardown, removalPlan, nextRemovalStep, checkRemove, applyRemove, removedSet, greedyReinstall } from './disassembly'
import { scenarioPct, recordScenario, emptyProgress, loadProgress } from './progress'

const partFiles = import.meta.glob('../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const parts = Object.values(partFiles).flatMap(m => PartFile.parse(m))
const scenarios = Object.values(import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' }) as Record<string, unknown>).flatMap(m => ScenarioFile.parse(m))
const maintenance = Object.values(import.meta.glob('../../data/maintenance/*.json', { eager: true, import: 'default' }) as Record<string, unknown>).flatMap(m => MaintenanceFile.parse(m))
const quizzes = Object.values(import.meta.glob('../../data/quizzes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>).flatMap(m => QuizFile.parse(m))

describe('拆解提示（情境任務用）', () => {
  const g = buildGraph(parts, 'auto')
  it('考爾：下一步先拆引擎飾蓋', () => {
    expect(nextRemovalStep(g, emptyTeardown(), 'eng.ignition.coil_set')).toBe('eng.head.engine_cover')
    expect(removalPlan(g, emptyTeardown(), ['eng.ignition.coil_set']).order).toEqual(['eng.head.engine_cover', 'eng.ignition.coil_set'])
  })
  it('已經拆下的零件沒有下一步', () => {
    const r = checkRemove(g, emptyTeardown(), 'eng.head.engine_cover')
    if (!r.ok) throw new Error('should remove')
    const s = applyRemove(emptyTeardown(), r.unit)
    expect(nextRemovalStep(g, s, 'eng.head.engine_cover')).toBeNull()
  })
  it('正時鏈（自排）的拆解路線會經過變速箱', () => {
    const plan = removalPlan(g, emptyTeardown(), ['eng.timing.chain'])
    expect(plan.stuck).toEqual([])
    expect(plan.order).toContain('trans.auto.assembly')
    expect(plan.order[plan.order.length - 1]).toBe('eng.timing.chain')
  })
})

describe('每個故障情境在它的變速箱世界裡都拆得到、裝得回', () => {
  for (const scn of scenarios) {
    const variants: Variant[] = scn.transmissionVariant === 'both' ? ['manual', 'auto'] : [scn.transmissionVariant]
    for (const v of variants) {
      it(`${scn.id}（${v}）`, () => {
        const g = buildGraph(parts, v)
        const plan = removalPlan(g, emptyTeardown(), scn.replace)
        expect(plan.stuck).toEqual([])
        // 照路線真的走一遍，每一步都合法，最後要換的零件都在托盤上
        let s = emptyTeardown()
        for (const id of plan.order) { const r = checkRemove(g, s, id); expect(r.ok).toBe(true); if (r.ok) s = applyRemove(s, r.unit) }
        for (const id of scn.replace) expect(removedSet(s).has(id)).toBe(true)
        expect(greedyReinstall(g, s).state.units).toEqual([])
      })
    }
  }
})

describe('P6 驗收數量', () => {
  it('每一種變速箱都看得到 14 項保養、至少 5 個情境；題目至少 50 題', () => {
    for (const v of ['manual', 'auto'] as const) {
      expect(maintenance.filter(m => m.transmissionVariant === 'both' || m.transmissionVariant === v).length).toBe(14)
      expect(scenarios.filter(s => s.transmissionVariant === 'both' || s.transmissionVariant === v).length).toBeGreaterThanOrEqual(5)
    }
    expect(quizzes.length).toBeGreaterThanOrEqual(50)
    expect(new Set(quizzes.map(q => q.id)).size).toBe(quizzes.length)
  })
  it('保養的原廠與台灣保守建議都有寫，沒有來源的不給數字', () => {
    for (const m of maintenance) for (const iv of [m.interval.oem, m.interval.taiwanConservative]) {
      expect(iv.text.zh.length).toBeGreaterThan(0)
      if (iv.confidence === 'unverified') { expect(iv.km).toBeNull(); expect(iv.months).toBeNull() }
    }
  })
})

describe('情境成績', () => {
  it('第一次就答對的比例', () => {
    expect(scenarioPct([true, true, false])).toBe(67)
    expect(scenarioPct([])).toBe(0)
  })
  it('只記最好成績', () => {
    let p = recordScenario(emptyProgress(), 'scn.x', 67)
    p = recordScenario(p, 'scn.x', 33)
    expect(p.scenarioBest['scn.x']).toBe(67)
  })
  it('舊版進度（沒有 scenarioBest）讀得進來', () => {
    expect(loadProgress().scenarioBest).toEqual({})
  })
})
