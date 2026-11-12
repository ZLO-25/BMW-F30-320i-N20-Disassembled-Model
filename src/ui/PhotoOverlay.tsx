import { useState, type ChangeEvent } from 'react'
import { ui, fmt, type UiKey } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { useOverlayStore, overlayActive } from '../store/useOverlayStore'
import { readFocal35, DEFAULT_FOCAL35, FOCAL_RANGE, OVERLAY_VIEWS, type OverlayView } from '../core/photoOverlay'

const VIEW_KEY: Record<OverlayView, UiKey> = { left: 'overlayLeft', right: 'overlayRight', front: 'overlayFront', rear: 'overlayRear' }

/**
 * R6-B 實車照片疊圖（只在點開時載入，見 App 的 React.lazy）。
 *
 *   ┌ 3D 畫面 ───────────────────────────┐
 *   │   <canvas>（模型）                  │
 *   │   <img>（照片，半透明，蓋在上面，    │ ◄─ 不吃滑鼠，轉動鏡頭照常
 *   │          高度 = 畫面高度 × 縮放）   │
 *   │                          ┌ 面板 ┐ │
 *   └──────────────────────────┴──────┴─┘
 */
export default function PhotoOverlay() {
  return <><OverlayImage /><OverlayPanel /></>
}

function OverlayImage() {
  const active = useOverlayStore(overlayActive)
  const photo = useOverlayStore(s => s.photo)
  const s = useOverlayStore(s => s.settings)
  if (!active || !photo) return null
  return (
    <div className="photo-overlay-clip">
    <img className="photo-overlay" src={photo.url} alt="" draggable={false}
      style={{
        height: `${s.scale * 100}%`,
        opacity: s.opacity,
        mixBlendMode: s.blend,
        transform: `translate(calc(-50% + ${s.dx}%), calc(-50% + ${s.dy}%)) rotate(${s.rot}deg) scaleX(${s.flip ? -1 : 1})`,
      }} />
    </div>
  )
}

async function openPhoto(file: File) {
  const head = await file.slice(0, 256 * 1024).arrayBuffer()   // EXIF 在檔案開頭
  const exifFocal = readFocal35(head)
  const url = URL.createObjectURL(file)
  // 瀏覽器會依 EXIF 方向轉正圖片，naturalWidth/Height 是轉正後的大小
  const img = new Image()
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('not an image')); img.src = url })
    .catch(e => { URL.revokeObjectURL(url); throw e })
  return { url, name: file.name, w: img.naturalWidth, h: img.naturalHeight, exifFocal }
}

function OverlayPanel() {
  const lang = useAppStore(s => s.lang)
  const st = useOverlayStore()
  const { settings: s, photo, patch } = st
  const [mini, setMini] = useState(false)
  const [err, setErr] = useState(false)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { st.setPhoto(await openPhoto(f)); setErr(false) } catch { setErr(true) }
  }
  const focal = s.focal ?? photo?.exifFocal ?? DEFAULT_FOCAL35
  const slider = (key: UiKey, k: 'opacity' | 'scale' | 'dx' | 'dy' | 'rot', min: number, max: number, step: number, unit = '') => (
    <label className="slider">
      <span>{ui(key, lang)} <em>{Number(s[k].toFixed(2))}{unit}</em></span>
      <input type="range" min={min} max={max} step={step} value={s[k]} onChange={e => patch({ [k]: Number(e.target.value) })} />
    </label>
  )

  return (
    <div className={`photo-panel ${mini ? 'mini' : ''}`}>
      <div className="tools-head">
        <strong>📷 {ui('overlay', lang)}</strong>
        <span>
          <button onClick={() => setMini(!mini)} aria-label="minimise">{mini ? '▢' : '–'}</button>
          <button onClick={() => st.setPanelOpen(false)} aria-label="close">×</button>
        </span>
      </div>
      {!mini && <>
        <label className="file-btn">
          {ui('overlayPick', lang)}
          <input type="file" accept="image/*" onChange={onFile} />
        </label>
        {photo && <div className="muted small">{photo.name}（{photo.w} × {photo.h}）</div>}
        {err && <div className="warn small">{ui('overlayNotImage', lang)}</div>}
        <p className="muted small">{ui('overlayPrivacy', lang)}</p>
        {!photo && <p className="small">{ui('overlayHowTo', lang)}</p>}
        {photo && <>
          <label className="row">
            <span>{ui('overlayShow', lang)}</span>
            <input type="checkbox" checked={st.visible} onChange={e => st.setVisible(e.target.checked)} />
          </label>
          <div className="row">
            <span>{ui('overlayView', lang)}</span>
            <div className="seg">
              {OVERLAY_VIEWS.map(v => <button key={v} onClick={() => st.goView(v)}>{ui(VIEW_KEY[v], lang)}</button>)}
            </div>
          </div>
          <label className="slider">
            <span>{ui('overlayFocal', lang)} <em>{focal} mm</em></span>
            <input type="range" min={FOCAL_RANGE[0]} max={FOCAL_RANGE[1]} step={1} value={focal} onChange={e => patch({ focal: Number(e.target.value) })} />
          </label>
          <div className="muted small">
            {photo.exifFocal ? fmt(ui('overlayFocalExif', lang), { n: photo.exifFocal }) : fmt(ui('overlayFocalNone', lang), { n: DEFAULT_FOCAL35 })}
            {s.focal != null && photo.exifFocal != null && s.focal !== photo.exifFocal &&
              <> <button className="link" onClick={() => patch({ focal: null })}>{ui('overlayFocalUseExif', lang)}</button></>}
          </div>
          {slider('overlayOpacity', 'opacity', 0, 1, 0.05)}
          <div className="row">
            <span>{ui('overlayBlend', lang)}</span>
            <div className="seg">
              {(['normal', 'difference'] as const).map(b => (
                <button key={b} className={s.blend === b ? 'on' : ''} onClick={() => patch({ blend: b })}>
                  {ui(b === 'normal' ? 'overlayBlendNormal' : 'overlayBlendDiff', lang)}
                </button>
              ))}
            </div>
          </div>
          <details>
          <summary>{ui('overlayFine', lang)}</summary>
          {slider('overlayScale', 'scale', 0.3, 3, 0.01, '×')}
          <div className="muted small">{ui('overlayScaleNote', lang)}</div>
          {slider('overlayDx', 'dx', -50, 50, 0.5, '%')}
          {slider('overlayDy', 'dy', -50, 50, 0.5, '%')}
          {slider('overlayRot', 'rot', -15, 15, 0.1, '°')}
          <label className="row">
            <span>{ui('overlayFlip', lang)}</span>
            <input type="checkbox" checked={s.flip} onChange={e => patch({ flip: e.target.checked })} />
          </label>
          </details>
          <button onClick={st.resetSettings}>{ui('overlayReset', lang)}</button>
          <p className="small muted">{ui('overlayHowTo', lang)}</p>
        </>}
      </>}
    </div>
  )
}
