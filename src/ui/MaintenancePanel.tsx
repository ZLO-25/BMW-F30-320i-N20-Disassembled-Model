import { useState } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, partName } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { worldPosition } from '../core/partGraph'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { Interval, Maintenance } from '../core/schema'

/**
 * 側欄「保養」分頁：14 項保養。每項分開列原廠建議與台灣保守建議（各自標可信度與來源），
 * 可以一鍵在 3D 對準零件，或直接開導覽。
 */
export function MaintenancePanel({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const variant = useAppStore(s => s.variant)
  const [open, setOpen] = useState<string | null>(null)
  const items = data.maintenance.filter(m => m.transmissionVariant === 'both' || m.transmissionVariant === variant)
  return (
    <div className="maint">
      <p className="muted small">{ui('maintIntro', lang)}</p>
      <ol className="maint-list">
        {items.map((m, i) => (
          <li key={m.id} className={`maint-item ${open === m.id ? 'on' : ''}`}>
            <button className="maint-head" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <span className="level-n">{i + 1}</span>
              <span className="level-title"><strong>{t(m.title, lang)}</strong>
                <small>{ui('intervalOem', lang)}：{shortText(m.interval.oem, lang)}　·　{ui('intervalTw', lang)}：{shortText(m.interval.taiwanConservative, lang)}</small>
              </span>
            </button>
            {open === m.id && <MaintBody data={data} m={m} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

const shortText = (iv: Interval, lang: 'zh' | 'en') => {
  // 沒有數字：沒來源 = 看狀況；有來源 = 原廠就是沒有固定週期
  if (iv.km == null && iv.months == null) return iv.confidence === 'unverified' ? (lang === 'zh' ? '看狀況' : 'by condition') : (lang === 'zh' ? '無固定週期' : 'no fixed interval')
  const parts: string[] = []
  if (iv.km != null) parts.push(`${iv.km.toLocaleString()} km`)
  if (iv.months != null) parts.push(lang === 'zh' ? `${iv.months} 個月` : `${iv.months} mo`)
  return parts.join(' / ')
}

function MaintBody({ data, m }: { data: DataBundle; m: Maintenance }) {
  const lang = useAppStore(s => s.lang)
  const startGuide = useAppStore(s => s.startGuide)
  const focusOn = useAppStore(s => s.focusOn)
  const setBodyMode = useAppStore(s => s.setBodyMode)
  const toolName = (id: string) => { const tl = data.tools.get(id); return tl ? partName(tl.name) : id }
  const src = (id: string | null) => {
    if (!id) return null
    const so = data.sources.get(id)
    return so?.url ? <a className="src" href={so.url} target="_blank" rel="noreferrer">{ui('source', lang)}：{so.title}</a> : <span className="src">{ui('source', lang)}：{so?.title ?? id}</span>
  }
  const show3d = () => {
    if (!m.focusPart) return
    const w = worldPosition(data.graph, m.focusPart)
    if (!w) return
    setBodyMode('xray')
    focusOn(w, 1.0)
    useAppStore.setState({ selectedId: m.focusPart })
  }
  return (
    <div className="maint-body card">
      <div className="layer universal"><h3>{ui('purpose', lang)}</h3><p>{t(m.purpose, lang)}</p></div>
      <div className="layer specific"><h3>{ui('f30Method', lang)}</h3><p>{t(m.f30Method, lang)}</p></div>
      <table className="interval-table"><tbody>
        {([['intervalOem', m.interval.oem], ['intervalTw', m.interval.taiwanConservative]] as const).map(([k, iv]) => (
          <tr key={k} className={k === 'intervalTw' ? 'tw' : 'oem'}>
            <th>{ui(k, lang)}</th>
            <td>{t(iv.text, lang)} <ConfidenceBadge c={iv.confidence} lang={lang} />{src(iv.source)}</td>
          </tr>
        ))}
      </tbody></table>
      <h3>{ui('tools', lang)}</h3>
      <div className="chips">{m.tools.length ? m.tools.map(x => <span key={x} className="chip plain">{toolName(x)}</span>) : <span className="muted">{ui('noTools', lang)}</span>}</div>
      {m.consumables.length > 0 && (
        <>
          <h3>{ui('consumables', lang)}</h3>
          <table><thead><tr><th>{ui('consumables', lang)}</th><th>{ui('spec', lang)}</th><th>{ui('amount', lang)}</th></tr></thead><tbody>
            {m.consumables.map((c, i) => (
              <tr key={i}><td>{t(c.name, lang)}</td>
                <td>{c.spec ?? <em className="pending">{ui('pending', lang)}</em>}</td>
                <td>{c.qty ?? <em className="pending">{ui('pending', lang)}</em>}{(c.spec || c.qty) && <> <ConfidenceBadge c={c.confidence} lang={lang} />{src(c.source)}</>}</td></tr>
            ))}
          </tbody></table>
        </>
      )}
      {m.warnings.length > 0 && <ul className="warnings">{m.warnings.map((w, i) => <li key={i}>⚠ {t(w, lang)}</li>)}</ul>}
      <div className="guide-actions">
        {m.focusPart && <button onClick={show3d}>🎯 {ui('showIn3d', lang)}</button>}
        {m.procedure ? <button className="primary" onClick={() => startGuide(m.procedure!)}>📋 {ui('guideMe', lang)}</button> : <span className="muted small">{ui('noGuide', lang)}</span>}
      </div>
    </div>
  )
}
