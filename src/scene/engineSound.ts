/**
 * R4 引擎聲：用 Web Audio 即時合成，不是錄音（沒有授權乾淨的 N20 錄音，也不想讓網頁變大）。
 *
 *   四行程四缸：曲軸每轉一圈點火兩次 → 點火頻率 = rpm / 60 × 2
 *
 *     鋸齒波（點火頻率）──► 低通濾波（轉速越高越亮）──┐
 *     正弦波（點火頻率 ÷ 2，四行程的低沉起伏）────────┼──► 總音量 ──► 喇叭
 *     白噪音 ──► 帶通濾波（進氣與機械聲）─────────────┘
 *
 * 只抓「音高跟著轉速走」這件事，音色是示意。瀏覽器規定要使用者按過按鈕才能出聲，所以由面板的按鈕呼叫 start()。
 */
import { firingHz } from '../core/engineCycle'

type Nodes = {
  ctx: AudioContext; master: GainNode; saw: OscillatorNode; sub: OscillatorNode
  lp: BiquadFilterNode; noiseGain: GainNode; bp: BiquadFilterNode
}
let n: Nodes | null = null

export function startEngineSound(rpm: number) {
  if (n) return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  const ctx = new AC()
  const master = ctx.createGain(); master.gain.value = 0
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  const saw = ctx.createOscillator(); saw.type = 'sawtooth'
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2
  const sawGain = ctx.createGain(); sawGain.gain.value = 0.22
  saw.connect(lp).connect(sawGain).connect(master)

  const sub = ctx.createOscillator(); sub.type = 'sine'
  const subGain = ctx.createGain(); subGain.gain.value = 0.25
  sub.connect(subGain).connect(master)

  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8
  const noiseGain = ctx.createGain()
  noise.connect(bp).connect(noiseGain).connect(master)

  saw.start(); sub.start(); noise.start()
  n = { ctx, master, saw, sub, lp, noiseGain, bp }
  setEngineRpm(rpm)
  master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.15)
}

export function setEngineRpm(rpm: number) {
  if (!n) return
  const f = firingHz(rpm), t = n.ctx.currentTime, k = 0.05
  n.saw.frequency.setTargetAtTime(f, t, k)
  n.sub.frequency.setTargetAtTime(f / 2, t, k)
  n.lp.frequency.setTargetAtTime(250 + f * 4, t, k)
  n.bp.frequency.setTargetAtTime(800 + rpm * 0.3, t, k)
  n.noiseGain.gain.setTargetAtTime(0.02 + (rpm / 7000) * 0.06, t, k)
}

export function stopEngineSound() {
  if (!n) return
  const cur = n
  n = null
  cur.master.gain.setTargetAtTime(0, cur.ctx.currentTime, 0.08)
  setTimeout(() => { void cur.ctx.close() }, 400)
}

export const engineSoundOn = () => n !== null
