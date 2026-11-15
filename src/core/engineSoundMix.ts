/**
 * 引擎聲的純邏輯（不碰 Web Audio，方便測試）。
 *
 * 一、錄音模式：幾段「固定轉速」的循環錄音，依目前轉速挑最近的兩段交叉淡化，
 *     再用播放速度把音高推到目前轉速。
 *
 *     轉速   800 ──── 1500 ──── 2500 ──── 3500
 *     錄音  [怠速]    [段1]      [段2]      [段3]
 *                          ▲ 2000 rpm：段1、段2 各一半（等功率淡化），
 *                            段1 放快 2000/1500 倍、段2 放慢 2000/2500 倍
 *
 * 二、合成模式（沒有錄音時的備援）：先算好「一個引擎循環」（曲軸轉兩圈）的波形，
 *     裡面有四次排氣脈衝，每缸力道、時間差一點點（真引擎就是這樣，這是「有生命感」的來源），
 *     再循環播放、用播放速度跟著轉速走。比單純的鋸齒波像很多。
 */

/**
 * 一段錄音。loop = [起點, 終點]（秒）：只循環這一段。
 * 前後各留一點「接續的聲音」當緩衝，因為 m4a / mp3 解碼後開頭會多出幾毫秒的空白，
 * 循環區間落在緩衝裡面就不會「喀」一聲（scripts/prep_engine_loops.py 會算好）。
 */
export type EngineSample = { rpm: number; file: string; gain?: number; loop?: [number, number] }
export type SampleMix = { index: number; gain: number; rate: number }

/** 播放速度上下限：超過這個範圍音色會明顯變調（像花栗鼠 / 慢速錄音帶）。 */
export const RATE_MIN = 0.5
export const RATE_MAX = 2
/** 最高那段錄音往上推的上限：錄音只到 2,800 rpm，要撐到 7,000 rpm 紅線，只好推到 2.6 倍（高轉會有點「卡通感」）。 */
export const RATE_TOP_MAX = 2.6

/**
 * 依轉速算每段錄音的音量與播放速度。samples 要依 rpm 由小到大排好。
 * 回傳只含音量 > 0 的段落（最多兩段），音量平方和 = 1（等功率淡化，交界不會變小聲）。
 */
export function mixSamples(samples: readonly EngineSample[], rpm: number): SampleMix[] {
  if (samples.length === 0) return []
  const rate = (i: number) => clamp(rpm / samples[i].rpm, RATE_MIN, RATE_MAX)
  if (rpm <= samples[0].rpm) return [{ index: 0, gain: 1, rate: rate(0) }]
  const last = samples.length - 1
  if (rpm >= samples[last].rpm) return [{ index: last, gain: 1, rate: clamp(rpm / samples[last].rpm, RATE_MIN, RATE_TOP_MAX) }]
  let i = 0
  while (samples[i + 1].rpm < rpm) i++
  const a = samples[i].rpm, b = samples[i + 1].rpm
  const x = (rpm - a) / (b - a)
  const out: SampleMix[] = []
  const ga = Math.cos(x * Math.PI / 2), gb = Math.sin(x * Math.PI / 2)
  if (ga > 1e-4) out.push({ index: i, gain: ga, rate: rate(i) })
  if (gb > 1e-4) out.push({ index: i + 1, gain: gb, rate: rate(i + 1) })
  return out
}

/** 檢查 manifest：rpm 必須遞增且相鄰兩段不能差超過 RATE_MAX 倍（不然中間會變調太多）。 */
export function validateSamples(samples: readonly EngineSample[]): string[] {
  const err: string[] = []
  samples.forEach((s, i) => {
    if (!(s.rpm > 0)) err.push(`#${i} rpm 必須 > 0`)
    if (!s.file) err.push(`#${i} 沒有 file`)
    if (s.loop && !(s.loop[0] >= 0 && s.loop[1] > s.loop[0])) err.push(`#${i} loop 必須是 [起點, 終點] 且終點 > 起點`)
    if (i > 0) {
      const p = samples[i - 1].rpm
      if (s.rpm <= p) err.push(`#${i} rpm 必須遞增`)
      else if (s.rpm / p > RATE_MAX * RATE_MAX) err.push(`#${i} 與前一段差太多（${p} → ${s.rpm}）`)
    }
  })
  return err
}

/** 合成模式的基準轉速：波形表是照這個轉速算的，播放速度 = rpm / SYNTH_BASE_RPM。 */
export const SYNTH_BASE_RPM = 1000

/** 簡單可重現的亂數（同一個 seed 每次結果一樣，測試才穩）。 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/**
 * 產生一個引擎循環（720°）的波形，長度 = 兩圈曲軸在 SYNTH_BASE_RPM 下的時間。
 *
 *   0°        180°       360°       540°      720°
 *   │ 1缸 ▲    │ 3缸 ▲    │ 4缸 ▲    │ 2缸 ▲   │
 *   │ ╲╱╲__    │ ╲╱╲__    │ ╲╱╲__    │ ╲╱╲__   │   ← 每次排氣：一下衝擊 + 很快衰減的震盪 + 一點氣流噪音
 *
 * 四缸每缸大小、時間各差幾 %（cylVar），所以每轉兩圈有一點規律的起伏，聽起來才不像蜂鳴器。
 */
export function synthCycle(sampleRate: number, seed = 20, cylVar = 0.12): Float32Array {
  const cycleSec = 2 * 60 / SYNTH_BASE_RPM
  const n = Math.round(cycleSec * sampleRate)
  const out = new Float32Array(n)
  const r = rng(seed)
  const amps = [1, 1 - cylVar * 0.8, 1 - cylVar * 0.3, 1 - cylVar]
  for (let c = 0; c < 4; c++) {
    const start = (c / 4 + (r() - 0.5) * 0.02) * n
    const amp = amps[c]
    // 衝擊的「顏色」：低頻主體（排氣管的共鳴）+ 一點較高的成分
    const f1 = 95 + r() * 10, f2 = 260 + r() * 40
    const len = Math.round(n * 0.24)
    for (let k = 0; k < len; k++) {
      const t = k / sampleRate
      const env = Math.exp(-t * 55)
      const v = Math.sin(2 * Math.PI * f1 * t) * 0.8 + Math.sin(2 * Math.PI * f2 * t) * 0.25 * Math.exp(-t * 90)
        + (r() * 2 - 1) * 0.35 * Math.exp(-t * 140)
      const idx = Math.round(start + k) % n
      out[(idx + n) % n] += amp * env * v
    }
  }
  // 去掉直流、正規化到 ±0.9
  let mean = 0
  for (let i = 0; i < n; i++) mean += out[i]
  mean /= n
  let peak = 0
  for (let i = 0; i < n; i++) { out[i] -= mean; peak = Math.max(peak, Math.abs(out[i])) }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak
  return out
}

/** 負載感：轉速越高越亮、越大聲（0..1）。 */
export const rpmLoad = (rpm: number) => clamp((rpm - 700) / 6300, 0, 1)

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
