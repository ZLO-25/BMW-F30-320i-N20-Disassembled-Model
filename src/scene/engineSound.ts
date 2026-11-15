/**
 * 引擎聲（R4 → S1）。兩種聲音來源，自動選：
 *
 *   有 public/sounds/engine/manifest.json（實車錄音）
 *     → 錄音模式：幾段固定轉速的循環錄音，依轉速交叉淡化 + 變速（算法在 core/engineSoundMix.ts）
 *   沒有
 *     → 合成模式：一個引擎循環（四次排氣脈衝，每缸略有差異）的波形表循環播放
 *
 *   波形表 / 錄音 ──► 低通（轉速越高越亮）──► 低頻共鳴（排氣管）──┐
 *   白噪音 ──► 帶通（進氣聲）──────────────────────────────────┼──► 總音量 ──► 壓縮 ──► 喇叭
 *
 * 一按下就先出合成音，錄音下載解碼完成後再淡入接手，所以不會有「按了沒聲音」的空檔。
 * 瀏覽器規定要使用者按過按鈕才能出聲，所以由面板的按鈕呼叫 start()。對外介面和 R4 一樣。
 */
import { mixSamples, synthCycle, rpmLoad, SYNTH_BASE_RPM, validateSamples, type EngineSample } from '../core/engineSoundMix'

type Voice = { src: AudioBufferSourceNode; gain: GainNode }
type Nodes = {
  ctx: AudioContext; master: GainNode; lp: BiquadFilterNode; body: BiquadFilterNode
  synth: Voice; synthLevel: GainNode
  noiseGain: GainNode; bp: BiquadFilterNode
  samples: { list: EngineSample[]; voices: Voice[]; level: GainNode } | null
  rpm: number
}
let n: Nodes | null = null

const MANIFEST = `${import.meta.env.BASE_URL}sounds/engine/manifest.json`
let manifestP: Promise<EngineSample[]> | null = null
const bufCache = new Map<string, Promise<AudioBuffer>>()

function loadManifest(): Promise<EngineSample[]> {
  manifestP ??= fetch(MANIFEST)
    .then(r => (r.ok ? r.json() : { samples: [] }))
    .then((j: { samples?: EngineSample[] }) => {
      const list = [...(j.samples ?? [])].sort((a, b) => a.rpm - b.rpm)
      const err = validateSamples(list)
      if (err.length) { console.warn('[engineSound] manifest 有問題，改用合成音：', err); return [] }
      return list
    })
    .catch(() => [])
  return manifestP
}

function loadBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer> {
  let p = bufCache.get(file)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}sounds/engine/${file}`)
      .then(r => { if (!r.ok) throw new Error(file); return r.arrayBuffer() })
      .then(b => ctx.decodeAudioData(b))
    p.catch(() => bufCache.delete(file))
    bufCache.set(file, p)
  }
  return p
}

function loopVoice(ctx: AudioContext, buf: AudioBuffer, out: AudioNode, gain = 0, loop?: [number, number]): Voice {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
  if (loop && loop[1] <= buf.duration) { src.loopStart = loop[0]; src.loopEnd = loop[1] }
  const g = ctx.createGain(); g.gain.value = gain
  src.connect(g).connect(out)
  src.start(0, loop ? loop[0] : 0)
  return { src, gain: g }
}

export function startEngineSound(rpm: number) {
  if (n) return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  const ctx = new AC()
  const master = ctx.createGain(); master.gain.value = 0
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  // 共用音色：低通 + 排氣管低頻共鳴（固定頻率，不跟著變速走，聽起來才像同一支排氣管）
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7
  const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.2; body.gain.value = 5
  lp.connect(body).connect(master)

  // 合成：波形表（一個引擎循環）
  const cycle = synthCycle(ctx.sampleRate)
  const wave = ctx.createBuffer(1, cycle.length, ctx.sampleRate)
  wave.getChannelData(0).set(cycle)
  const synthLevel = ctx.createGain(); synthLevel.gain.value = 1
  synthLevel.connect(lp)
  const synth = loopVoice(ctx, wave, synthLevel, 0.8)

  // 進氣 / 機械噪音
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = nb.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8
  const noiseGain = ctx.createGain(); noiseGain.gain.value = 0
  const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true
  noise.connect(bp).connect(noiseGain).connect(master)
  noise.start()

  const me: Nodes = { ctx, master, lp, body, synth, synthLevel, noiseGain, bp, samples: null, rpm }
  n = me
  setEngineRpm(rpm)
  master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.15)

  // 有實車錄音就接手
  void loadManifest().then(async list => {
    if (!list.length || n !== me) return
    const bufs = await Promise.all(list.map(s => loadBuffer(ctx, s.file))).catch(() => null)
    if (!bufs || n !== me) return
    const level = ctx.createGain(); level.gain.value = 0
    level.connect(lp)
    const voices = bufs.map((b, i) => loopVoice(ctx, b, level, 0, list[i].loop))
    me.samples = { list, voices, level }
    setEngineRpm(me.rpm)
    const t = ctx.currentTime
    level.gain.setTargetAtTime(1, t, 0.12)
    synthLevel.gain.setTargetAtTime(0, t, 0.12)
    noiseGain.gain.setTargetAtTime(0, t, 0.12) // 錄音本身就有進氣聲
  })
}

export function setEngineRpm(rpm: number) {
  if (!n) return
  n.rpm = rpm
  const t = n.ctx.currentTime, k = 0.05
  const load = rpmLoad(rpm)
  n.synth.src.playbackRate.setTargetAtTime(rpm / SYNTH_BASE_RPM, t, k)
  if (n.samples) {
    const { list, voices } = n.samples
    const mix = mixSamples(list, rpm)
    voices.forEach((v, i) => {
      const m = mix.find(x => x.index === i)
      v.gain.gain.setTargetAtTime(m ? m.gain * (list[i].gain ?? 1) : 0, t, k)
      if (m) v.src.playbackRate.setTargetAtTime(m.rate, t, k)
    })
    n.lp.frequency.setTargetAtTime(12000, t, k) // 錄音不再額外削高頻、不加低頻共鳴
    n.body.gain.setTargetAtTime(0, t, k)
  } else {
    n.lp.frequency.setTargetAtTime(700 + load * 3500, t, k)
    n.bp.frequency.setTargetAtTime(900 + rpm * 0.35, t, k)
    n.noiseGain.gain.setTargetAtTime(0.015 + load * 0.05, t, k)
  }
}

export function stopEngineSound() {
  if (!n) return
  const cur = n
  n = null
  cur.master.gain.setTargetAtTime(0, cur.ctx.currentTime, 0.08)
  setTimeout(() => { void cur.ctx.close() }, 400)
}

export const engineSoundOn = () => n !== null
/** 目前用哪種聲音（給自動測試與除錯）：'samples' 實車錄音、'synth' 合成、null 沒在響。 */
export const engineSoundSource = (): 'samples' | 'synth' | null => (n ? (n.samples ? 'samples' : 'synth') : null)
