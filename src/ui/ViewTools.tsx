import { useMemo } from 'react'
import type { DataBundle } from '../core/loadData'
import { t, ui, SUBSYSTEM_NAMES } from '../core/i18n'
import { useAppStore, type SysVis } from '../store/useAppStore'

const SECTION_RANGE = { x: [0.5, 2.3], z: [-0.55, 0.55] } as const
const SECTION_DEFAULT = { x: 1.15, z: 0 }

/** 浮在 3D 畫面左下角的檢視工具：爆炸圖、剖面、各系統顯示/半透明/隱藏/隔離 */
export function ViewTools({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const open = useAppStore(s => s.toolsOpen)
  const setOpen = useAppStore(s => s.setToolsOpen)
  const explode = useAppStore(s => s.explode)
  const setExplode = useAppStore(s => s.setExplode)
  const axis = useAppStore(s => s.sectionAxis)
  const pos = useAppStore(s => s.sectionPos)
  const setSection = useAppStore(s => s.setSection)
  const sysVis = useAppStore(s => s.sysVis)
  const setSysVis = useAppStore(s => s.setSysVis)
  const isolate = useAppStore(s => s.isolate)

  const subs = useMemo(() => {
    const seen = new Set<string>()
    // 用過濾後的圖，手排模式就不會列出自排的子系統
    for (const p of data.graph.byId.values()) if (p.subsystem !== 'root' && p.system !== 'body') seen.add(p.subsystem)
    return [...seen]
  }, [data.graph])

  if (!open) return <button className="tools-fab" onClick={() => setOpen(true)}>🛠 {ui('viewTools', lang)}</button>

  const cycle: SysVis[] = ['show', 'ghost', 'hide']
  return (
    <div className="tools-panel">
      <div className="tools-head">
        <strong>🛠 {ui('viewTools', lang)}</strong>
        <button onClick={() => setOpen(false)} aria-label="close">×</button>
      </div>
      <label className="slider">
        <span>{ui('explode', lang)}</span>
        <input type="range" min={0} max={1} step={0.01} value={explode} onChange={e => setExplode(Number(e.target.value))} />
      </label>
      <div className="row">
        <span>{ui('section', lang)}</span>
        <div className="seg">
          {(['off', 'x', 'z'] as const).map(a => (
            <button key={a} className={axis === a ? 'on' : ''} onClick={() => setSection(a, a === 'off' ? pos : SECTION_DEFAULT[a])}>
              {ui(a === 'off' ? 'sectionOff' : a === 'x' ? 'sectionX' : 'sectionZ', lang)}
            </button>
          ))}
        </div>
      </div>
      {axis !== 'off' && (
        <label className="slider">
          <span />
          <input type="range" min={SECTION_RANGE[axis][0]} max={SECTION_RANGE[axis][1]} step={0.005} value={pos} onChange={e => setSection(axis, Number(e.target.value))} />
        </label>
      )}
      <div className="row"><span>{ui('systems', lang)}</span><button className="link" onClick={() => isolate(null, subs)}>{ui('showAll', lang)}</button></div>
      <ul className="sys-list">
        {subs.map(sub => {
          const v = sysVis[sub] ?? 'show'
          return (
            <li key={sub}>
              <span>{t(SUBSYSTEM_NAMES[sub] ?? { zh: sub, en: sub }, lang)}</span>
              <button className={`vis vis-${v}`} onClick={() => setSysVis(sub, cycle[(cycle.indexOf(v) + 1) % 3])}>
                {ui(v === 'show' ? 'visShow' : v === 'ghost' ? 'visGhost' : 'visHide', lang)}
              </button>
              <button className="link" onClick={() => isolate(sub, subs)}>{ui('isolate', lang)}</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
