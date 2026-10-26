import { useMemo } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, fmt, partName } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { isLevelUnlocked, emptyProgress } from '../core/progress'
import { worldPosition } from '../core/partGraph'
import { SUBSYSTEM_NAMES } from '../core/i18n'
import { GuidePanel } from './GuidePanel'
import { QuizPanel } from './QuizPanel'
import { ScenarioPanel } from './ScenarioPanel'
import type { Level } from '../core/schema'

/** 側欄「學習」分頁：學習路徑 Lv1–Lv5（鎖 / 成績 / 清單）、導覽入口、小考入口、錯誤示範紀錄 */
export function LearnPanel({ data }: { data: DataBundle }) {
  const guide = useAppStore(s => s.guide)
  const quiz = useAppStore(s => s.quiz)
  const scenario = useAppStore(s => s.scenario)
  if (scenario) return <ScenarioPanel data={data} />
  if (guide) return <GuidePanel data={data} />
  if (quiz) return <QuizPanel data={data} />
  return <LevelList data={data} />
}

function LevelList({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const progress = useAppStore(s => s.progress)
  const setProgress = useAppStore(s => s.setProgress)
  const setUnlockAll = useAppStore(s => s.setUnlockAll)
  const learnLevel = useAppStore(s => s.learnLevel)
  const setLearnLevel = useAppStore(s => s.setLearnLevel)
  const startGuide = useAppStore(s => s.startGuide)
  const startQuiz = useAppStore(s => s.startQuiz)
  const variant = useAppStore(s => s.variant)

  const quizCount = (l: number) => data.quizzes.filter(q => q.level === l).length
  const procsFor = (l: number) => data.procedures.filter(p => p.level === l)
  const mistakes = [...progress.mistakes].reverse().slice(0, 8)

  return (
    <div className="learn">
      <p className="muted small">{ui('learnIntro', lang)}</p>
      <ol className="levels">
        {data.levels.map(l => {
          const open = isLevelUnlocked(l.id, data.levels, progress)
          const best = progress.levelBest[l.id]
          const passed = (best ?? 0) >= l.passPct
          const expanded = learnLevel === l.id
          return (
            <li key={l.id} className={`level ${open ? '' : 'locked'} ${expanded ? 'on' : ''}`}>
              <button className="level-head" onClick={() => setLearnLevel(l.id)}>
                <span className="level-n">{open ? (passed ? '✓' : l.id) : '🔒'}</span>
                <span className="level-title"><strong>Lv{l.id}　{t(l.title, lang)}</strong><small>{best == null ? ui('notTaken', lang) : `${ui('best', lang)} ${best}%${passed ? ' · ' + ui('passed', lang) : ''}`}</small></span>
              </button>
              {expanded && (
                <div className="level-body">
                  <p>{t(l.summary, lang)}</p>
                  {!open && <p className="locked-hint">🔒 {fmt(ui('lockedHint', lang), { p: data.levels.find(x => x.id === l.id - 1)?.passPct ?? 80 })}</p>}
                  <h4>{ui('goals', lang)}</h4>
                  <ul className="goals">
                    {l.goals.map((g, i) => <li key={i}><span>{t(g.text, lang)}</span>{open && <GoalButton data={data} goal={g} />}</li>)}
                  </ul>
                  {procsFor(l.id).length > 0 && (
                    <>
                      <h4>{ui('procedures', lang)}</h4>
                      <ul className="procs">
                        {procsFor(l.id).map(p => {
                          const done = progress.completedProcedures.includes(p.id)
                          const wrongVariant = p.transmissionVariant !== 'both' && p.transmissionVariant !== variant
                          return (
                            <li key={p.id} className={done ? 'done' : ''}>
                              <span className="proc-title">{done ? '✓ ' : ''}{t(p.title, lang)}<small>{ui('difficulty', lang)} {'★'.repeat(p.difficulty)}{'☆'.repeat(5 - p.difficulty)}{p.minutes != null && ' · ' + fmt(ui('minutes', lang), { n: p.minutes })}{wrongVariant && ' · ' + fmt(ui('guideVariant', lang), { v: ui(p.transmissionVariant === 'manual' ? 'variantManual' : 'variantAuto', lang) })}</small></span>
                              <button disabled={!open || wrongVariant} onClick={() => startGuide(p.id)}>▶ {ui('startGuide', lang)}</button>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                  {data.scenarios.some(sc => sc.level === l.id) && (
                    <>
                      <h4>{ui('scenarios', lang)}</h4>
                      <ul className="procs">
                        {data.scenarios.filter(sc => sc.level === l.id).map(sc => {
                          const best = progress.scenarioBest[sc.id]
                          const wrongVariant = sc.transmissionVariant !== 'both' && sc.transmissionVariant !== variant
                          return (
                            <li key={sc.id} className={best != null ? 'done' : ''}>
                              <span className="proc-title">{best != null ? '✓ ' : ''}{t(sc.title, lang)}<small>{ui('difficulty', lang)} {'★'.repeat(sc.difficulty)}{'☆'.repeat(5 - sc.difficulty)}{best != null && ` · ${ui('best', lang)} ${best}%`}{wrongVariant && ' · ' + fmt(ui('scnVariant', lang), { v: ui(sc.transmissionVariant === 'manual' ? 'variantManual' : 'variantAuto', lang) })}</small></span>
                              <button disabled={!open || wrongVariant} onClick={() => beginScenario(data, sc.id, lang)}>▶ {ui('startScenario', lang)}</button>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                  <button className="primary quiz-btn" disabled={!open} onClick={() => startQuiz(l.id, quizCount(l.id))}>📝 {fmt(ui('takeQuiz', lang), { n: quizCount(l.id) })}</button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <label className="unlock-all"><input type="checkbox" checked={progress.unlockAll} onChange={e => setUnlockAll(e.target.checked)} /> {ui('unlockAll', lang)}</label>

      <h4>{ui('mistakeLog', lang)}</h4>
      {mistakes.length === 0 ? <p className="muted small">{ui('noMistakes', lang)}</p> : (
        <ul className="mistake-log">
          {mistakes.map((m, i) => {
            const p = data.graph.byId.get(m.partId) ?? data.parts.find(x => x.id === m.partId)
            return <li key={i} className={`sev-${m.severity}`}><span className="sev">{ui(m.severity === 'critical' ? 'sevCritical' : m.severity === 'warning' ? 'sevWarning' : 'sevInfo', lang)}</span>{p ? t(p.name, lang) : m.partId}<small>{triggerText(m.trigger, data, lang)}</small></li>
          })}
        </ul>
      )}
      <button className="link" onClick={() => { if (window.confirm(ui('resetProgressConfirm', lang))) setProgress(emptyProgress()) }}>{ui('resetProgress', lang)}</button>
    </div>
  )
}

/** 開始情境任務：托盤有東西要先全部裝回（從整台完整的車開始） */
export function beginScenario(data: DataBundle, id: string, lang: 'zh' | 'en') {
  const st = useAppStore.getState()
  if (st.teardown.units.length > 0) {
    if (!window.confirm(ui('scnResetConfirm', lang))) return
    st.installAll(data.graph)
  }
  useAppStore.getState().startScenario(id)
}

export function triggerText(trigger: string, data: DataBundle, lang: 'zh' | 'en'): string {
  const [kind, ref] = trigger.split(':')
  if (kind === 'remove_without_tool') { const tl = data.tools.get(ref); return fmt(ui('mistakeTool', lang), { t: tl ? partName(tl.name) : ref }) }
  if (kind === 'remove_before') { const p = data.parts.find(x => x.id === ref); return fmt(ui('mistakeBefore', lang), { p: p ? partName(p.name) : ref }) }
  return trigger
}

/** 清單上每件事的「去做」：看車殼 → 透視；只看某系統 → 檢視工具 isolate；動畫 → 動畫分頁；看零件 → 選取並對準鏡頭 */
function GoalButton({ data, goal }: { data: DataBundle; goal: Level['goals'][number] }) {
  const lang = useAppStore(s => s.lang)
  const subs = useMemo(() => {
    const seen = new Set<string>()
    for (const p of data.graph.byId.values()) if (p.subsystem !== 'root' && p.system !== 'body') seen.add(p.subsystem)
    return [...seen]
  }, [data])
  const go = () => {
    const st = useAppStore.getState()
    if (goal.kind === 'look') {
      if (goal.ref === 'body' || !goal.ref) { st.setBodyMode('xray'); st.resetCamera(); return }
      const w = worldPosition(data.graph, goal.ref)
      if (!w) return
      st.setBodyMode('xray')
      st.focusOn(w, 1.4)
      useAppStore.setState({ selectedId: goal.ref })
    } else if (goal.kind === 'isolate' && goal.ref) {
      st.isolate(goal.ref, subs); st.setToolsOpen(true); st.setBodyMode('hidden')
    } else if (goal.kind === 'animation' && goal.ref) {
      st.setAnim(goal.ref); st.setDrawer(true, 'anim')
    } else if (goal.kind === 'procedure' && goal.ref) {
      st.startGuide(goal.ref)
    } else if (goal.kind === 'scenario' && goal.ref) {
      beginScenario(data, goal.ref, lang)
    }
  }
  if (goal.kind === 'text' || (goal.kind === 'scenario' && !goal.ref)) return null
  const label = goal.kind === 'isolate' && goal.ref ? t(SUBSYSTEM_NAMES[goal.ref] ?? { zh: goal.ref, en: goal.ref }, lang) : ui('go', lang)
  return <button className="goal-go" onClick={go}>{goal.kind === 'isolate' ? '👁 ' : goal.kind === 'animation' ? '▶ ' : goal.kind === 'procedure' ? '📋 ' : goal.kind === 'scenario' ? '🔎 ' : '🎯 '}{label}</button>
}
