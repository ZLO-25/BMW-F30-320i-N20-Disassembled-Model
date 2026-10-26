import { useEffect } from 'react'
import type { DataBundle } from '../core/loadData'
import { partName, ui, fmt } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

/** 3D 畫面上方的提示列：拆下 / 裝回成功，或被擋住時告訴你要先處理誰 */
export function HintToast({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const hint = useAppStore(s => s.hint)
  const clear = useAppStore(s => s.clearHint)
  const select = useAppStore(s => s.select)
  const setDrawer = useAppStore(s => s.setDrawer)

  useEffect(() => {
    if (!hint) return
    const ms = hint.kind === 'mistake' ? 12000 : hint.kind.startsWith('blocked') ? 7000 : 2800
    const t = setTimeout(clear, ms)
    return () => clearTimeout(t)
  }, [hint, clear])

  if (!hint) return null
  const name = (id: string) => { const p = data.graph.byId.get(id); return p ? partName(p.name) : id }
  const blocked = hint.kind.startsWith('blocked')
  return (
    <div className={`toast ${hint.kind === 'mistake' ? 'mistake' : blocked || hint.kind === 'fixed' ? 'warn' : 'ok'}`} role="status">
      {hint.kind === 'mistake' && <><strong>💥 {ui('hintMistake', lang)}{name(hint.target)}</strong><span className="toast-body">{hint.text}</span></>}
      {hint.kind === 'blocked_remove' && <><strong>{name(hint.target)}</strong>：{ui('hintBlockedRemove', lang)}</>}
      {hint.kind === 'blocked_install' && <><strong>{name(hint.target)}</strong>：{ui('hintBlockedInstall', lang)}</>}
      {hint.kind === 'fixed' && <>{ui('hintFixed', lang)}</>}
      {hint.kind === 'removed' && <>{ui('hintRemoved', lang)}<strong>{name(hint.target)}</strong>{hint.ids.length > 1 && fmt(ui('hintCarried', lang), { n: hint.ids.length - 1 })}</>}
      {hint.kind === 'installed' && <>{ui('hintInstalled', lang)}<strong>{name(hint.target)}</strong></>}
      {blocked && hint.ids.map(id => (
        <button key={id} className="chip danger" onClick={() => {
          select(id)
          if (hint.kind === 'blocked_install') setDrawer(true, 'tray')
        }}>{name(id)}</button>
      ))}
      <button className="toast-x" onClick={clear} aria-label="close">×</button>
    </div>
  )
}
