import type { DataBundle } from '../core/loadData'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import credits from '../../CREDITS.md?raw'

export function AboutModal({ data }: { data: DataBundle }) {
  const open = useAppStore(s => s.aboutOpen)
  const setOpen = useAppStore(s => s.setAboutOpen)
  const lang = useAppStore(s => s.lang)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{ui('about', lang)}</h2>
        <p className="disclaimer-inline">⚠ {ui('disclaimer', lang)}</p>
        <p>{ui('aboutText', lang)}</p>
        <h3>{ui('sources', lang)}</h3>
        <ul>
          {[...data.sources.values()].map(s => (
            <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title} <small>({s.type}, {s.accessed})</small></li>
          ))}
        </ul>
        <h3>CREDITS.md</h3>
        <pre className="credits">{credits}</pre>
        <button onClick={() => setOpen(false)}>{ui('close', lang)}</button>
      </div>
    </div>
  )
}
