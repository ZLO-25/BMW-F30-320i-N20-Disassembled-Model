import { useEffect, useRef, useState } from 'react'
import { ui, fmt, type UiKey } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'
import { shiftRequest, shiftStatus, MANUAL_RATIOS } from '../scene/animations'
import { shiftPhaseKey, REFUSAL_KEY, REDLINE, type Gear, type GearboxInputs, type ShiftPhaseKey } from '../core/gearbox'
import { CHALLENGES, observeChallenges, newChallengeState, loadChallenges, saveChallenges, type ChallengeState } from '../core/shiftChallenges'
import { startEngineSound, stopEngineSound, setEngineRpm } from '../scene/engineSound'

const inputs = (): GearboxInputs => {
  const s = useAppStore.getState()
  return { throttle: s.animT, clutchHeld: s.clutchHeld, brakeHeld: s.brakeHeld, autoClutch: s.autoClutch, slow: s.shiftSlow }
}
const STEPS: ShiftPhaseKey[] = ['wait_clutch', 'to_neutral', 'sync', 'engage', 'pedal']
/** H 型排檔圖：上排 R 1 3 5、下排 2 4 6，中間一條 N。R 放 1 檔左邊只是排版，實車位置未確認 */
const GATE_TOP: Gear[] = ['R', '1', '3', '5']
const GATE_BOTTOM: (Gear | null)[] = [null, '2', '4', '6']
const KEY_GEAR: Record<string, Gear> = { r: 'R', n: 'N', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6' }

function Bar({ label, rpm }: { label: string; rpm: number }) {
  const v = Math.max(0, Math.min(1, Math.abs(rpm) / REDLINE))
  return (
    <div className="rpm-row">
      <span className="rpm-label">{label}</span>
      <span className="rpm-bar"><i style={{ width: `${v * 100}%` }} className={v > 0.93 ? 'hot' : ''} /></span>
      <span className="rpm-val">{Math.round(rpm).toLocaleString()} rpm</span>
    </div>
  )
}

/** 手排換檔台的控制。判斷全在 core/gearbox.ts，這裡只呼叫 shiftRequest 與顯示結果 */
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
  const [sound, setSound] = useState(false)
  const msgTimer = useRef<number>(0)
  const chRef = useRef<ChallengeState>(newChallengeState(loadChallenges()))
  const soundRef = useRef(false)
  soundRef.current = sound

  // 讀轉速與步驟：一秒 8 次就夠（不要每格 setState）
  useEffect(() => {
    const id = setInterval(() => {
      if (soundRef.current) setEngineRpm(shiftStatus().engineRpm)
      const next = observeChallenges(chRef.current, shiftStatus(), useAppStore.getState().autoClutch)
      if (next.done.length !== chRef.current.done.length) saveChallenges(next.done)
      chRef.current = next
      force(n => n + 1)
    }, 125)
    return () => {
      clearInterval(id); clearTimeout(msgTimer.current); stopEngineSound()
      useAppStore.getState().setClutchHeld(false); useAppStore.getState().setBrakeHeld(false)
    }
  }, [])
  useEffect(() => { if (sound) startEngineSound(shiftStatus().engineRpm); else stopEngineSound() }, [sound])

  const st = shiftStatus()
  const pick = (g: Gear) => {
    const r = shiftRequest(g, inputs())
    if (r !== 'ok') {
      setMsg(REFUSAL_KEY[r] as UiKey)
      clearTimeout(msgTimer.current); msgTimer.current = window.setTimeout(() => setMsg(null), 3000)
    } else setMsg(null)
  }
  const shown: Gear = st.shift ? st.shift.to : st.gear
  const ratio = shown === 'N' ? null : MANUAL_RATIOS[shown]
  const key = shiftPhaseKey(st)
  const hold = (set: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); set(true) },
    onPointerUp: () => set(false), onPointerLeave: () => set(false), onPointerCancel: () => set(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
  const gateBtn = (g: Gear) => (
    <button key={g} className={`gate-btn ${st.gear === g && st.locked ? 'cur' : ''} ${shown === g ? 'on' : ''}`} onClick={() => pick(g)}>{g}</button>
  )
  // 鍵盤只掛在面板根元素，不掛 window，避免和分頁左右鍵、復原鍵衝突
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === ' ') { e.preventDefault(); setClutch(true) }
    else if (k === 'b') setBrake(true)
    else if (k === 'arrowup' || k === 'arrowdown') { e.preventDefault(); setT(Math.max(0, Math.min(1, useAppStore.getState().animT + (k === 'arrowup' ? 0.05 : -0.05)))) }
    else if (KEY_GEAR[k]) pick(KEY_GEAR[k])
  }
  const onKeyUp = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (k === ' ') setClutch(false); else if (k === 'b') setBrake(false)
  }
  return (
    <div className="shift-panel" tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={() => { setClutch(false); setBrake(false) }}>
      <h4 className="shift-title">{ui('shiftBenchTitle', lang)}</h4>
      <Bar label={ui('shiftEngine', lang)} rpm={st.engineRpm} />
      <Bar label={ui('shiftInput', lang)} rpm={st.inputRpm} />
      <Bar label={ui('shiftOutput', lang)} rpm={st.outRpm} />
      <p className="muted small">{ui('shiftRedline', lang)} {REDLINE.toLocaleString()} rpm</p>
      <p><strong>{shown === 'N' ? ui('shiftNowN', lang) : shown === 'R' ? ui('shiftNowR', lang) : fmt(ui('shiftNow', lang), { g: shown })}</strong>
        {ratio !== null && <span className="muted small"> · {fmt(ui('shiftRatioNow', lang), { r: Math.abs(ratio).toFixed(3) })}</span>}</p>

      <div className="gate" role="group" aria-label={ui('shiftPickGear', lang)}>
        {GATE_TOP.map(g => gateBtn(g))}
        <button className={`gate-n ${shown === 'N' ? 'on' : ''}`} onClick={() => pick('N')}>{ui('shiftGateN', lang)}</button>
        {GATE_BOTTOM.map((g, i) => g ? gateBtn(g) : <span key={i} />)}
      </div>

      <div className="pedals">
        <button className={`pedal ${clutchHeld ? 'on' : ''}`} {...hold(setClutch)}>{ui('shiftClutch', lang)}</button>
        <button className={`pedal ${brakeHeld ? 'on' : ''}`} {...hold(setBrake)}>{ui('shiftBrake', lang)}</button>
      </div>
      <div className="anim-ctrl">
        <span>{ui('shiftThrottle', lang)}</span>
        <input type="range" min={0} max={1} step={0.01} value={throttle} onChange={e => setT(Number(e.target.value))} aria-label={ui('shiftThrottle', lang)} />
      </div>
      <div className="row shift-opts">
        <label><input type="checkbox" checked={autoClutch} onChange={e => setAuto(e.target.checked)} /> {ui('shiftAutoClutch', lang)}</label>
        <label><input type="checkbox" checked={slow} onChange={e => setSlow(e.target.checked)} /> {ui('shiftSlow', lang)}</label>
        <label><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> {ui('shiftSound', lang)}</label>
      </div>

      <p className="muted small">{ui('shiftNow2', lang)}</p>
      <ol className="phases shift-steps">
        {STEPS.map(k => <li key={k} className={k === key ? 'on' : ''}>{ui(('shiftStep_' + k) as UiKey, lang)}</li>)}
      </ol>
      {!STEPS.includes(key) && <p className="phase-now">{ui(('shiftStep_' + key) as UiKey, lang)}</p>}
      <p className="muted small">{ui('shiftChallenges', lang)}（{chRef.current.done.length}/{CHALLENGES.length}）</p>
      <ul className="shift-ch">
        {CHALLENGES.map(c => <li key={c} className={chRef.current.done.includes(c) ? 'done' : ''}>{chRef.current.done.includes(c) ? '✅' : '⬜'} {ui(('shiftCh_' + c) as UiKey, lang)}</li>)}
      </ul>
      {msg && <p className="anim-missing" role="alert">⚠ {ui(msg, lang)}</p>}
      <p className="muted small">{ui('shiftKeys', lang)}</p>
      <p className="muted small">{ui('shiftRatioNote', lang)} {ui('shiftNoteSchematic', lang)} {ui('shiftReverseNote', lang)}</p>
    </div>
  )
}
