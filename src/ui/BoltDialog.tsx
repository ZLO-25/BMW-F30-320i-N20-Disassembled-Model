import { useEffect, useMemo, useRef, useState } from 'react'
import type { DataBundle } from '../core/loadData'
import { partName, t, ui, type Lang } from '../core/i18n'
import { boltSteps, holdSeconds, torqueInfo, type BoltStep } from '../core/boltSteps'
import type { Fastener } from '../core/schema'
import { useAppStore } from '../store/useAppStore'
import { ConfidenceBadge } from './ConfidenceBadge'
import { SourceLink } from './InfoCard'

/**
 * R5 螺栓級拆裝對話框：一步一步做完才真的拆下 / 裝回。
 *
 *   [工具] ── 拿齊才能往下
 *   [鬆開 / 鎖上] ── 按住按鈕，進度條跑滿 = 這組螺絲處理完（模擬手感）
 *   [注意事項] ── 讀過打勾
 *   [取下 / 完成]
 */
export function BoltDialog({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const pb = useAppStore(s => s.pendingBolt)
  const cancel = useAppStore(s => s.cancelBolt)
  const finish = useAppStore(s => s.finishBolt)
  const toolsInHand = useAppStore(s => s.toolsInHand)
  const toggleTool = useAppStore(s => s.toggleTool)
  const part = pb ? data.graph.byId.get(pb.id) : undefined
  const steps = useMemo(() => (part && pb ? boltSteps(part, pb.action) : []), [part, pb])
  const [done, setDone] = useState<Set<number>>(new Set())
  const [replaced, setReplaced] = useState<Set<number>>(new Set())
  useEffect(() => { setDone(new Set()); setReplaced(new Set()) }, [pb])
  if (!pb || !part) return null

  const toolName = (id: string) => { const tl = data.tools.get(id); return tl ? partName(tl.name) : id }
  const stepDone = (i: number, s: BoltStep) =>
    s.kind === 'tools' ? s.tools.every(x => toolsInHand.has(x)) : done.has(i)
  // 一次性螺絲：裝回時要勾「已換新」
  const needReplace = (s: BoltStep) => s.kind === 'tighten' && s.fastener.oneTimeUse
  const current = steps.findIndex((s, i) => !stepDone(i, s) || (needReplace(s) && !replaced.has(i)))
  const allDone = current === -1
  const mark = (i: number) => setDone(d => new Set(d).add(i))

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal bolt-modal" onClick={e => e.stopPropagation()}>
        <h2>{pb.action === 'remove' ? '🔩 ' + ui('boltRemoveTitle', lang) : '🔧 ' + ui('boltInstallTitle', lang)}：{partName(part.name)}</h2>
        <ol className="bolt-steps">
          {steps.map((s, i) => {
            const state = stepDone(i, s) && !(needReplace(s) && !replaced.has(i)) ? 'done' : i === current ? 'now' : 'later'
            return (
              <li key={i} className={`bolt-step ${state}`}>
                {s.kind === 'tools' && (
                  <>
                    <strong>{ui('boltTools', lang)}</strong>
                    <div className="chips">
                      {s.tools.map(x => (
                        <button key={x} className={`chip plain tool ${toolsInHand.has(x) ? 'held' : ''}`} onClick={() => { if (!toolsInHand.has(x)) toggleTool(x) }}>
                          {toolsInHand.has(x) ? '✋ ' : '☐ '}{toolName(x)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {(s.kind === 'loosen' || s.kind === 'tighten') && (
                  <>
                    <strong>{ui(s.kind === 'loosen' ? 'boltLoosen' : 'boltTighten', lang)}：{s.fastener.desc}</strong>
                    <span className="muted"> × {s.fastener.qty ?? ui('pending', lang)}</span>
                    {s.kind === 'tighten' && <Torque f={s.fastener} data={data} lang={lang} />}
                    {s.fastener.oneTimeUse && <div className="bolt-warn">⚠ {ui('boltOneTime', lang)}</div>}
                    {s.multi && <div className="muted small">ⓘ {ui(s.kind === 'loosen' ? 'boltRuleLoosen' : 'boltRuleTighten', lang)}</div>}
                    {needReplace(s) && (
                      <label className="small"><input type="checkbox" checked={replaced.has(i)} disabled={i !== current && !replaced.has(i)}
                        onChange={e => setReplaced(r => { const n = new Set(r); if (e.target.checked) n.add(i); else n.delete(i); return n })} /> {ui('boltReplaced', lang)}</label>
                    )}
                    {!done.has(i) && <HoldButton seconds={holdSeconds(s)} disabled={i !== current} label={ui(s.kind === 'loosen' ? 'boltHoldLoosen' : 'boltHoldTighten', lang)} onDone={() => mark(i)} />}
                  </>
                )}
                {s.kind === 'warn' && (
                  <label><input type="checkbox" checked={done.has(i)} disabled={i !== current && !done.has(i)} onChange={() => mark(i)} /> ⚠ {t(s.text, lang)}</label>
                )}
                {s.kind === 'unknown' && (
                  <label><input type="checkbox" checked={done.has(i)} disabled={i !== current && !done.has(i)} onChange={() => mark(i)} /> {ui('boltUnknown', lang)}</label>
                )}
                {(s.kind === 'lift' || s.kind === 'place') && (
                  <label><input type="checkbox" checked={done.has(i)} disabled={i !== current && !done.has(i)} onChange={() => mark(i)} /> {ui(s.kind === 'lift' ? 'boltLift' : 'boltPlace', lang)}</label>
                )}
              </li>
            )
          })}
        </ol>
        <div className="guide-actions">
          <button className="primary" disabled={!allDone} onClick={() => finish(data.graph)}>
            ✓ {ui(pb.action === 'remove' ? 'boltFinishRemove' : 'boltFinishInstall', lang)}
          </button>
          <button className="link" onClick={cancel}>{ui('close', lang)}</button>
        </div>
        <p className="muted small">{ui('boltModeNote', lang)}</p>
      </div>
    </div>
  )

}

/** 鎖緊扭力：有來源才顯示數字，否則「待查證」 */
function Torque({ f, data, lang }: { f: Fastener; data: DataBundle; lang: Lang }) {
  const ti = torqueInfo(f)
  return (
    <div className="bolt-torque">
      {ui('boltTorque', lang)}：{ti.nm !== null ? <strong>{ti.nm} Nm</strong> : <em className="pending">{ui('pending', lang)}</em>}
      {ti.nm !== null && <> <ConfidenceBadge c={f.confidence} lang={lang} /> <SourceLink id={f.source} data={data} lang={lang} /></>}
      {ti.nm === null && <div className="muted small">{ui('boltTorqueUnknown', lang)}</div>}
      {f.spec && <div className="muted small">{f.spec}</div>}
    </div>
  )
}

/** 按住才會跑的進度按鈕：放開就歸零（像真的要一直出力轉） */
function HoldButton({ seconds, disabled, label, onDone }: { seconds: number; disabled: boolean; label: string; onDone: () => void }) {
  const [p, setP] = useState(0)
  const raf = useRef(0)
  const start = useRef(0)
  const stop = () => { cancelAnimationFrame(raf.current); setP(0) }
  const go = () => {
    if (disabled) return
    start.current = performance.now()
    const tick = () => {
      const k = (performance.now() - start.current) / 1000 / seconds
      if (k >= 1) { setP(1); onDone(); return }
      setP(k)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return (
    <button className="hold-btn" disabled={disabled}
      onPointerDown={go} onPointerUp={() => p < 1 && stop()} onPointerLeave={() => p < 1 && stop()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) go() }} onKeyUp={() => p < 1 && stop()}>
      <span className="hold-fill" style={{ width: `${p * 100}%` }} />
      <span className="hold-label">{label}</span>
    </button>
  )
}
