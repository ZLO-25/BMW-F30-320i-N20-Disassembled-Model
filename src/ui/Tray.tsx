import type { DataBundle } from '../core/loadData'
import { partName, ui, fmt } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

/** 零件托盤：依拆下順序排列（最新的在最上面），點一下裝回 */
export function Tray({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const units = useAppStore(s => s.teardown.units)
  const hint = useAppStore(s => s.hint)
  const tryInstall = useAppStore(s => s.tryInstall)
  const installAll = useAppStore(s => s.installAll)
  const select = useAppStore(s => s.select)
  const blocked = new Set(hint?.kind === 'blocked_install' ? hint.ids : [])

  if (!units.length) return <div className="tray empty"><p>{ui('trayEmpty', lang)}</p></div>
  return (
    <div className="tray">
      <div className="tray-head">
        <p className="muted">{ui('trayHint', lang)}</p>
        <button onClick={() => installAll(data.graph)}>⤺ {ui('installAll', lang)}</button>
      </div>
      <ol reversed>
        {[...units].reverse().map((u, i) => {
          const p = data.graph.byId.get(u.root)
          const extra = u.members.length - 1
          return (
            <li key={u.root} className={`tray-item ${i === 0 ? 'top' : ''} ${blocked.has(u.root) ? 'blocked' : ''}`}>
              <button className="tray-main" onClick={() => tryInstall(data.graph, u.root)} title={ui('install', lang)}>
                <span className="tray-n">{units.length - i}</span>
                <span className="tray-name">{p ? partName(p.name) : u.root}
                  {extra > 0 && <small>{fmt(ui('withN', lang), { n: extra })}</small>}
                </span>
                <span className="tray-act">⤺ {ui('install', lang)}</span>
              </button>
              <button className="tray-info" onClick={() => select(u.root)} aria-label="info">ⓘ</button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
