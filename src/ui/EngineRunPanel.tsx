import { useEffect, useState } from 'react'
import { ui } from '../core/i18n'
import { rpmAt, SLOW, type Stroke } from '../core/engineCycle'
import { useAppStore } from '../store/useAppStore'
import { engineStatus } from '../scene/animations'
import { startEngineSound, stopEngineSound, setEngineRpm } from '../scene/engineSound'

/** ⚡ 在跳火後顯示多久（面板每 125 ms 才更新一次，太短會漏掉） */
const SPARK_SHOW_MS = 450

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
  const discrete = status.mix > 0.5

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
      <p className="comb-advance">
        {ui('combAdvance', lang).replace('{n}', status.advance.toFixed(0))} <span className="tag-illustrative">{ui('combIllustrative', lang)}</span>
      </p>
      <table className="gear-table stroke-table"><tbody>
        {[1, 2, 3, 4].map((c, i) => {
          const sparkOn = discrete && status.sparkAgo[i] < SPARK_SHOW_MS
          return (
            <tr key={c} className={`stroke-${status.strokes[i]}`}>
              <td>{ui('cylinder', lang).replace('{n}', String(c))}</td>
              <td>{ui(STROKE_KEY[status.strokes[i]], lang)}</td>
              <td className="comb-spark" aria-label={sparkOn ? ui('combSpark', lang) : undefined}>{sparkOn ? '⚡' : ''}</td>
              <td className="comb-bar-cell">
                <div className="comb-bar" role="meter" aria-label={ui('combPressure', lang) + ' ' + c} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.pressure[i] * 100)}>
                  <div style={{ width: `${Math.round(status.pressure[i] * 100)}%` }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody></table>
      <p className="muted small">{ui('combPressure', lang)}（{ui('combIllustrative', lang)}）· {ui(discrete ? 'combDiscrete' : 'combAveraged', lang)}</p>
      <p className="muted small">{ui('combNote', lang)}</p>
      <p className="muted small">{ui('engineSoundNote', lang)}</p>
    </div>
  )
}
