import type { DataBundle } from '../core/loadData'
import { t, ui, partName } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { triggerText } from './LearnPanel'

/**
 * 錯誤示範對話框：要拆的零件規則上拆得下來，但現在少了工具 / 少做一步。
 * 「照正確方式做」→ 幫你拿起工具（或帶你去該先處理的零件）；
 * 「故意做錯」→ 真的拆下、記一筆、提示列顯示後果（例如：沒鎖正時就拆，氣門撞活塞）。
 */
export function MistakeModal({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const pm = useAppStore(s => s.pendingMistake)
  const confirm = useAppStore(s => s.confirmMistake)
  const cancel = useAppStore(s => s.cancelMistake)
  const toggleTool = useAppStore(s => s.toggleTool)
  const tryRemove = useAppStore(s => s.tryRemove)
  const select = useAppStore(s => s.select)
  if (!pm) return null
  const part = data.graph.byId.get(pm.id)
  const sev = (s: 'info' | 'warning' | 'critical') => ui(s === 'critical' ? 'sevCritical' : s === 'warning' ? 'sevWarning' : 'sevInfo', lang)

  const doRight = () => {
    const toolsMissing = pm.mistakes.filter(m => m.toolId).map(m => m.toolId!)
    const partsFirst = pm.mistakes.filter(m => m.partId).map(m => m.partId!)
    cancel()
    if (partsFirst.length) { select(partsFirst[0]); return }
    // 只缺工具：拿起來再拆一次（這次就不會再跳）
    for (const tl of toolsMissing) if (!useAppStore.getState().toolsInHand.has(tl)) toggleTool(tl)
    tryRemove(data.graph, pm.id)
  }
  const onlyTools = pm.mistakes.every(m => m.toolId)
  const firstPart = pm.mistakes.find(m => m.partId)?.partId
  const firstPartName = firstPart ? partName(data.graph.byId.get(firstPart)?.name ?? { zh: firstPart, en: firstPart }) : ''

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal mistake-modal" onClick={e => e.stopPropagation()}>
        <h2>⚠ {ui('mistakeTitle', lang)}</h2>
        <p>{ui('mistakeIntro', lang)}<strong>{part ? partName(part.name) : pm.id}</strong></p>
        <ul className="mistake-list">
          {pm.mistakes.map(m => (
            <li key={m.trigger} className={`sev-${m.severity}`}>
              <span className="sev">{sev(m.severity)}</span>
              <strong>{triggerText(m.trigger, data, lang)}</strong>
              <div className="consequence">{ui('consequence', lang)}：{t(m.consequence, lang)}</div>
            </li>
          ))}
        </ul>
        <div className="guide-actions">
          <button className="primary" onClick={doRight}>✓ {onlyTools ? ui('takeToolAndGo', lang) : `${ui('goToPart', lang)}「${firstPartName}」`}</button>
          <button className="danger-btn" onClick={() => confirm(data.graph, lang)}>💥 {ui('doWrong', lang)}</button>
          <button className="link" onClick={cancel}>{ui('close', lang)}</button>
        </div>
      </div>
    </div>
  )
}
