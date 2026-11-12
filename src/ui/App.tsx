import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { loadData } from '../core/loadData'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { Scene } from '../scene/Scene'
import { PartTree } from './PartTree'
import { InfoCard } from './InfoCard'
import { AboutModal } from './AboutModal'
import { Tray } from './Tray'
import { QualityToast } from './QualityToast'
import { Onboarding } from './Onboarding'
import { HintToast } from './HintToast'
import { ViewTools } from './ViewTools'
import { VariantModal } from './VariantModal'
import { AnimPanel } from './AnimPanel'
import { MistakeModal } from './MistakeModal'
import { BoltDialog } from './BoltDialog'
import { ErrorBoundary, webglSupported } from './ErrorBoundary'

// 審查 S3：點到才載入的面板（對照模式有第二個 Canvas；學習與保養帶著題庫與情境資料）
const CompareView = lazy(() => import('./CompareView').then(m => ({ default: m.CompareView })))
const LearnPanel = lazy(() => import('./LearnPanel').then(m => ({ default: m.LearnPanel })))
const MaintenancePanel = lazy(() => import('./MaintenancePanel').then(m => ({ default: m.MaintenancePanel })))
const WEBGL = webglSupported()

type TabId = 'tree' | 'info' | 'tray' | 'anim' | 'learn' | 'maint'
const TABS: { id: TabId; icon: string; key: 'tabTree' | 'info' | 'tray' | 'animations' | 'learn' | 'maint' }[] = [
  { id: 'tree', icon: '🌲', key: 'tabTree' }, { id: 'info', icon: 'ℹ️', key: 'info' }, { id: 'tray', icon: '📦', key: 'tray' },
  { id: 'anim', icon: '▶', key: 'animations' }, { id: 'learn', icon: '🎓', key: 'learn' }, { id: 'maint', icon: '🧰', key: 'maint' },
]

export function App() {
  const lang0 = useAppStore(s => s.lang)
  return <ErrorBoundary lang={lang0}><AppBody /></ErrorBoundary>
}

