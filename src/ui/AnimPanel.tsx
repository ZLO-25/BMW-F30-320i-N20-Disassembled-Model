import { useEffect, useRef } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, fmt } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { EngineRunPanel } from './EngineRunPanel'
import { animationsFor, ANIM_BY_ID, GEARS, MANUAL_RATIOS, MANUAL_RATIOS_NOTE, AUTO_RATIOS, AUTO_ELEMENTS } from '../scene/animations'

/** 側欄「動畫」分頁：選動畫、拉滑桿或選檔位，下面顯示現在這一段在做什麼 */
export function AnimPanel({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const variant = useAppStore(s => s.variant)
  const anim = useAppStore(s => s.anim)
  const setAnim = useAppStore(s => s.setAnim)
  // E4：動畫播放時 animT 每秒改二十幾次；面板只關心「現在在哪個階段」（整數），滑桿自己直接寫值，不重新渲染
  const phaseIdx = useAppStore(s => { const d = s.anim ? ANIM_BY_ID.get(s.anim) : undefined; return d?.phases ? d.phases.findIndex(p => s.animT < p.until) : -1 })
  const setAnimT = useAppStore(s => s.setAnimT)
  const playing = useAppStore(s => s.animPlaying)
  const setPlaying = useAppStore(s => s.setAnimPlaying)
  const gear = useAppStore(s => s.gear)
  const setGear = useAppStore(s => s.setGear)
  const focusOn = useAppStore(s => s.focusOn)
  const setCompareOpen = useAppStore(s => s.setCompareOpen)
  const removedIds = useAppStore(s => s.removedIds)
  const installAll = useAppStore(s => s.installAll)
  if (!variant) return null

  const list = animationsFor(variant)
  const def = anim ? ANIM_BY_ID.get(anim) : undefined
  const phase = phaseIdx >= 0 ? def?.phases?.[phaseIdx] : undefined
  // 動畫用到的零件如果已經拆下，動畫會缺角：提醒並提供一鍵裝回
  const missing = def ? def.parts.filter(p => removedIds.has(p)) : []

  const pick = (id: string | null) => {
    setAnim(id)
    if (!id) return
    const d = ANIM_BY_ID.get(id)!
    // 鏡頭對準這個動畫的第一個零件（用它在車上的世界座標）
    const first = d.parts.map(p => data.graph.byId.get(p)).find(Boolean)
    if (first) {
      let x = first.position.x, y = first.position.y, z = first.position.z
      let cur = first.parent ? data.graph.byId.get(first.parent) : undefined
      while (cur) { x += cur.position.x; y += cur.position.y; z += cur.position.z; cur = cur.parent ? data.graph.byId.get(cur.parent) : undefined }
      focusOn([x, y, z], d.id === 'power_path' ? 1.3 : d.id === 'engine_running' ? 0.95 : 0.75)
      // 只標示零件、不切到資訊頁（切頁會把動畫面板藏起來）
      useAppStore.setState({ selectedId: first.id })
    }
  }

  const ratios = variant === 'manual' ? MANUAL_RATIOS : AUTO_RATIOS
  return (
    <div className="anim">
      <div className="anim-list">
        {list.map(a => (
          <button key={a.id} className={`anim-item ${anim === a.id ? 'on' : ''}`} onClick={() => pick(anim === a.id ? null : a.id)}>
            <strong>{t(a.title, lang)}</strong>
          </button>
        ))}
        <button className="anim-item cmp-btn" onClick={() => setCompareOpen(true)}>⇄ {ui('compare', lang)}</button>
      </div>
      {def && (
        <div className="anim-body">
          <p>{t(def.desc, lang)}</p>
          <p className="muted small">{ui('animFocusHint', lang)}</p>
          {missing.length > 0 && <p className="anim-missing">⚠ {fmt(ui('animMissing', lang), { n: missing.length })} <button onClick={() => installAll(data.graph)}>⤺ {ui('installAll', lang)}</button></p>}
          {def.control === 'slider' && (
            <>
              <div className="anim-ctrl">
                <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚ ' + ui('pause', lang) : '▶ ' + ui('play', lang)}</button>
                <AnimSlider onUser={v => { setPlaying(false); setAnimT(v) }} />
              </div>
              {def.sliderLabels && <div className="anim-ends"><span>{t(def.sliderLabels[0], lang)}</span><span>{t(def.sliderLabels[1], lang)}</span></div>}
              {def.phases && (
                <ol className="phases">
                  {def.phases.map((p, i) => <li key={i} className={p === phase ? 'on' : ''}>{t(p.label, lang)}</li>)}
                </ol>
              )}
            </>
          )}
          {def.control === 'rpm' && <EngineRunPanel />}
          {def.control === 'gear' && (
            <>
              <div className="gear-row">
                <span>{ui('gearLabel', lang)}</span>
                {GEARS[variant].map(g => <button key={g} className={gear === g ? 'on' : ''} onClick={() => setGear(g)}>{g}</button>)}
              </div>
              <table className="gear-table"><tbody>
                <tr><td>{ui('ratio', lang)}</td><td>{gear === 'N' ? '—' : `${ratios[gear]?.toFixed(3)} : 1`}</td></tr>
                {variant === 'auto' && <tr><td>{ui('engaged', lang)}</td><td>{gear === 'N' ? '—' : AUTO_ELEMENTS[gear].split('').map(L => <span key={L} className={`chip plain el el-${L}`}>{L}{L === 'A' || L === 'B' ? ' (brake)' : ''}</span>)}</td></tr>}
              </tbody></table>
              <p className="muted small">{variant === 'manual' ? t(MANUAL_RATIOS_NOTE, lang) : ui('ratioSourceAuto', lang)}</p>
            </>
          )}
          <button className="link" onClick={() => pick(null)}>■ {ui('animNone', lang)}</button>
        </div>
      )}
    </div>
  )
}

/** 動畫進度滑桿：不訂閱 animT，改用 store.subscribe 直接寫 input.value（動畫不要每格 setState 的慣例） */
function AnimSlider({ onUser }: { onUser: (v: number) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const sync = (t: number) => { if (ref.current && document.activeElement !== ref.current) ref.current.value = String(t) }
    sync(useAppStore.getState().animT)
    return useAppStore.subscribe((s, prev) => { if (s.animT !== prev.animT) sync(s.animT) })
  }, [])
  return <input ref={ref} type="range" min={0} max={1} step={0.005} defaultValue={useAppStore.getState().animT} onChange={e => onUser(Number(e.target.value))} />
}
