import { useEffect } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, fmt, partName } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { worldPosition } from '../core/partGraph'
import { ConfidenceBadge } from './ConfidenceBadge'

/**
 * 導覽面板：一次一步。每一步顯示要用的工具、扭力（沒查證就寫待查證）、注意事項。
 * remove / install 的步驟按「做這一步」會真的去動 3D（照規則拆裝，工具自動拿在手上，所以不會跳錯誤示範）。
 * 這一步做好了（零件已經在托盤 / 已裝回）會自動變成「已完成」。
 */
export function GuidePanel({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const guide = useAppStore(s => s.guide)!
  const setStep = useAppStore(s => s.setGuideStep)
  const exitGuide = useAppStore(s => s.exitGuide)
  const finishGuide = useAppStore(s => s.finishGuide)
  const removedIds = useAppStore(s => s.removedIds)
  const tryRemove = useAppStore(s => s.tryRemove)
  const tryInstall = useAppStore(s => s.tryInstall)
  const focusOn = useAppStore(s => s.focusOn)
  const progress = useAppStore(s => s.progress)

  const proc = data.procedures.find(p => p.id === guide.procId)
  const finished = proc ? guide.step >= proc.steps.length : true
  const step = proc && !finished ? proc.steps[guide.step] : null

  // 進到某一步時，鏡頭對準這一步的零件並標示它（不切分頁，導覽面板要留著）
  useEffect(() => {
    if (!step?.part) return
    const w = worldPosition(data.graph, step.part)
    if (w) { focusOn(w, 0.9); useAppStore.setState({ selectedId: step.part }) }
  }, [guide.step, step?.part, data, focusOn])

  if (!proc) return <div className="guide"><button onClick={exitGuide}>{ui('exitGuide', lang)}</button></div>

  const toolName = (id: string) => { const tl = data.tools.get(id); return tl ? partName(tl.name) : id }
  const stepState = (i: number): 'done' | 'todo' | 'manual' => {
    const s = proc.steps[i]
    if (s.action === 'remove') return s.part && removedIds.has(s.part) ? 'done' : 'todo'
    // 裝回：零件在車上「而且」導覽已經走到這一步，才算做完（不然一開始還沒拆就會全部打勾）
    if (s.action === 'install') return s.part && !removedIds.has(s.part) && i <= guide.step ? 'done' : 'todo'
    return i < guide.step ? 'done' : 'manual'
  }
  const doStep = () => {
    if (!step?.part) return
    // 導覽裡用到的工具自動拿在手上（教的是「正確做法」）
    const st = useAppStore.getState()
    const hand = new Set(st.toolsInHand); for (const tl of step.tools) hand.add(tl)
    useAppStore.setState({ toolsInHand: hand })
    if (step.action === 'remove') tryRemove(data.graph, step.part, { skipMistakes: true })
    else tryInstall(data.graph, step.part)
  }
  const cur = step ? stepState(guide.step) : 'done'
  const alreadyDone = progress.completedProcedures.includes(proc.id)

  return (
    <div className="guide">
      <div className="guide-head">
        <strong>📋 {t(proc.title, lang)}</strong>
        <button className="link" onClick={exitGuide}>✕ {ui('exitGuide', lang)}</button>
      </div>
      {guide.step === 0 && <p className="guide-intro">{t(proc.intro, lang)}</p>}
      <ol className="guide-steps">
        {proc.steps.map((s, i) => (
          <li key={i} className={`${i === guide.step ? 'on' : ''} ${stepState(i) === 'done' ? 'done' : ''}`} onClick={() => setStep(i)}>
            <span className="n">{stepState(i) === 'done' ? '✓' : i + 1}</span>{t(s.title, lang)}
          </li>
        ))}
      </ol>

      {step ? (
        <div className={`guide-step act-${step.action}`}>
          <div className="muted small">{fmt(ui('stepOf', lang), { i: guide.step + 1, n: proc.steps.length })}</div>
          <h3>{t(step.title, lang)}</h3>
          {step.part && <p className="guide-part">🔩 {partName(data.graph.byId.get(step.part)?.name ?? { zh: step.part, en: step.part })}</p>}
          <dl>
            <dt>{ui('tools', lang)}</dt>
            <dd>{step.tools.length === 0 ? ui('noTools', lang) : step.tools.map(x => <span key={x} className="chip plain">{toolName(x)}</span>)}</dd>
            {step.torque && (
              <>
                <dt>{ui('torque', lang)}</dt>
                <dd>{step.torque.value == null ? <em className="pending">{ui('torqueUnverified', lang)}</em> : <>{step.torque.value} {step.torque.unit} <ConfidenceBadge c={step.torque.confidence} lang={lang} /></>}</dd>
              </>
            )}
          </dl>
          {step.note && <p className="note">💡 {t(step.note, lang)}</p>}
          {step.warning && <p className="guide-warn">⚠ {t(step.warning, lang)}</p>}
          <div className="guide-actions">
            <button onClick={() => setStep(Math.max(0, guide.step - 1))} disabled={guide.step === 0}>‹ {ui('prev', lang)}</button>
            {(step.action === 'remove' || step.action === 'install') && cur === 'todo' && <button className="primary" onClick={doStep}>{step.action === 'remove' ? '🔧' : '⤺'} {ui('doStep', lang)}</button>}
            {(step.action === 'remove' || step.action === 'install') && cur === 'done' && <span className="muted small">✓ {ui('stepAlready', lang)}</span>}
            <button className={cur === 'done' || cur === 'manual' ? 'primary' : ''} onClick={() => setStep(guide.step + 1)}>{cur === 'manual' ? ui('markDone', lang) : ui('next', lang)} ›</button>
          </div>
        </div>
      ) : (
        <div className="guide-step guide-finish">
          <h3>🎉 {ui('guideFinished', lang)}</h3>
          <button className="primary" onClick={() => finishGuide(proc.id)}>{alreadyDone ? ui('backToLearn', lang) : ui('finishGuide', lang)}</button>
        </div>
      )}
    </div>
  )
}
