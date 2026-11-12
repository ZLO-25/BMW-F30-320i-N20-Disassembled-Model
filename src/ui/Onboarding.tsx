import { useState } from 'react'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

/** E5：第一次使用的三步引導。可略過；看過就記在 localStorage n20.onboard.v1，之後不再出現 */
export function Onboarding() {
  const lang = useAppStore(s => s.lang)
  const done = useAppStore(s => s.onboarded)
  const finish = useAppStore(s => s.setOnboarded)
  const [step, setStep] = useState(0)
  if (done) return null
  const keys = ['onboard1', 'onboard2', 'onboard3'] as const
  const last = step === keys.length - 1
  return (
    <div className="onboard" role="dialog" aria-label={ui('onboardTitle', lang)}>
      <strong>{ui('onboardTitle', lang)} · {step + 1}/{keys.length}</strong>
      <p>{ui(keys[step], lang)}</p>
      <div className="onboard-actions">
        <button onClick={finish}>{ui('onboardSkip', lang)}</button>
        <button className="primary on" onClick={() => (last ? finish() : setStep(step + 1))}>{ui(last ? 'onboardDone' : 'onboardNext', lang)}</button>
      </div>
    </div>
  )
}
