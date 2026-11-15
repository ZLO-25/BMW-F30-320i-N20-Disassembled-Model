/**
 * F0 缸內燃燒的純邏輯（不碰 three / React），運轉動畫、燃燒特效、面板、點火聲共用，有 Vitest。
 *
 *   曲軸角 θ（以做功上死點 TDC = 0，負 = 還沒到）
 *
 *    −提前角      CA50 ≈ +8°        +180°（下死點）       +360°
 *      │            │                  │                    │
 *      ⚡ 跳火 ───► 火焰燒過去 ───► 燒完的高溫氣體膨脹 ──► 排氣行程把它推出去
 *      ◄ 壓縮 ►◄──────────── 做功 ───────────►◄──── 排氣 ────►
 *
 * 和 engineCycle.ts 的相位 φ（0–720，0 = 做功上死點）的關係：θ = φ（φ ≤ 360）或 φ − 720（φ > 360）。
 * 所以跳火點在 φ = 720 − 提前角（壓縮行程尾端），跨過 720 → 0 的接縫時所有輸出都連續。
 *
 * ⚠ 這裡所有的數字都是「一般汽油引擎的教科書模型」，不是 N20 實測（N20 的點火圖譜在 DME 裡，
 *   依轉速、負載、爆震感知器隨時調整，沒有公開的單一數值）。介面一律標「示意」。
 *   - 燃燒曲線：Wiebe 函數（a = 5、m = 2 是教科書常用值）
 *   - 燃燒持續角度隨轉速變長（燃燒需要的「時間」差不多，轉速高時同樣時間曲軸轉過更多角度）
 *   - 提前角 = 讓 50% 燃燒點（CA50）落在上死點後約 8° 的值（常見的「最佳扭力點火」經驗法則）
 *   - 壓縮比 10（ST1111 p.5 寫 N20B20O0 為 10.0:1，見 sources.json bmw_st1111_n20），多變指數 1.3
 *   - 火花放電約 1.5 ms
 * 找到可登記的來源之前不要改成「規格」。
 */
import { RPM_RANGE } from './engineCycle'

// ───── 示意常數（集中在這裡） ─────
export const WIEBE_A = 5
export const WIEBE_M = 2
/** 燃燒持續角度（曲軸角，10% → 90% 以外也算進去的全長）：怠速 → 紅線 */
export const BURN_DEG: readonly [number, number] = [40, 65]
/** 目標 50% 燃燒點（上死點後幾度） */
export const CA50_TARGET = 8
export const COMPRESSION_RATIO = 10
export const POLY_N = 1.3
/** 燃燒放熱讓壓力放大的倍數（相對於只壓縮不點火） */
export const HEAT_GAIN = 3
/** 已燒氣體的密度比（未燃 / 已燃），用來把「質量比例」換成「體積比例」 */
export const DENSITY_RATIO = 4
/** 火花放電時間（秒），換成曲軸角後至少 SPARK_MIN_DEG */
export const SPARK_SEC = 0.0015
export const SPARK_MIN_DEG = 6
/** 排氣行程把高溫氣體推出去的區間（θ） */
export const EXHAUST_FADE: readonly [number, number] = [150, 340]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const rpmLoad = (rpm: number) => clamp01((rpm - RPM_RANGE[0]) / (RPM_RANGE[1] - RPM_RANGE[0]))

/** 相位 φ（0–720）→ 以做功上死點為 0 的 θ（−360, 360] */
export const thetaOf = (phase: number) => {
  const p = ((phase % 720) + 720) % 720
  return p > 360 ? p - 720 : p
}

/** 燃燒持續角度（度） */
export const burnDurationDeg = (rpm: number) => BURN_DEG[0] + (BURN_DEG[1] - BURN_DEG[0]) * rpmLoad(rpm)

/** Wiebe：燃燒進度 x（0–1，相對於持續角度）→ 已燒質量比例 */
const wiebe = (x: number) => (x <= 0 ? 0 : 1 - Math.exp(-WIEBE_A * Math.pow(Math.min(x, 1.6), WIEBE_M + 1)))
/** 已燒 50% 時的燃燒進度 */
const X50 = Math.pow(Math.LN2 / WIEBE_A, 1 / (WIEBE_M + 1))
/** Wiebe 的燒得最快的那一點（給「燃燒速度」正規化用） */
const X_PEAK = Math.pow(WIEBE_M / (WIEBE_A * (WIEBE_M + 1)), 1 / (WIEBE_M + 1))
const wiebeRate = (x: number) => (x <= 0 ? 0 : WIEBE_A * (WIEBE_M + 1) * Math.pow(x, WIEBE_M) * Math.exp(-WIEBE_A * Math.pow(x, WIEBE_M + 1)))
const RATE_MAX = wiebeRate(X_PEAK)

/** 點火提前角（上死點前幾度）：讓 CA50 落在 CA50_TARGET。轉速越高燃燒佔的角度越大，所以越早點 */
export function sparkAdvanceDeg(rpm: number) {
  return Math.round((burnDurationDeg(rpm) * X50 - CA50_TARGET) * 10) / 10
}

/** 火花放電持續的曲軸角（度） */
export const sparkDurationDeg = (rpm: number) => Math.max(SPARK_MIN_DEG, rpm * 6 * SPARK_SEC)

/** 汽缸容積（以燃燒室容積 = 1）：簡化成不考慮連桿的正弦 */
const volume = (theta: number) => 1 + ((COMPRESSION_RATIO - 1) / 2) * (1 - Math.cos((theta * Math.PI) / 180))

