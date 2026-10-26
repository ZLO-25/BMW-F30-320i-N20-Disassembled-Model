import { useEffect, useMemo, useRef } from 'react'
import { loadData } from '../core/loadData'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { Scene } from '../scene/Scene'
import { PartTree } from './PartTree'
import { InfoCard } from './InfoCard'
import { AboutModal } from './AboutModal'
import { Tray } from './Tray'
import { HintToast } from './HintToast'
import { ViewTools } from './ViewTools'
import { VariantModal } from './VariantModal'
import { AnimPanel } from './AnimPanel'
import { CompareView } from './CompareView'
import { LearnPanel } from './LearnPanel'
import { MistakeModal } from './MistakeModal'
import { MaintenancePanel } from './MaintenancePanel'

export function App() {
  const variant = useAppStore(s => s.variant)
  const data = useMemo(() => loadData(variant ?? 'auto'), [variant])
  const lang = useAppStore(s => s.lang)
  const setVariant = useAppStore(s => s.setVariant)
  const setVariantModalOpen = useAppStore(s => s.setVariantModalOpen)
  const trayCountForSwitch = useAppStore(s => s.teardown.units.length)
  const switchVariant = (v: 'manual' | 'auto') => {
    if (v === variant) return
    if (trayCountForSwitch > 0 && !window.confirm(ui('switchVariantConfirm', lang))) return
    setVariant(v)
  }
  const setLang = useAppStore(s => s.setLang)
  const bodyMode = useAppStore(s => s.bodyMode)
  const setBodyMode = useAppStore(s => s.setBodyMode)
  const resetCamera = useAppStore(s => s.resetCamera)
  const drawerOpen = useAppStore(s => s.drawerOpen)
  const drawerTab = useAppStore(s => s.drawerTab)
  const setDrawer = useAppStore(s => s.setDrawer)
  const setAboutOpen = useAppStore(s => s.setAboutOpen)
  const mode = useAppStore(s => s.mode)
  const setMode = useAppStore(s => s.setMode)
  const undo = useAppStore(s => s.undo)
  const redo = useAppStore(s => s.redo)
  const canUndo = useAppStore(s => s.history.length > 0)
  const canRedo = useAppStore(s => s.future.length > 0)
  const trayCount = useAppStore(s => s.teardown.units.length)

  // 鍵盤：Ctrl+Z 復原、Ctrl+Shift+Z / Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="app">
      <header className="topbar">
        <h1>{ui('appTitle', lang)}</h1>
        <div className="topbar-actions">
          <div className="seg" role="group" aria-label={ui('variantLabel', lang)}>
            <span className="seg-label">{ui('variantLabel', lang)}</span>
            <button className={variant === 'manual' ? 'on' : ''} onClick={() => switchVariant('manual')}>{ui('variantManual', lang)}</button>
            <button className={variant === 'auto' ? 'on' : ''} onClick={() => switchVariant('auto')}>{ui('variantAuto', lang)}</button>
            <button onClick={() => setVariantModalOpen(true)} title={ui('chooseVariant', lang)}>?</button>
          </div>
          <div className="seg mode" role="group" aria-label={ui('modeLabel', lang)}>
            <button className={mode === 'inspect' ? 'on' : ''} onClick={() => setMode('inspect')}>🔍 {ui('modeInspect', lang)}</button>
            <button className={mode === 'teardown' ? 'on' : ''} onClick={() => setMode('teardown')}>🔧 {ui('modeTeardown', lang)}</button>
          </div>
          <button onClick={undo} disabled={!canUndo} title={`${ui('undo', lang)} (Ctrl+Z)`}>↶<span className="hide-sm"> {ui('undo', lang)}</span></button>
          <button onClick={redo} disabled={!canRedo} title={`${ui('redo', lang)} (Ctrl+Y)`}>↷<span className="hide-sm"> {ui('redo', lang)}</span></button>
          <div className="seg" role="group" aria-label={ui('body', lang)}>
            <span className="seg-label">{ui('body', lang)}</span>
            {(['solid', 'xray', 'hidden'] as const).map(m => (
              <button key={m} className={bodyMode === m ? 'on' : ''} onClick={() => setBodyMode(m)}>
                {ui(m === 'solid' ? 'bodySolid' : m === 'xray' ? 'bodyXray' : 'bodyHidden', lang)}
              </button>
            ))}
          </div>
          <button onClick={resetCamera} title={ui('resetCamera', lang)}>⟲<span className="hide-sm"> {ui('resetCamera', lang)}</span></button>
          <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中'}</button>
          <button onClick={() => setAboutOpen(true)}>{ui('about', lang)}</button>
        </div>
      </header>

      <div className="disclaimer">⚠ {ui('disclaimer', lang)}</div>

      <main className="main">
        <div className="viewport">
          <Scene data={data} />
          <HintToast data={data} />
          <ViewTools data={data} />
          <div className="touch-hint">{ui(mode === 'teardown' ? 'touchHintTeardown' : 'touchHint', lang)}</div>
        </div>

        <aside className={`side ${drawerOpen ? 'open' : 'closed'}`}>
          <DrawerHandle />
          <div className="side-tabs">
            <button className={drawerTab === 'tree' ? 'on' : ''} onClick={() => setDrawer(true, 'tree')}>{ui('partTree', lang)}</button>
            <button className={drawerTab === 'info' ? 'on' : ''} onClick={() => setDrawer(true, 'info')}>{ui('info', lang)}</button>
            <button className={drawerTab === 'tray' ? 'on' : ''} onClick={() => setDrawer(true, 'tray')}>
              {ui('tray', lang)}{trayCount > 0 && <span className="count">{trayCount}</span>}
            </button>
            <button className={drawerTab === 'anim' ? 'on' : ''} onClick={() => setDrawer(true, 'anim')}>▶ {ui('animations', lang)}</button>
            <button className={drawerTab === 'learn' ? 'on' : ''} onClick={() => setDrawer(true, 'learn')}>🎓 {ui('learn', lang)}</button>
            <button className={drawerTab === 'maint' ? 'on' : ''} onClick={() => setDrawer(true, 'maint')}>🧰 {ui('maint', lang)}</button>
            <button className="side-toggle" onClick={() => setDrawer(!drawerOpen)} aria-label="toggle">{drawerOpen ? '▾' : '▴'}</button>
          </div>
          <div className="side-body">
            <div className={`pane ${drawerTab === 'tree' ? 'show' : ''}`}><PartTree data={data} /></div>
            <div className={`pane ${drawerTab === 'info' ? 'show' : ''}`}><InfoCard data={data} /></div>
            <div className={`pane ${drawerTab === 'tray' ? 'show' : ''}`}><Tray data={data} /></div>
            <div className={`pane ${drawerTab === 'anim' ? 'show' : ''}`}><AnimPanel data={data} /></div>
            <div className={`pane ${drawerTab === 'learn' ? 'show' : ''}`}><LearnPanel data={data} /></div>
            <div className={`pane ${drawerTab === 'maint' ? 'show' : ''}`}><MaintenancePanel data={data} /></div>
          </div>
        </aside>
      </main>

      <AboutModal data={data} />
      <VariantModal />
      <CompareView data={data} />
      <MistakeModal data={data} />
    </div>
  )
}

/** 手機版抽屜頂端的拖曳把手：上下拖調整高度（桌機版隱藏） */
function DrawerHandle() {
  const setH = useAppStore(s => s.setDrawerHeight)
  const h = useAppStore(s => s.drawerHeight)
  const drag = useRef<{ y0: number; h0: number } | null>(null)
  useEffect(() => {
    const el = document.documentElement
    if (h > 0) el.style.setProperty('--drawer-h', `${h}px`)
  }, [h])
  const onDown = (e: React.PointerEvent) => {
    const side = (e.currentTarget.parentElement as HTMLElement)
    drag.current = { y0: e.clientY, h0: side.getBoundingClientRect().height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const next = Math.max(120, Math.min(window.innerHeight * 0.85, drag.current.h0 + (drag.current.y0 - e.clientY)))
    document.documentElement.style.setProperty('--drawer-h', `${next}px`)
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const next = Math.max(120, Math.min(window.innerHeight * 0.85, drag.current.h0 + (drag.current.y0 - e.clientY)))
    drag.current = null
    setH(next)
  }
  return <div className="drawer-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="resize"><span /></div>
}
