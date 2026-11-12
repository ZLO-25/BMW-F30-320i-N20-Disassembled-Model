import { useEffect, useState } from 'react'
import { ui } from '../core/i18n'
import { rpmAt, SLOW, type Stroke } from '../core/engineCycle'
import { useAppStore } from '../store/useAppStore'
import { engineStatus } from '../scene/animations'
import { startEngineSound, stopEngineSound, setEngineRpm } from '../scene/engineSound'

const STROKE_KEY: Record<Stroke, 'strokeIntake' | 'strokeCompression' | 'strokePower' | 'strokeExhaust'> = {
  intake: 'strokeIntake', compression: 'strokeCompression', power: 'strokePower', exhaust: 'strokeExhaust',
}

/** R4「引擎運轉」動畫的控制：轉速、慢動作、聲音，以及四缸現在各在哪個行程 */
export function EngineRunPanel() {
  const lang = useAppStore(s => s.lang)
  const t = useAppStore(s => s.animT)
  const setT = useAppStore(s => s.setAnimT)
  const playing = useAppStore(s => s.animPlaying)
  const setPlaying = useAppStore(s => s.setAnimPlaying)
  const slow = useAppStore(s => s.engineSlow)
  const setSlow = useAppStore(s => s.setEngineSlow)
  const [sound, setSound] = useState(false)
  const [status, setStatus] = useState(engineStatus())
  const rpm = rpmAt(t)

  // 行程表一秒更新 8 次就夠（不要每格 setState）
  useEffect(() => {
    const id = setInterval(() => setStatus(engineStatus()), 125)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { if (sound) setEngineRpm(rpm) }, [rpm, sound])
  useEffect(() => {
    if (sound && playing) startEngineSound(rpm); else stopEngineSound()
  }, [sound, playing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopEngineSound(), [])

  return (
    <div className="engine-run">
      <div className="anim-ctrl">
        <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚ ' + ui('engineStop', lang) : '▶ ' + ui('engineStart', lang)}</button>
        <input type="range" min={0} max={1} step={0.005} value={t} onChange={e => setT(Number(e.target.value))} aria-label="rpm" />
      </div>
      <div className="anim-ends"><span>{ui('engineRpm', lang)}</span><strong>{rpm.toLocaleString()} rpm</strong></div>
      <div className="row">
        <label><input type="checkbox" checked={slow} onChange={e => setSlow(e.target.checked)} /> {ui('engineSlow', lang).replace('{n}', String(SLOW))}</label>
        <label><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> {ui('engineSound', lang)}</label>
      </div>
      <table className="gear-table stroke-table"><tbody>
        {[1, 2, 3, 4].map((c, i) => (
          <tr key={c} className={`stroke-${status.strokes[i]}`}>
            <td>{ui('cylinder', lang).replace('{n}', String(c))}</td>
            <td>{ui(STROKE_KEY[status.strokes[i]], lang)}</td>
          </tr>
        ))}
      </tbody></table>
      <p className="muted small">{ui('engineSoundNote', lang)}</p>
    </div>
  )
}
