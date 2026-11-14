import { useEffect, useRef, useState } from 'react'
import { ui, fmt } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { shiftRequest, shiftStatus, MANUAL_RATIOS } from '../scene/animations'
import { shiftPhaseKey, REFUSAL_KEY, type Gear, type GearboxInputs } from '../core/gearbox'
import type { UiKey } from '../core/i18n'

const GEARS: Gear[] = ['R', 'N', '1', '2', '3', '4', '5', '6']
const inputs = (): GearboxInputs => {
  const s = useAppStore.getState()
  return { throttle: s.animT, clutchHeld: s.clutchHeld, brakeHeld: s.brakeHeld, autoClutch: s.autoClutch, slow: s.shiftSlow }
}

/** 手排換檔台的控制（G2 暫時版：按鈕 + 三組轉速 + 步驟說明；G3 換成 H 型圖與踏板）。判斷全在 core/gearbox.ts */
export function ShiftPanel() {
  const lang = useAppStore(s => s.lang)
  const autoClutch = useAppStore(s => s.autoClutch)
  const setAuto = useAppStore(s => s.setAutoClutch)
  const slow = useAppStore(s => s.shiftSlow)
  const setSlow = useAppStore(s => s.setShiftSlow)
  const setClutch = useAppStore(s => s.setClutchHeld)
  const setBrake = useAppStore(s => s.setBrakeHeld)
  const clutchHeld = useAppStore(s => s.clutchHeld)
  const brakeHeld = useAppStore(s => s.brakeHeld)
  const setT = useAppStore(s => s.setAnimT)
  const throttle = useAppStore(s => s.animT)
  const [, force] = useState(0)
  const [msg, setMsg] = useState<UiKey | null>(null)
  const msgTimer = useRef<number>(0)

  // 讀轉速與步驟：一秒 8 次就夠（不要每格 setState）
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 125)
    return () => { clearInterval(id); clearTimeout(msgTimer.current); useAppStore.getState().setClutchHeld(false); useAppStore.getState().setBrakeHeld(false) }
  }, [])

  const st = shiftStatus()
  const pick = (g: Gear) => {
    const r = shiftRequest(g, inputs())
    if (r !== 'ok') {
      setMsg(REFUSAL_KEY[r] as UiKey)
      clearTimeout(msgTimer.current); msgTimer.current = window.setTimeout(() => setMsg(null), 3000)
    } else setMsg(null)
  }
  const shown = st.shift ? st.shift.to : st.gear
  const ratio = shown === 'N' ? null : MANUAL_RATIOS[shown]
  const hold = (set: (v: boolean) => void) => ({
    onPointerDown: () => set(true), onPointerUp: () => set(false), onPointerLeave: () => set(false), onPointerCancel: () => set(false),
  })
  return (
    <div className="shift-panel">
      <table className="gear-table"><tbody>
        <tr><td>{ui('shiftEngine', lang)}</td><td>{Math.round(st.engineRpm).toLocaleString()} rpm</td></tr>
        <tr><td>{ui('shiftInput', lang)}</td><td>{Math.round(st.inputRpm).toLocaleString()} rpm</td></tr>
        <tr><td>{ui('shiftOutput', lang)}</td><td>{Math.round(st.outRpm).toLocaleString()} rpm</td></tr>
      </tbody></table>
      <p><strong>{shown === 'N' ? ui('shiftNowN', lang) : shown === 'R' ? ui('shiftNowR', lang) : fmt(ui('shiftNow', lang), { g: shown })}</strong>
        {ratio !== null && <span className="muted small"> · {fmt(ui('shiftRatioNow', lang), { r: Math.abs(ratio).toFixed(3) })}</span>}</p>
      <div className="gear-row">
        <span>{ui('shiftPickGear', lang)}</span>
        {GEARS.map(g => <button key={g} className={shown === g ? 'on' : ''} onClick={() => pick(g)}>{g}</button>)}
      </div>
      <div className="anim-ctrl">
        <span>{ui('shiftThrottle', lang)}</span>
        <input type="range" min={0} max={1} step={0.01} value={throttle} onChange={e => setT(Number(e.target.value))} aria-label={ui('shiftThrottle', lang)} />
      </div>
      <div className="row">
        <button className={clutchHeld ? 'on' : ''} {...hold(setClutch)}>{ui('shiftClutch', lang)}</button>
        <button className={brakeHeld ? 'on' : ''} {...hold(setBrake)}>{ui('shiftBrake', lang)}</button>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={autoClutch} onChange={e => setAuto(e.target.checked)} /> {ui('shiftAutoClutch', lang)}</label>
        <label><input type="checkbox" checked={slow} onChange={e => setSlow(e.target.checked)} /> {ui('shiftSlow', lang)}</label>
      </div>
      <p className="phase-now">{ui(('shiftStep_' + shiftPhaseKey(st)) as UiKey, lang)}</p>
      {msg && <p className="anim-missing">⚠ {ui(msg, lang)}</p>}
      <p className="muted small">{ui('shiftRatioNote', lang)} {ui('shiftNoteSchematic', lang)} {ui('shiftReverseNote', lang)}</p>
    </div>
  )
}