function AppBody() {
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
  const [moreOpen, setMoreOpen] = useState(false)
  // E5：手機上免責聲明可以關掉（桌機一律顯示；「關於」頁有全文）
  const [discHidden, setDiscHidden] = useState(() => { try { return localStorage.getItem('n20.disclaimer.v1') === '1' } catch { return false } })
  const dismissDisclaimer = () => { setDiscHidden(true); try { localStorage.setItem('n20.disclaimer.v1', '1') } catch { /* 存不了就下次再顯示 */ } }

  // E5：分頁用左右鍵切換（WAI-ARIA tablist）
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = TABS.findIndex(tb => tb.id === drawerTab)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    setDrawer(true, TABS[n].id)
    requestAnimationFrame(() => document.getElementById(`tab-${TABS[n].id}`)?.focus())
  }

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
        <h1><span className="title-full">{ui('appTitle', lang)}</span><span className="title-short">{ui('appTitleShort', lang)}</span></h1>
        <div className="topbar-actions">
          <div className="seg mode" role="group" aria-label={ui('modeLabel', lang)}>
            <button className={mode === 'inspect' ? 'on' : ''} onClick={() => setMode('inspect')} title={ui('modeInspect', lang)}>🔍<span className="hide-sm"> {ui('modeInspect', lang)}</span></button>
            <button className={mode === 'teardown' ? 'on' : ''} onClick={() => setMode('teardown')} title={ui('modeTeardown', lang)}>🔧<span className="hide-sm"> {ui('modeTeardown', lang)}</span></button>
          </div>
          <button onClick={undo} disabled={!canUndo} title={`${ui('undo', lang)} (Ctrl+Z)`} aria-label={ui('undo', lang)}>↶<span className="hide-sm"> {ui('undo', lang)}</span></button>
          <button onClick={redo} disabled={!canRedo} title={`${ui('redo', lang)} (Ctrl+Y)`} aria-label={ui('redo', lang)}>↷<span className="hide-sm"> {ui('redo', lang)}</span></button>
          {/* E5：手機上其餘的控制項收進「⋯」選單（桌機 display: contents，等於沒有這一層） */}
          <button className="more-btn" aria-expanded={moreOpen} aria-label={ui('moreMenu', lang)} onClick={() => setMoreOpen(o => !o)}>⋯</button>
          <div className={`topbar-more ${moreOpen ? 'open' : ''}`}>
            <div className="seg" role="group" aria-label={ui('variantLabel', lang)}>
              <span className="seg-label">{ui('variantLabel', lang)}</span>
              <button className={variant === 'manual' ? 'on' : ''} onClick={() => switchVariant('manual')}>{ui('variantManual', lang)}</button>
              <button className={variant === 'auto' ? 'on' : ''} onClick={() => switchVariant('auto')}>{ui('variantAuto', lang)}</button>
              <button onClick={() => setVariantModalOpen(true)} title={ui('chooseVariant', lang)}>?</button>
            </div>
            <div className="seg" role="group" aria-label={ui('body', lang)}>
              <span className="seg-label">{ui('body', lang)}</span>
              {(['solid', 'xray', 'hidden'] as const).map(m => (
                <button key={m} className={bodyMode === m ? 'on' : ''} onClick={() => setBodyMode(m)}>
                  {ui(m === 'solid' ? 'bodySolid' : m === 'xray' ? 'bodyXray' : 'bodyHidden', lang)}
                </button>
              ))}
            </div>
            <button onClick={() => { resetCamera(); setMoreOpen(false) }} title={ui('resetCamera', lang)}>⟲ {ui('resetCamera', lang)}</button>
            <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中'}</button>
            <button onClick={() => { setAboutOpen(true); setMoreOpen(false) }}>{ui('about', lang)}</button>
          </div>
        </div>
      </header>

      <div className={`disclaimer ${discHidden ? 'dismissed' : ''}`}>
        <span>⚠ {ui('disclaimer', lang)}</span>
        <button className="disc-x" onClick={dismissDisclaimer} aria-label={ui('disclaimerClose', lang)} title={ui('disclaimerClose', lang)}>×</button>
      </div>

      <main className="main">
        <div className="viewport">
          {WEBGL ? <Scene data={data} /> : <div className="nowebgl"><p>{ui('noWebgl', lang)}</p></div>}
          <HintToast data={data} />
          <QualityToast />
          <Onboarding />
          <ViewTools data={data} />
          <div className="touch-hint">{ui(mode === 'teardown' ? 'touchHintTeardown' : 'touchHint', lang)}</div>
        </div>

        <SideResizer label={ui('sideResize', lang)} />

        <aside className={`side ${drawerOpen ? 'open' : 'closed'}`}>
          <DrawerHandle />
          <div className="side-tabs" role="tablist" aria-label="panels" onKeyDown={onTabKey}>
            {TABS.map(tb => (
              <button key={tb.id} id={`tab-${tb.id}`} role="tab" aria-selected={drawerTab === tb.id} aria-controls={`pane-${tb.id}`} tabIndex={drawerTab === tb.id ? 0 : -1}
                className={drawerTab === tb.id ? 'on' : ''} onClick={() => setDrawer(true, tb.id)}>
                <span className="tab-ico" aria-hidden>{tb.icon}</span>
                <span className="tab-txt">{ui(tb.key, lang)}</span>
                {tb.id === 'tray' && trayCount > 0 && <span className="count">{trayCount}</span>}
              </button>
            ))}
            <button className="side-toggle" onClick={() => setDrawer(!drawerOpen)} aria-label="toggle">{drawerOpen ? '▾' : '▴'}</button>
          </div>
          <div className="side-body">
            <div id="pane-tree" role="tabpanel" aria-labelledby="tab-tree" className={`pane ${drawerTab === 'tree' ? 'show' : ''}`}><PartTree data={data} /></div>
            <div id="pane-info" role="tabpanel" aria-labelledby="tab-info" className={`pane ${drawerTab === 'info' ? 'show' : ''}`}>{drawerTab === 'info' && <InfoCard data={data} />}</div>
            <div id="pane-tray" role="tabpanel" aria-labelledby="tab-tray" className={`pane ${drawerTab === 'tray' ? 'show' : ''}`}>{drawerTab === 'tray' && <Tray data={data} />}</div>
            <div id="pane-anim" role="tabpanel" aria-labelledby="tab-anim" className={`pane ${drawerTab === 'anim' ? 'show' : ''}`}>{drawerTab === 'anim' && <AnimPanel data={data} />}</div>
            <div id="pane-learn" role="tabpanel" aria-labelledby="tab-learn" className={`pane ${drawerTab === 'learn' ? 'show' : ''}`}><Suspense fallback={<p className="muted">{ui('loading', lang)}</p>}>{drawerTab === 'learn' && <LearnPanel data={data} />}</Suspense></div>
            <div id="pane-maint" role="tabpanel" aria-labelledby="tab-maint" className={`pane ${drawerTab === 'maint' ? 'show' : ''}`}><Suspense fallback={<p className="muted">{ui('loading', lang)}</p>}>{drawerTab === 'maint' && <MaintenancePanel data={data} />}</Suspense></div>
          </div>
        </aside>
      </main>

      <AboutModal data={data} />
      <VariantModal />
      <Suspense fallback={null}><CompareView data={data} /></Suspense>
      <MistakeModal data={data} />
      <BoltDialog data={data} />
    </div>
  )
}