export interface Combustion {
  /** 火花亮度 0–1（只亮放電那幾度） */
  spark: number
  /** 已燒質量比例 0–1（Wiebe）；排氣行程時跟著被推出去而變小 */
  burned: number
  /** 已燒氣體佔燃燒室的體積比例 0–1（火球大小用） */
  front: number
  /** 燃燒速度 0–1（火焰鋒面亮度用） */
  rate: number
  /** 缸內氣體溫度感 0–1（顏色與亮度用）；排氣行程結束前回到 0 */
  heat: number
  /** 相對壓力 0–1（1 = 這個轉速下的峰值） */
  pressure: number
}

function rawAt(theta: number, rpm: number): Combustion & { pRaw: number } {
  const adv = sparkAdvanceDeg(rpm)
  const dur = burnDurationDeg(rpm)
  const start = -adv
  // 進氣行程（θ < −180）還沒有新的燃燒；θ > 360 不會出現
  const since = theta - start
  const active = theta > -180
  const x = active ? since / dur : -1
  const burned = active ? wiebe(x) : 0
  const sd = sparkDurationDeg(rpm)
  const spark = active && since >= 0 && since <= sd ? 1 - since / sd : 0
  const rate = active && x > 0 && x < 1.6 ? clamp01(wiebeRate(x) / RATE_MAX) : 0
  const front = burned <= 0 ? 0 : clamp01((burned * DENSITY_RATIO) / (1 + burned * (DENSITY_RATIO - 1)))
  const V = volume(theta)
  // 壓力：只有在壓縮、做功（θ ∈ [−180, 180]）才計算多變壓縮 / 膨脹；排氣與進氣時接近大氣壓
  const compress = Math.pow(1 / V, POLY_N)
  const inCycle = theta >= -180 && theta <= 180
  // 下死點前排氣門提早打開（blowdown），壓力在 140°–180° 洩掉
  const blow = theta > 0 ? 1 - smooth(140, 180, theta) : 1
  const pRaw = inCycle ? compress * (1 + HEAT_GAIN * burned) * blow : 0
  // 溫度：已燒氣體隨膨脹降溫（T ∝ V^(1−n)），排氣行程被推出去
  const cool = Math.pow(1 / V, POLY_N - 1)
  const out = theta > 0 ? 1 - smooth(EXHAUST_FADE[0], EXHAUST_FADE[1], theta) : 1
  const heat = clamp01(burned * clamp01((cool - 0.3) / 0.7) * out)
  return { spark, burned: burned * out, front: front * out, rate, heat, pressure: 0, pRaw }
}

/** 每個轉速（取整到 50 rpm）的壓力峰值，正規化用 */
const peakCache = new Map<number, number>()
function peakPressure(rpm: number) {
  const key = Math.round(rpm / 50) * 50
  let p = peakCache.get(key)
  if (p === undefined) {
    p = 0
    for (let th = -60; th <= 90; th += 0.5) p = Math.max(p, rawAt(th, key).pRaw)
    peakCache.set(key, p)
  }
  return p
}

/** 這一缸在相位 φ、轉速 rpm 時的燃燒狀態（全部 0–1） */
export function combustionAt(phase: number, rpm: number): Combustion {
  const r = rawAt(thetaOf(phase), rpm)
  r.pressure = clamp01(r.pRaw / peakPressure(rpm))
  return { spark: r.spark, burned: r.burned, front: r.front, rate: r.rate, heat: r.heat, pressure: r.pressure }
}

/**
 * 一般速度下看到的「平均」輝光：一格畫面就跳過整個燃燒，只能畫時間平均。
 * 轉速越高（負載越大）越亮；jitter（−1..1）給一點閃爍，由曲軸角當種子，暫停時也固定。
 */
export function averagedGlow(rpm: number, jitter = 0) {
  return clamp01(0.35 + 0.35 * rpmLoad(rpm) + 0.06 * jitter)
}

/**
 * 逐次畫法與平均畫法的混合比例：畫面上每秒點火次數 ≤ 2 → 1（逐次），≥ 4 → 0（平均），中間平滑過渡。
 * 每秒超過 3 次的大面積閃光有光敏感風險（WCAG 2.3.1），所以 4 次以上一律平均。
 */
export function discreteMix(firingsPerSecOnScreen: number) {
  return 1 - smooth(2, 4, firingsPerSecOnScreen)
}

/**
 * 曲軸從 prevDeg 轉到 deg（度，可以超過 720，只要 deg ≥ prevDeg）之間，有哪幾缸跳火。
 * fireAt(cyl) = 那一缸做功上死點的曲軸角（engineCycle 的 fireOffset）。回傳汽缸編號。
 */
export function sparksBetween(prevDeg: number, deg: number, rpm: number, fireAt: (cyl: number) => number): number[] {
  if (!(deg > prevDeg)) return []
  if (deg - prevDeg >= 720) return [1, 2, 3, 4]
  const adv = sparkAdvanceDeg(rpm)
  const out: number[] = []
  for (const c of [1, 2, 3, 4]) {
    // 跳火點 = fireAt − adv（mod 720）；找最小的 k 使 s = base + 720k > prevDeg，再看 s ≤ deg
    const base = fireAt(c) - adv
    const k = Math.floor((prevDeg - base) / 720) + 1
    const s = base + 720 * k
    if (s <= deg) out.push(c)
  }
  return out
}
