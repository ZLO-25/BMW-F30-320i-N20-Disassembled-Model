import type { DataBundle } from '../core/loadData'
import { partName, t, ui, fmt, SYSTEM_NAMES, type Lang } from '../core/i18n'
import { descendants } from '../core/partGraph'
import { unitOf } from '../core/disassembly'
import { useAppStore } from '../store/useAppStore'
import { ConfidenceBadge, ConfidenceLegend } from './ConfidenceBadge'

function SourceLink({ id, data, lang }: { id: string | null; data: DataBundle; lang: Lang }) {
  if (!id) return null
  const s = data.sources.get(id)
  if (!s) return <span className="src">{ui('source', lang)}: {id}</span>
  return <a className="src" href={s.url ?? '#'} target="_blank" rel="noreferrer">{ui('source', lang)}: {s.title}</a>
}

const val = (v: number | string | null, unit: string | null, lang: Lang) =>
  v === null ? <em className="pending">{ui('pending', lang)}</em> : <strong>{v}{unit ? ` ${unit}` : ''}</strong>

export function InfoCard({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const selectedId = useAppStore(s => s.selectedId)
  const select = useAppStore(s => s.select)
  const teardown = useAppStore(s => s.teardown)
  const removedIds = useAppStore(s => s.removedIds)
  const tryRemove = useAppStore(s => s.tryRemove)
  const tryInstall = useAppStore(s => s.tryInstall)
  const toolsInHand = useAppStore(s => s.toolsInHand)
  const toggleTool = useAppStore(s => s.toggleTool)
  const part = selectedId ? data.graph.byId.get(selectedId) : undefined

  if (!part) return <div className="card empty"><p>{ui('selectHint', lang)}</p><ConfidenceLegend lang={lang} /></div>

  const ActionBar = () => {
    if (!part.removable) return <div className="actions"><span className="status fixed">🔒 {ui('statusFixed', lang)}</span></div>
    const removed = removedIds.has(part.id)
    const unit = removed ? unitOf(teardown, part.id) : undefined
    if (removed && unit && unit.root !== part.id) {
      const rp = data.graph.byId.get(unit.root)
      return <div className="actions"><span className="status removed">{fmt(ui('statusCarried', lang), { p: rp ? partName(rp.name) : unit.root })}</span>
        <button onClick={() => select(unit.root)}>→</button></div>
    }
    const carried = removed ? [] : descendants(data.graph, part.id).filter(d => !removedIds.has(d.id))
    return (
      <div className="actions">
        <span className={`status ${removed ? 'removed' : 'installed'}`}>{removed ? '📦 ' + ui('statusRemoved', lang) : '✔ ' + ui('statusInstalled', lang)}</span>
        {removed
          ? <button className="primary" onClick={() => tryInstall(data.graph, part.id)}>⤺ {ui('install', lang)}</button>
          : <button className="primary" onClick={() => tryRemove(data.graph, part.id)}>🔧 {ui('remove', lang)}</button>}
        {carried.length > 0 && <p className="muted small">{ui('removeEffect', lang)}{carried.slice(0, 6).map(c => t(c.name, lang)).join('、')}{carried.length > 6 ? ` …(+${carried.length - 6})` : ''}</p>}
      </div>
    )
  }

  const levelKey = (['level0', 'level1', 'level2', 'level3'] as const)[part.level]
  const toolName = (id: string) => { const tl = data.tools.get(id); return tl ? partName(tl.name) : id }

  return (
    <div className="card">
      <h2>{part.name.zh}<br /><small>{part.name.en}</small></h2>
      <div className="meta">
        <span>{ui('system', lang)}：{t(SYSTEM_NAMES[part.system], lang)}</span>
        <span>{ui('level', lang)}：{ui(levelKey, lang)}</span>
        <code>{part.id}</code>
      </div>
      {part.positionApproximate && <p className="note">{ui('positionApprox', lang)}</p>}

      <ActionBar />

      <section className="layer universal">
        <h3>{ui('universal', lang)}</h3>
        <p>{t(part.explain.universal, lang)}</p>
      </section>
      <section className="layer specific">
        <h3>{ui('specific', lang)}</h3>
        <p>{t(part.explain.specific, lang)}</p>
      </section>

      {part.specs.length > 0 && (
        <section>
          <h3>{ui('specs', lang)}</h3>
          <table><tbody>
            {part.specs.map(s => (
              <tr key={s.key}>
                <td>{t(s.label, lang)}</td>
                <td>{val(s.value, s.unit, lang)}</td>
                <td><ConfidenceBadge c={s.confidence} lang={lang} /><SourceLink id={s.source} data={data} lang={lang} /></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      <section>
        <h3>{ui('removal', lang)}</h3>
        <dl>
          <dt>{ui('requires', lang)}</dt>
          <dd>{part.removal.requires.length === 0 ? ui('none', lang) : part.removal.requires.map(r => {
            const rp = data.graph.byId.get(r)
            return <button key={r} className="chip" onClick={() => select(r)}>{rp ? partName(rp.name) : r}</button>
          })}</dd>
          <dt>{ui('tools', lang)}</dt>
          <dd>{part.removal.tools.length === 0 ? ui('none', lang) : part.removal.tools.map(x => (
            <button key={x} className={`chip plain tool ${toolsInHand.has(x) ? 'held' : ''}`} onClick={() => toggleTool(x)} title={ui('toolsInHandHint', lang)}>{toolsInHand.has(x) ? '✋ ' : '☐ '}{toolName(x)}</button>
          ))}</dd>
        </dl>
        {part.removal.fasteners.length > 0 && (
          <table><thead><tr><th>{ui('fasteners', lang)}</th><th>{ui('qty', lang)}</th><th>{ui('torque', lang)}</th><th></th></tr></thead><tbody>
            {part.removal.fasteners.map((f, i) => (
              <tr key={i} className={f.oneTimeUse ? 'one-time' : ''}>
                <td>{f.desc}{f.oneTimeUse && <span className="badge badge-onetime">{ui('oneTime', lang)}</span>}</td>
                <td>{f.qty ?? <em className="pending">{ui('pending', lang)}</em>}</td>
                <td>{val(f.torque_nm, 'Nm', lang)}</td>
                <td><ConfidenceBadge c={f.confidence} lang={lang} /><SourceLink id={f.source} data={data} lang={lang} /></td>
              </tr>
            ))}
          </tbody></table>
        )}
        {part.removal.warnings.length > 0 && (
          <>
            <h4>{ui('warnings', lang)}</h4>
            <ul className="warnings">{part.removal.warnings.map((w, i) => <li key={i}>{t(w, lang)}</li>)}</ul>
          </>
        )}
      </section>

      {part.partNumbers.length > 0 && (
        <section>
          <h3>{ui('partNumbers', lang)}</h3>
          <ul>{part.partNumbers.map((pn, i) => <li key={i}>{pn.number ?? <em className="pending">{ui('pending', lang)}</em>} <ConfidenceBadge c={pn.confidence} lang={lang} /><SourceLink id={pn.source} data={data} lang={lang} /></li>)}</ul>
        </section>
      )}

      {part.commonIssues.length > 0 && (
        <section>
          <h3>{ui('commonIssues', lang)}</h3>
          <ul>{part.commonIssues.map((c, i) => <li key={i}>{t(c, lang)}</li>)}</ul>
        </section>
      )}
      <ConfidenceLegend lang={lang} />
    </div>
  )
}