/** 手機版抽屜頂端的拖曳把手：上下拖調整高度（桌機版隱藏） */
/**
 * 桌機：3D 畫面和右側欄中間的分隔線，拖曳改側欄寬度（手機版用下方的 DrawerHandle 改高度）。
 * 寬度存在瀏覽器裡，下次打開還是同樣寬；雙擊回到預設 380px。
 */
const SIDE_KEY = 'n20.sideWidth.v1'
const SIDE_DEFAULT = 380
const clampSide = (w: number) => Math.round(Math.max(280, Math.min(w, window.innerWidth * 0.7, window.innerWidth - 320)))
function applySide(w: number) { document.documentElement.style.setProperty('--side-w', `${w}px`) }

function SideResizer({ label }: { label: string }) {
  const drag = useRef<{ x0: number; w0: number } | null>(null)
  useEffect(() => {
    let saved = 0
    try { saved = Number(localStorage.getItem(SIDE_KEY)) || 0 } catch { /* 讀不到就用預設 */ }
    if (saved) applySide(clampSide(saved))
  }, [])
  const save = (w: number) => { try { localStorage.setItem(SIDE_KEY, String(w)) } catch { /* 存不了也沒關係 */ } }
  const current = () => (document.querySelector('.side') as HTMLElement | null)?.getBoundingClientRect().width ?? SIDE_DEFAULT
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x0: e.clientX, w0: current() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
  }
  const widthAt = (e: React.PointerEvent) => clampSide(drag.current!.w0 + (drag.current!.x0 - e.clientX))   // 往左拖 = 側欄變寬
  const onMove = (e: React.PointerEvent) => { if (drag.current) applySide(widthAt(e)) }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const w = widthAt(e)
    drag.current = null
    document.body.classList.remove('resizing')
    applySide(w); save(w)
  }
  const reset = () => { applySide(SIDE_DEFAULT); save(SIDE_DEFAULT) }
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 60 : 20
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const w = clampSide(current() + (e.key === 'ArrowLeft' ? step : -step))
      applySide(w); save(w)
    }
  }
  return <div className="side-resizer" role="separator" aria-orientation="vertical" aria-label={label} title={label} tabIndex={0}
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={reset} onKeyDown={onKey} />
}

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
