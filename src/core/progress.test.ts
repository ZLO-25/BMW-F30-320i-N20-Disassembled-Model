import { describe, it, expect } from 'vitest'
import { LevelFile, QuizFile, PartFile, type Part } from './schema'
import { emptyProgress, isLevelUnlocked, recordScore, scorePct, isCorrect, mistakesFor, recordMistake } from './progress'
import levelsJson from '../../data/levels.json'
import quizJson from '../../data/quizzes/samples.json'
import engineJson from '../../data/parts/engine.json'

const levels = LevelFile.parse(levelsJson)
const quizzes = QuizFile.parse(quizJson)

describe('學習路徑解鎖', () => {
  it('一開始只有 Lv1 開著', () => {
    const p = emptyProgress()
    expect([1, 2, 3, 4, 5].map(l => isLevelUnlocked(l, levels, p))).toEqual([true, false, false, false, false])
  })
  it('Lv1 考 80% 解鎖 Lv2，79% 不行；Lv3 還是鎖著', () => {
    let p = recordScore(emptyProgress(), 1, 79)
    expect(isLevelUnlocked(2, levels, p)).toBe(false)
    p = recordScore(p, 1, 80)
    expect(isLevelUnlocked(2, levels, p)).toBe(true)
    expect(isLevelUnlocked(3, levels, p)).toBe(false)
  })
  it('成績只往上記', () => {
    const p = recordScore(recordScore(emptyProgress(), 1, 100), 1, 50)
    expect(p.levelBest[1]).toBe(100)
  })
  it('設定關掉解鎖條件後全開', () => {
    expect(isLevelUnlocked(5, levels, { ...emptyProgress(), unlockAll: true })).toBe(true)
  })
})

describe('測驗計分', () => {
  const lv1 = quizzes.filter(q => q.level === 1)
  it('每一級都有 3–5 題示範題', () => {
    for (const l of levels) { const n = quizzes.filter(q => q.level === l.id).length; expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(5) }
  })
  it('全對 100、全錯 0、沒答算錯', () => {
    expect(scorePct(lv1, lv1.map(q => q.answer))).toBe(100)
    expect(scorePct(lv1, lv1.map(() => 99))).toBe(0)
    expect(scorePct(lv1, lv1.map(() => null))).toBe(0)
  })
  it('order 題順序錯一個就算錯', () => {
    const q = quizzes.find(q => q.type === 'order')!
    const right = q.answer as number[]
    expect(isCorrect(q, right)).toBe(true)
    expect(isCorrect(q, [...right].reverse())).toBe(false)
  })
})

describe('錯誤示範', () => {
  const parts = PartFile.parse(engineJson)
  const cam = parts.find(p => p.id === 'eng.head.camshaft_intake') as Part
  it('沒拿正時鎖就拆凸輪軸 → 觸發 critical', () => {
    const m = mistakesFor(cam, new Set(), new Set())
    expect(m).toHaveLength(1)
    expect(m[0].severity).toBe('critical')
    expect(m[0].toolId).toBe('tool.n20_timing_lock')
  })
  it('拿了正時鎖就不觸發', () => {
    expect(mistakesFor(cam, new Set(), new Set(['tool.n20_timing_lock']))).toEqual([])
  })
  it('remove_before：該先拆的還裝著才觸發', () => {
    const fake = { ...cam, removal: { ...cam.removal, mistakes: [{ trigger: 'remove_before:elec.battery', severity: 'critical' as const, consequence: { zh: 'x', en: 'x' } }] } }
    expect(mistakesFor(fake, new Set(), new Set())).toHaveLength(1)
    expect(mistakesFor(fake, new Set(['elec.battery']), new Set())).toHaveLength(0)
  })
  it('紀錄最多留 50 筆', () => {
    let p = emptyProgress()
    for (let i = 0; i < 60; i++) p = recordMistake(p, { partId: 'x', trigger: 't', severity: 'info' }, i)
    expect(p.mistakes).toHaveLength(50)
    expect(p.mistakes[0].at).toBe(10)
  })
})
