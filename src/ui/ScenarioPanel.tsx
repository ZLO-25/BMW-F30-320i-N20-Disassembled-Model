import { useEffect, useMemo } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, fmt, partName } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { worldPosition } from '../core/partGraph'
import { nextRemovalStep, removalPlan } from '../core/disassembly'
import { scenarioPct } from '../core/progress'

const PHASES = ['scnPhaseAsk', 'scnPhaseCause', 'scnPhaseRemove', 'scnPhaseReplace', 'scnPhaseInstall'] as const

/**
 * 故障情境任務：問診 → 判斷 → 拆 → 換 → 裝回。
 *
 *   問診（選擇題，可重答）─► 判斷原因 ─► 拆到要換的零件（有「下一個拆誰」提示）
 *       ─► 按「裝上新零件」─► 托盤全部裝回 ─► 成績（第一次就答對的比例）
 */
export function ScenarioPanel({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const st = useAppStore(s => s.scenario)!
  const patch = useAppStore(s => s.patchScenario)
  const finish = useAppStore(s => s.finishScenario)
  const exit = useAppStore(s => s.exitScenario)
  const teardown = useAppStore(s => s.teardown)
  const removedIds = useAppStore(s => s.removedIds)
  const tryRemove = useAppStore(s => s.tryRemove)
  const focusOn = useAppStore(s => s.focusOn)
  const mistakesNow = useAppStore(s => s.progress.mistakes.length)

  const scn = data.scenarios.find(s => s.id === st.id)
  const name = (id: string) => partName(data.graph.byId.get(id)?.name ?? { zh: id, en: id })

  // 拆的階段：要換的零件都拆下 → 進「換」；裝回階段：托盤清空 → 結束
  useEffect(() => {
    if (!scn) return
    if (st.phase === 'remove' && scn.replace.every(r => removedIds.has(r))) patch({ phase: 'replace' })
    if (st.phase === 'install' && teardown.units.length === 0) finish(scenarioPct(st.firstTry))
  }, [st.phase, removedIds, teardown, scn, patch, finish, st.firstTry])

  const hint = useMemo(() => {
    if (!scn || st.phase !== 'remove') return null
    for (const r of scn.replace) { const n = nextRemovalStep(data.graph, teardown, r); if (n) return n }
    return null
  }, [scn, st.phase, data.graph, teardown])
  const left = useMemo(() => (scn && st.phase === 'remove' ? removalPlan(data.graph, teardown, scn.replace).order.length : 0), [scn, st.phase, data.graph, teardown])

  if (!scn) return <div className="guide"><button onClick={exit}>{ui('backToLearn', lang)}</button></div>

  const n = scn.questions.length
  const isCause = st.phase === 'ask' && st.step >= n
  const q = st.phase === 'ask' ? (isCause ? scn.cause : scn.questions[st.step]) : null
  const phaseIdx = st.phase === 'ask' ? (isCause ? 1 : 0) : st.phase === 'remove' ? 2 : st.phase === 'replace' ? 3 : st.phase === 'install' ? 4 : 5

  const pick = (i: number) => {
    if (!q || st.solved || st.wrong.includes(i)) return
    const right = i === q.answer
    const first = st.wrong.length === 0
    const firstTry = first ? [...st.firstTry, right] : st.firstTry
    patch(right ? { solved: true, firstTry } : { wrong: [...st.wrong, i], firstTry })
  }
  const nextQ = () => patch(st.step + 1 > n ? { phase: 'remove', step: st.step + 1, wrong: [], solved: false } : { step: st.step + 1, wrong: [], solved: false })
  const goHint = () => {
    if (!hint) return
    const w = worldPosition(data.graph, hint)
    if (w) focusOn(w, 1.0)
    useAppStore.setState({ selectedId: hint })
  }

  return (
    <div className="guide scenario">
      <div className="guide-head">
        <strong>🔎 {t(scn.title, lang)}</strong>
        <button className="link" onClick={exit}>✕ {ui('backToLearn', lang)}</button>
      </div>
      <ol className="scn-phases">
        {PHASES.map((k, i) => <li key={k} className={i < phaseIdx ? 'done' : i === phaseIdx ? 'on' : ''}>{i < phaseIdx ? '✓ ' : ''}{ui(k, lang)}</li>)}
      </ol>
      <div className="scn-symptom"><span className="muted small">{ui('scnSymptom', lang)}</span><p>{t(scn.symptom, lang)}</p></div>

      {q && (
        <div className="guide-step">
          <div className="muted small">{isCause ? ui('scnPhaseCause', lang) : `${ui('scnPhaseAsk', lang)} ${st.step + 1} / ${n}`}</div>
          <h3>{t(q.prompt, lang)}</h3>
          <ul className="options">
            {q.options.map((o, i) => (
              <li key={i}><button className={`opt ${st.solved && i === q.answer ? 'right' : ''} ${st.wrong.includes(i) ? 'wrong' : ''}`} disabled={st.solved || st.wrong.includes(i)} onClick={() => pick(i)}>
                <span className="n">{String.fromCharCode(65 + i)}</span>{t(o, lang)}</button></li>
            ))}
          </ul>
          {st.wrong.length > 0 && !st.solved && <p className="verdict bad">{ui('tryAgain', lang)}</p>}
          {st.solved && <div className="verdict ok"><strong>✓ {ui('correct', lang)}</strong><p>{t(q.explain, lang)}</p></div>}
          {st.solved && <div className="guide-actions"><button className="primary" onClick={nextQ}>{ui('next', lang)} ›</button></div>}
        </div>
      )}

      {st.phase === 'remove' && (
        <div className="guide-step">
          <p>{ui('scnRemoveIntro', lang)}</p>
          <h4>{ui('scnTargets', lang)}</h4>
          <ul className="scn-targets">{scn.replace.map(r => <li key={r} className={removedIds.has(r) ? 'done' : ''}>{removedIds.has(r) ? '✓' : '○'} {name(r)}</li>)}</ul>
          {hint && (
            <div className="scn-hint">
              <span>💡 {ui('scnNextHint', lang)}：<button className="link" onClick={goHint}><strong>{name(hint)}</strong></button></span>
              <button className="primary" onClick={() => { goHint(); tryRemove(data.graph, hint) }}>🔧 {ui('scnRemoveIt', lang)}</button>
            </div>
          )}
          <p className="muted small">{fmt(ui('scnStepsLeft', lang), { n: left })}</p>
        </div>
      )}

      {st.phase === 'replace' && (
        <div className="guide-step">
          <p className="note">🔧 {t(scn.replaceNote, lang)}</p>
          <div className="guide-actions"><button className="primary" onClick={() => patch({ phase: 'install' })}>✨ {ui('scnReplaceBtn', lang)}</button></div>
        </div>
      )}

      {st.phase === 'install' && (
        <div className="guide-step">
          <p>{ui('scnInstallIntro', lang)}</p>
          <p className="note">{t(scn.reassembleNote, lang)}</p>
          <p className="muted small">{fmt(ui('scnTrayLeft', lang), { n: teardown.units.length })}</p>
          <div className="guide-actions"><button onClick={() => useAppStore.getState().setDrawer(true, 'tray')}>📦 {ui('tray', lang)}</button></div>
        </div>
      )}

      {st.phase === 'done' && (
        <div className="guide-step guide-finish">
          <h3>🎉 {ui('scnDone', lang)}</h3>
          <div className={`score ${(st.pct ?? 0) >= 80 ? 'pass' : 'fail'}`}>{fmt(ui('scnScore', lang), { p: st.pct ?? 0 })}</div>
          <p className="muted small">{fmt(ui('scnMistakes', lang), { n: mistakesNow - st.mistakes0 })}</p>
          <button className="primary" onClick={exit}>{ui('backToLearn', lang)}</button>
        </div>
      )}

      {scn.sources.length > 0 && (
        <p className="muted small scn-src">{ui('scnSources', lang)}：{scn.sources.map((s, i) => { const so = data.sources.get(s); return <span key={s}>{i > 0 && '、'}{so?.url ? <a href={so.url} target="_blank" rel="noreferrer">{so.title}</a> : (so?.title ?? s)}</span> })}</p>
      )}
    </div>
  )
}
