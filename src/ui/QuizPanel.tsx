import { useEffect, useMemo, useState } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, fmt } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { isCorrect, scorePct } from '../core/progress'
import { worldPosition } from '../core/partGraph'

/** 小考：identify（3D 亮零件）、choice（選擇題）、order（排順序）。答完算分，≥ passPct 解鎖下一級。 */
export function QuizPanel({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const quiz = useAppStore(s => s.quiz)!
  const answerQuiz = useAppStore(s => s.answerQuiz)
  const nextQuiz = useAppStore(s => s.nextQuiz)
  const finishQuiz = useAppStore(s => s.finishQuiz)
  const exitQuiz = useAppStore(s => s.exitQuiz)
  const startQuiz = useAppStore(s => s.startQuiz)
  const focusOn = useAppStore(s => s.focusOn)

  const qs = useMemo(() => data.quizzes.filter(q => q.level === quiz.level), [data, quiz.level])
  const level = data.levels.find(l => l.id === quiz.level)!
  const q = qs[quiz.index]
  const given = quiz.answers[quiz.index]
  const [order, setOrder] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)

  // 換題：重設本題的暫存；identify 題把零件亮起來並對準鏡頭
  useEffect(() => {
    if (!q) return
    setPicked(null)
    setOrder(q.options.map((_, i) => i))
    if (q.type === 'identify' && q.part) {
      const w = worldPosition(data.graph, q.part)
      if (w) { useAppStore.getState().setBodyMode('xray'); focusOn(w, 1.1); useAppStore.setState({ selectedId: q.part }) }
    }
  }, [quiz.index, q, data, focusOn])

  if (quiz.done || !q) {
    const pct = scorePct(qs, quiz.answers)
    const passed = pct >= level.passPct
    return (
      <div className="quiz">
        <h3>{fmt(ui('quizTitle', lang), { l: quiz.level })}</h3>
        <div className={`score ${passed ? 'pass' : 'fail'}`}>{ui('score', lang)}：{pct}%</div>
        <p>{passed ? (quiz.level < 5 ? fmt(ui('unlocked', lang), { l: quiz.level + 1 }) : ui('passed', lang)) : fmt(ui('notPassed', lang), { p: level.passPct })}</p>
        <div className="guide-actions">
          {!passed && <button className="primary" onClick={() => startQuiz(quiz.level, qs.length)}>{ui('retry', lang)}</button>}
          <button onClick={exitQuiz}>{ui('backToLearn', lang)}</button>
        </div>
      </div>
    )
  }

  const answered = given != null
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= order.length) return; const o = [...order]; ;[o[i], o[j]] = [o[j], o[i]]; setOrder(o) }
  const submit = () => answerQuiz(q.type === 'order' ? order : (picked ?? -1))
  const next = () => { if (quiz.index + 1 >= qs.length) finishQuiz(scorePct(qs, quiz.answers)); else nextQuiz(qs.length) }
  const right = answered && isCorrect(q, given)

  return (
    <div className="quiz">
      <div className="guide-head">
        <strong>📝 {fmt(ui('quizTitle', lang), { l: quiz.level })}</strong>
        <button className="link" onClick={exitQuiz}>✕</button>
      </div>
      <div className="muted small">{fmt(ui('question', lang), { i: quiz.index + 1, n: qs.length })}</div>
      <h3>{t(q.prompt, lang)}</h3>
      {q.type === 'identify' && <p className="muted small">{ui('identifyHint', lang)}</p>}
      {q.type === 'order' && <p className="muted small">{ui('orderHint', lang)}</p>}

      {q.type !== 'order' ? (
        <ul className="options">
          {q.options.map((o, i) => (
            <li key={i}>
              <button
                className={`opt ${!answered && picked === i ? 'on' : ''} ${answered && i === q.answer ? 'right' : ''} ${answered && given === i && i !== q.answer ? 'wrong' : ''}`}
                disabled={answered} onClick={() => setPicked(i)}>
                <span className="n">{String.fromCharCode(65 + i)}</span>{t(o, lang)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="options order">
          {(answered ? (q.answer as number[]) : order).map((oi, i) => (
            <li key={oi}>
              <span className={`opt ${answered ? 'right' : ''}`}><span className="n">{i + 1}</span>{t(q.options[oi], lang)}</span>
              {!answered && <span className="updown"><button onClick={() => move(i, -1)} disabled={i === 0}>▲</button><button onClick={() => move(i, 1)} disabled={i === order.length - 1}>▼</button></span>}
            </li>
          ))}
        </ol>
      )}

      {answered && (
        <div className={`verdict ${right ? 'ok' : 'bad'}`}>
          <strong>{right ? '✓ ' + ui('correct', lang) : '✗ ' + ui('wrong', lang)}</strong>
          {!right && q.type === 'order' && <div className="muted small">{ui('correctAnswer', lang)}：{(q.answer as number[]).map(i => t(q.options[i], lang)).join(' → ')}</div>}
          <p>{t(q.explain, lang)}</p>
        </div>
      )}
      <div className="guide-actions">
        {!answered
          ? <button className="primary" disabled={q.type !== 'order' && picked == null} onClick={submit}>{ui('submit', lang)}</button>
          : <button className="primary" onClick={next}>{quiz.index + 1 >= qs.length ? ui('seeScore', lang) : ui('next', lang)} ›</button>}
      </div>
    </div>
  )
}
