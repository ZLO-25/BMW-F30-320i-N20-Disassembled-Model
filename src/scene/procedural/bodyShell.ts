/**
 * R3 車殼：照 ZL 實車的側面照與車尾照描出輪廓，再用「截面放樣（loft）」做成一整張車皮，
 * 最後把車皮切成可以拆的幾塊：引擎蓋、前保桿、後保桿、行李廂蓋，其餘是車身。
 *
 *   側面照（幾乎正側面）                       車尾照
 *   ┌──────────────────────────────┐          ┌───────────┐
 *   │      ╭──────────╮             │          │  ╭─────╮  │  ← 車頂寬
 *   │ ╭────╯          ╰──╮          │          │ ╱       ╲ │  ← 窗線寬
 *   │ ╰─◯──────────────◯─╯          │          │▕  ▬   ▬  ▏│  ← 肩線寬
 *   └──────────────────────────────┘          └───────────┘
 *     前後輪心距離 = 軸距 2.81 m（規格）          總寬 1.811 m（規格）
 *     → 每像素約 3.2 mm                         → 換算各高度的半寬
 *
 *   每隔幾公分取一個截面，截面的形狀由下面幾條曲線決定：
 *     yTop   車身中線最高點（保桿 → 引擎蓋 → 擋風玻璃 → 車頂 → 後窗 → 行李廂）
 *     yBelt  側面肩線（車身側面翻上車頂/引擎蓋的那條線）
 *     yBot   側面最下緣（裙邊、保桿下緣）
 *     hw/hs  最寬處、肩線處的半寬（俯視時車頭車尾收窄）
 *   輪拱：截面底部在輪子那段往上抬，抬出輪拱和輪弧內襯。
 *
 *   截面（只畫右半，左半鏡射）：
 *            11 ── 10
 *                    ╲ 9      8–9 側窗 / 9–11 擋風玻璃、後窗、車頂、引擎蓋
 *                     ╲
 *                      8
 *                      │
 *                      7  ← 肩線
 *                       ╲
 *                        6  ← 最寬
 *                       ╱
 *               4 ──── 5    ← 輪拱頂（沒有輪拱時 4、5 掉到最下緣）
 *               │
 *     0 ─ 1     3            0–2 地板與傳動軸隧道、3–4 輪弧內襯
 *          ╲ 2 ╱
 *
 * 數字來源：側面照 a70ea229、車尾照 19501054（zl_owner_photos_2026）；
 * 軸距、車長、車寬、車高（autodata_f30_320i）。前後懸長度比例取自照片、總長對齊規格。
 */
import * as THREE from 'three'
import { registerProcedural, M, mat, rbox, mesh, tube, type Detail } from './registry'

// ───────────────────────── 前後懸：用官方數字校正 ─────────────────────────
/**
 * R6-B：PROFILE 原本是照側面照描的，前懸量出 0.70 m、後懸 1.116 m（照片有透視，兩端量不準）。
 * 官方數字（BMW 新聞稿技術資料，2017 F30 Sedan，bmw_press_f30_us_2017）：前懸 790 mm、後懸 1,044 mm、
 * 車長 4,643 mm、軸距 2,809 mm。輪軸位置不變，兩端照比例拉長 / 縮短：
 *
 *        後懸 1.116 → 1.044                 前懸 0.70 → 0.79
 *   ◄──────────────┤◯ 後軸 −1.31 ……… 前軸 +1.5 ◯├──────────────►
 *        縮短 7 cm                               拉長 9 cm
 *
 * 輪廓表、蓋板分界、燈具位置都先用「描出來的 X」寫，再經過 stretchX() 換成官方比例。
 */
export const OVERHANG = { front: 0.79, rear: 1.044 } as const
const AXLE_X = { front: 1.5, rear: -1.31 } as const
const TRACED = { front: 0.7, rear: 1.116 } as const
export function stretchX(x: number): number {
  if (x > AXLE_X.front) return AXLE_X.front + (x - AXLE_X.front) * OVERHANG.front / TRACED.front
  if (x < AXLE_X.rear) return AXLE_X.rear + (x - AXLE_X.rear) * OVERHANG.rear / TRACED.rear
  return x
}
const sx = (keys: Key[]): Key[] => keys.map(([x, y]) => [stretchX(x), y])

// ───────────────────────── 輪廓表（X 由後往前，描出來的座標，經 sx() 換成官方比例） ─────────────────────────
type Key = [number, number]
export const PROFILE = {
  /** 中線最高點 */
  top: sx([
    [-2.426, 0.6], [-2.4, 0.874], [-2.32, 1.026], [-2.261, 1.111], [-2.078, 1.123], [-1.672, 1.141], [-1.432, 1.172],
    [-1.116, 1.336], [-0.793, 1.418], [-0.47, 1.429], [0.014, 1.418], [0.224, 1.385], [0.773, 1.1], [0.983, 1.06],
    [1.306, 1.02], [1.662, 0.97], [1.865, 0.925], [2.089, 0.828], [2.15, 0.77], [2.19, 0.7], [2.2, 0.62],
  ] as Key[]),
  /** 側面肩線高度 */
  belt: sx([
    [-2.426, 0.58], [-2.4, 0.85], [-2.32, 0.98], [-2.26, 1.0], [-2.0, 1.03], [-1.6, 1.03], [-1.245, 1.01], [-0.5, 0.975],
    [0.4, 0.95], [0.773, 0.96], [1.3, 0.93], [1.865, 0.87], [2.089, 0.78], [2.15, 0.74], [2.19, 0.66], [2.2, 0.6],
  ] as Key[]),
  /** 側面最下緣 */
  bot: sx([
    [-2.426, 0.36], [-2.3, 0.33], [-1.95, 0.31], [-1.82, 0.22], [-1.7, 0.2], [1.9, 0.2], [2.05, 0.235], [2.15, 0.25], [2.2, 0.32],
  ] as Key[]),
  /**
   * 最寬處半寬（俯視輪廓）。R6-B 改成官方懸長後的座標直接寫（不經 sx），車頭車尾改成圓弧：
   * 車頭是圓弧鼻（兩角往後收約 25 cm，水箱罩在最前面、頭燈退後）；車尾中間平、兩角收約 16 cm。
   * 依據：車頭斜上方照 842052b3、車尾照 19501054 的保桿弧度；側面照裡「前懸 ÷ 後懸」只有約 0.63
   * （官方 0.76）：兩端從側面看到的最外點不是在兩角，而是靠近中線，所以兩角一定往後收；收的量用側面照疊圖對齊（R6_PHOTO_OVERLAY.md）。
   *
   *   俯視車頭：        ╭───╮  ← 中間最前（x = 2.29）
   *                  ╭─╯     ╰─╮
   *                 │  兩角往後收  │
   */
  hw: [
    [-2.354, 0.17], [-2.345, 0.3], [-2.31, 0.48], [-2.27, 0.64], [-2.23, 0.76], [-2.19, 0.845], [-2.13, 0.893], [-2.05, 0.905],
    [1.9, 0.905], [2.0, 0.885], [2.05, 0.84], [2.1, 0.76], [2.15, 0.64], [2.19, 0.51], [2.23, 0.37], [2.26, 0.24], [2.29, 0.1],
  ] as Key[],
  /** 肩線半寬（比最寬處窄幾公分，兩端一起收） */
  hs: [
    [-2.354, 0.14], [-2.345, 0.265], [-2.31, 0.445], [-2.27, 0.605], [-2.23, 0.725], [-2.19, 0.81], [-2.13, 0.858], [-2.05, 0.87],
    [1.9, 0.875], [2.0, 0.85], [2.05, 0.805], [2.1, 0.725], [2.15, 0.605], [2.19, 0.475], [2.23, 0.335], [2.26, 0.205], [2.29, 0.07],
  ] as Key[],
}
export const BODY_X = { rear: stretchX(-2.426), front: stretchX(2.2) }
/** 輪拱：圓心就是輪心（前軸 x=+1.5、後軸 x=−1.31），半徑照側面照 */
export const ARCHES = [{ c: 1.5, y: 0.345, r: 0.44, wIn: 0.6 }, { c: -1.31, y: 0.345, r: 0.43, wIn: 0.64 }]
/** 可拆蓋板的分界（X） */
export const SPLIT = { hoodFront: stretchX(2.07), cowl: 0.8, fBumper: stretchX(1.97), trunkFront: stretchX(-1.47), trunkRear: stretchX(-2.27), rBumper: stretchX(-1.8) }
/** 車窗範圍（X） */
const GLASS = { side: [-1.25, 0.62], bPillar: [-0.23, -0.17], windshield: [0.224, 0.79], rear: [stretchX(-1.45), -1.08] } as const
const GLASS_HALF = 0.7, ROOF_HALF = 0.56

/** 單調三次插值（Fritsch–Carlson）：照片描的點之間平順連起來，但不會像一般樣條那樣衝過頭 */
export function monotone(keys: Key[]) {
  const n = keys.length
  const xs = keys.map(k => k[0]), ys = keys.map(k => k[1])
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]))
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  }
}
const F = { top: monotone(PROFILE.top), belt: monotone(PROFILE.belt), bot: monotone(PROFILE.bot), hw: monotone(PROFILE.hw), hs: monotone(PROFILE.hs) }
/**
 * 車頭 / 車尾在半寬 z 處的 X（俯視輪廓上那一點）與那裡的斜角，用來把頭燈、尾燈、進氣口貼在弧面上。
 * 在軸心到車端之間二分搜尋 hw(X) = z。
 */
export function endX(end: 'front' | 'rear', z: number): number {
  let a = end === 'front' ? 1.9 : -2.05, b = end === 'front' ? BODY_X.front : BODY_X.rear
  if (F.hw(b) >= z) return b
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (F.hw(m) >= z) a = m; else b = m }
  return (a + b) / 2
}
/** 弧面在 z 處的偏轉角（rad）：0 = 正對前後，越往兩角越大 */
export const endYaw = (end: 'front' | 'rear', z: number) => Math.atan2(Math.abs(endX(end, z + 0.04) - endX(end, z - 0.04)), 0.08)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = THREE.MathUtils.lerp

/**
 * 外觀重做：車頭、車尾「斜面」。輪廓表的俯視外形和高度無關，所以以前車頭是一面垂直的牆。
 * F30 的車頭是保桿最前、上面（頭燈、水箱罩、引擎蓋前緣）往後倒；車尾是保桿下緣往前收。
 * 這裡在算完頂點後再把兩端照高度往後 / 往前推（只動兩端，軸距與車長不變）：
 *
 *    側面車頭（右邊是車頭）          y
 *            引擎蓋 ──╮  ← 往後 10 cm   0.80
 *                     ╲ 頭燈
 *                      │ 保桿最前       0.50
 *                     ╱ 下緣             0.20
 */
export const RAKE = { front: 0.1, rear: 0.06 } as const
export function rakeX(x: number, y: number): number {
  const wf = clamp01((x - 1.95) / (BODY_X.front - 1.95))
  const wr = clamp01((-2.0 - x) / (-2.0 - BODY_X.rear))
  return x - RAKE.front * wf * wf * clamp01((y - 0.5) / 0.3) + RAKE.rear * wr * wr * clamp01((0.45 - y) / 0.25)
}

/** 某個 X 的半邊截面，12 個點（z ≥ 0），編號見檔頭的圖 */
export function section(X: number): [number, number][] {
  const yT = F.top(X), yB = Math.min(F.belt(X), yT - 0.015), yF = F.bot(X)
  const hw = F.hw(X), hs = Math.min(F.hs(X), hw - 0.01), hS = hw - 0.055   // 裙邊往內收 5.5 cm（以前 3 cm，側面太像一面牆）
  const yW = yF + 0.53 * (yB - yF)
  // 傳動軸隧道：座艙底下中間拱起
  const tun = 0.16 * clamp01((X + 1.75) / 0.15) * clamp01((0.6 - X) / 0.15)
  let yA = yF, wIn = 0.6
  for (const a of ARCHES) {
    const dx = Math.abs(X - a.c)
    if (dx <= a.r) { yA = Math.max(yF, a.y + Math.sqrt(a.r * a.r - dx * dx)); wIn = a.wIn }
  }
  // 車頂比例 g：0 = 引擎蓋/行李廂那種平的頂；1 = 有車窗的座艙
  const g = clamp01((yT - yB - 0.12) / 0.25)
  const crown = yT - yB
  return [
    [0, yF + tun], [0.13, yF + tun], [0.24, yF], [wIn, yF], [wIn, yA], [hS, yA], [hw, yW], [hs, yB],
    [lerp(hs - 0.02, GLASS_HALF, g), lerp(yB + crown * 0.45, yB + 0.035, g)],
    [lerp(hs * 0.72, ROOF_HALF + 0.02, g), lerp(yB + crown * 0.85, yT - 0.05, g)],
    [lerp(hs * 0.38, ROOF_HALF * 0.55, g), lerp(yT - crown * 0.03, yT - 0.012, g)],
    [0, yT],
  ]
}

/**
 * 把截面上半部（5 輪拱外緣 → 11 車頂中線）用 Catmull-Rom 補點，車身才會是圓弧而不是折線。
 * 回傳點與「每一段屬於原本第幾段」（零件分區、材質用的是原本的段號）。
 */
export function fineSection(X: number, sub: number): { pts: [number, number][]; seg: number[] } {
  const c = section(X)
  const pts: [number, number][] = c.slice(0, 6)
  const seg: number[] = [0, 1, 2, 3, 4]
  const P = (k: number): [number, number] => (k <= 11 ? c[Math.max(5, k)] : [-c[22 - k][0], c[22 - k][1]])
  for (let k = 5; k < 11; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2)
    for (let j = 1; j <= sub; j++) {
      const t = j / sub, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
      pts.push(j === sub ? p2 : [Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])])
      seg.push(k)
    }
  }
  return { pts, seg }
}

export type Region = 'shell' | 'hood' | 'fbumper' | 'rbumper' | 'trunk'
type Skin = 'paint' | 'glass' | 'black' | 'under' | 'liner' | null

/** 截面第 k 段（點 k → k+1）在 X 處屬於哪一塊零件 */
export function regionOf(X: number, k: number): Region {
  if (X > SPLIT.hoodFront) return 'fbumper'
  if (X > SPLIT.fBumper && k <= 6) return 'fbumper'
  if (X >= SPLIT.cowl && X <= SPLIT.hoodFront && k >= 7) return 'hood'
  if (X <= SPLIT.trunkFront && k >= 7) return 'trunk'          // 行李廂蓋含車尾上半（尾燈內側那段）
  if (X < SPLIT.trunkRear && k <= 6) return 'rbumper'
  if (X < SPLIT.rBumper && k <= 5) return 'rbumper'
  return 'shell'
}
const within = (x: number, r: readonly number[]) => x >= r[0] && x <= r[1]
function skinOf(X: number, k: number): Skin {
  if (k <= 2) return X > 0.6 ? null : 'under'     // 引擎室底下是開的（有底護板零件）
  if (k <= 4) return 'liner'
  if (k === 8 && within(X, GLASS.side)) return within(X, GLASS.bPillar) ? 'black' : 'glass'
  if (k >= 9 && (within(X, GLASS.windshield) || within(X, GLASS.rear))) return 'glass'
  return 'paint'
}

/** 截面的 X 位置：等距，再加上所有分界（輪拱邊、蓋板縫、車窗邊）各放一個，讓每一格只屬於一塊 */
export function stations(d: Detail): number[] {
  const step = d === 'high' ? 0.03 : d === 'mid' ? 0.05 : 0.1
  const xs = new Set<number>()
  for (let x = BODY_X.rear; x < BODY_X.front; x += step) xs.add(+x.toFixed(4))
  xs.add(BODY_X.front)
  // 兩端收得比較急，多放幾個
  for (const x of [-2.35, -2.34, -2.33, -2.31, -2.29, -2.26, 2.2, 2.23, 2.25, 2.27, 2.28, 2.285]) xs.add(x)
  for (const a of ARCHES) for (const x of [a.c - a.r - 0.0005, a.c - a.r + 0.0005, a.c + a.r - 0.0005, a.c + a.r + 0.0005]) xs.add(+x.toFixed(4))
  for (const x of Object.values(SPLIT)) xs.add(x)
  for (const r of Object.values(GLASS)) for (const x of r) xs.add(x)
  xs.add(0.6)
  return [...xs].filter(x => x >= BODY_X.rear && x <= BODY_X.front).sort((a, b) => a - b)
}

/** 把指定零件那一塊的車皮做出來，依材質分成幾個 geometry（同材質共用頂點，法線才會平順） */
export function buildSkin(d: Detail, region: Region): Map<Exclude<Skin, null>, THREE.BufferGeometry> {
  const xs = stations(d)
  const sub = d === 'high' ? 4 : d === 'mid' ? 2 : 1
  const fine = xs.map(x => fineSection(x, sub))
  const secs = fine.map(f => f.pts)
  const segOf = fine[0].seg
  const out = new Map<Exclude<Skin, null>, { pos: number[]; idx: number[]; map: Map<string, number> }>()
  const vtx = (b: { pos: number[]; map: Map<string, number> }, i: number, k: number, side: 1 | -1) => {
    const key = `${i}:${k}:${side}`
    let v = b.map.get(key)
    if (v === undefined) {
      const [z, y] = secs[i][k]
      v = b.pos.length / 3
      b.pos.push(rakeX(xs[i], y), y, z * side)
      b.map.set(key, v)
    }
    return v
  }
  const bucket = (s: Exclude<Skin, null>) => {
    let b = out.get(s)
    if (!b) out.set(s, (b = { pos: [], idx: [], map: new Map() }))
    return b
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2
    for (let q = 0; q < segOf.length; q++) {
      const k = segOf[q]
      if (regionOf(xm, k) !== region) continue
      const s = skinOf(xm, k)
      if (!s) continue
      // 退化成線的格子（例如沒有輪拱處的內襯）不畫
      const [a0, a1, b0, b1] = [secs[i][q], secs[i][q + 1], secs[i + 1][q], secs[i + 1][q + 1]]
      if (Math.hypot(a0[0] - a1[0], a0[1] - a1[1]) < 1e-4 && Math.hypot(b0[0] - b1[0], b0[1] - b1[1]) < 1e-4) continue
      const b = bucket(s)
      for (const side of [1, -1] as const) {
        const p = [vtx(b, i, q, side), vtx(b, i + 1, q, side), vtx(b, i + 1, q + 1, side), vtx(b, i, q + 1, side)]
        if (side === 1) b.idx.push(p[0], p[1], p[2], p[0], p[2], p[3])
        else b.idx.push(p[0], p[2], p[1], p[0], p[3], p[2])
      }
    }
  }
  // 前後兩端封口
  const cap = (i: number, normalX: 1 | -1, reg: Region) => {
    if (reg !== region) return
    const raw = [...secs[i], ...secs[i].slice(1, -1).reverse().map(([z, y]) => [-z, y] as [number, number])]
    // 兩端沒有輪拱與隧道，有些點會重疊：去掉，三角化才不會出錯
    const ring = raw.filter((p, j) => { const q = raw[(j + raw.length - 1) % raw.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5 })
    const contour = ring.map(([z, y]) => new THREE.Vector2(z, y))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    const b = bucket('paint')
    const base = b.pos.length / 3
    for (const [z, y] of ring) b.pos.push(rakeX(xs[i], y), y, z)
    for (const [p, q, r] of tris) {
      // 依外側法線方向決定繞向
      const ab = new THREE.Vector3(0, ring[q][1] - ring[p][1], ring[q][0] - ring[p][0])
      const ac = new THREE.Vector3(0, ring[r][1] - ring[p][1], ring[r][0] - ring[p][0])
      const nx = ab.cross(ac).x
      if (nx * normalX >= 0) b.idx.push(base + p, base + q, base + r)
      else b.idx.push(base + p, base + r, base + q)
    }
  }
  cap(0, -1, 'rbumper')
  cap(xs.length - 1, 1, 'fbumper')
  const res = new Map<Exclude<Skin, null>, THREE.BufferGeometry>()
  for (const [s, b] of out) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    g.setIndex(b.idx)
    g.computeVertexNormals()
    res.set(s, g)
  }
  return res
}

/** 側面某高度的車身表面 z（右側），用來把門縫、門把貼在車身上 */
export function sideZ(X: number, Y: number): number {
  const s = fineSection(X, 6).pts
  for (let k = 5; k < 18; k++) {
    const [z0, y0] = s[k], [z1, y1] = s[k + 1]
    if ((Y - y0) * (Y - y1) <= 0 && y1 !== y0) return lerp(z0, z1, (Y - y0) / (y1 - y0))
  }
  return s[6][0]
}

// ───────────────────────── 材質 ─────────────────────────
const glassMat = () => {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0b0e12, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.88, clearcoat: 1, side: THREE.DoubleSide })
  m.userData.glass = true
  return m
}
const skinMat = (s: Exclude<Skin, null>): THREE.Material => {
  if (s === 'glass') return glassMat()
  if (s === 'black') return M.glossPlastic()
  if (s === 'under') return M.blackPlastic()
  if (s === 'liner') return mat(0x141518, { metalness: 0, roughness: 0.85, side: THREE.DoubleSide })
  const p = M.paint()
  p.side = THREE.DoubleSide   // 拆掉引擎蓋時看得到葉子板內側
  return p
}
const chrome = () => mat(0xd6d9dd, { metalness: 1, roughness: 0.12 })
const lensMat = (color: number, opacity = 0.75, emissive = 0x000000) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.08, transparent: true, opacity, clearcoat: 1, emissive, emissiveIntensity: 0.35 })

/** 車皮那一塊 + 位移成零件自己的座標（零件 position 是整車座標，所以要減掉） */
function skinGroup(d: Detail, region: Region, origin: [number, number, number]) {
  const g = new THREE.Group()
  for (const [s, geo] of buildSkin(d, region)) {
    geo.translate(-origin[0], -origin[1], -origin[2])
    const m = new THREE.Mesh(geo, skinMat(s))
    m.name = region === 'shell' && s === 'paint' ? 'bodyShellMain' : ''
    m.userData.shell = true   // 播放運轉動畫時車皮自動半透明
    g.add(m)
  }
  return g
}

/** 沿車身側面畫一條細線（門縫、窗框），左右各一 */
function sideLine(d: Detail, g: THREE.Group, pts: [number, number][], r: number, m: () => THREE.Material, out = 0.002) {
  for (const side of [1, -1]) {
    const p3 = pts.map(([x, y]) => [x, y, (sideZ(x, y) + out) * side] as [number, number, number])
    g.add(new THREE.Mesh(tube(d, p3, r), m()))
  }
}


// ───────────────────────── 貼著車皮的燈具（外觀重做） ─────────────────────────
/**
 * 頭燈、尾燈以前是一塊方塊斜放在車頭，和車皮的弧面對不上，看起來像貼紙。
 * 現在先算出「車皮在 (z, y) 那一點的 X」，再把燈罩做成一張貼著車皮、往外浮幾毫米的曲面：
 *
 *   俯視（車頭右半）               每個 (z, y) 都往車頭方向二分搜尋，
 *        ╭── 車皮                   找到截面輪廓的邊界 → 燈罩頂點就放在那裡 + out
 *      ╭─╯ ▓▓ ← 燈罩貼著弧面
 *     │ ▓▓
 */
function insideSection(X: number, z: number, y: number): boolean {
  const half = fineSection(X, 3).pts
  const poly = [...half, ...half.slice(1, -1).reverse().map(([a, b]) => [-a, b] as [number, number])]
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [zi, yi] = poly[i], [zj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && z < ((zj - zi) * (y - yi)) / (yj - yi) + zi) inside = !inside
  }
  return inside
}
/** 車頭（或車尾）在半寬 z、高度 y 那一點的車皮 X */
export function surfX(end: 'front' | 'rear', z: number, y: number): number {
  let a = end === 'front' ? 1.75 : -1.75, b = end === 'front' ? BODY_X.front + 0.01 : BODY_X.rear - 0.01
  if (!insideSection(a, z, y)) return a
  for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (insideSection(m, z, y)) a = m; else b = m }
  return (a + b) / 2
}
/** 沿 z 從 z0 到 z1 的一條燈帶：每個 t（0→1）的下緣 yb(t)、上緣 yt(t)，貼著車皮往外 out 公尺 */
function lampSkin(end: 'front' | 'rear', side: 1 | -1, z0: number, z1: number, yb: (t: number) => number, yt: (t: number) => number, out: number, nz: number, ny = 3, origin: [number, number, number] = [0, 0, 0]) {
  const pos: number[] = [], idx: number[] = []
  const dir = end === 'front' ? 1 : -1
  for (let i = 0; i <= nz; i++) {
    const t = i / nz, z = lerp(z0, z1, t)
    for (let j = 0; j <= ny; j++) {
      const y = lerp(yb(t), yt(t), j / ny)
      pos.push(rakeX(surfX(end, z, y), y) + out * dir - origin[0], y - origin[1], z * side - origin[2])
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
    const a = i * (ny + 1) + j, b = a + ny + 1
    if (side * dir > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/**
 * F30 頭燈外形（照車頭斜上方照 842052b3）：內端最高、貼著水箱罩；往外變窄、往上翹，外端碰到引擎蓋縫。
 * 尾燈（車尾照 19501054）：L 形，外側那段比較高、包到側面。
 */
const HEAD = { z0: 0.255, z1: 0.8, yb: (t: number) => 0.655 + 0.085 * t * t, yt: (t: number) => 0.775 + 0.02 * t }
const TAILL = {
  lid: { z0: 0.36, z1: 0.555, yb: () => 0.895, yt: () => 0.955 },
  body: { z0: 0.565, z1: 0.86, yb: (t: number) => 0.895 - 0.05 * Math.min(1, t * 3), yt: (t: number) => 0.965 - 0.02 * t },
}
const SIDE_CREASE_Y = (x: number) => 0.835 + 0.05 * clamp01((-x - 0.2) / 2.0)


// 這幾個 origin 要和 data/parts/car.json 的 position 一致
export const ORIGIN = {
  shell: [0, 0, 0] as [number, number, number],
  hood: [1.45, 1.0, 0] as [number, number, number],
  fbumper: [2.1, 0.45, 0] as [number, number, number],
  rbumper: [-2.2, 0.45, 0] as [number, number, number],
  trunk: [-1.86, 1.12, 0] as [number, number, number],
}

registerProcedural('body_shell_v2', (d) => {
  const g = skinGroup(d, 'shell', ORIGIN.shell)

  // 門縫：前門前緣、B 柱、後門後緣、門下緣（側面照量的）
  const dark = () => mat(0x0a0b0d, { metalness: 0, roughness: 0.9 })
  sideLine(d, g, [[0.87, 0.33], [0.85, 0.6], [0.8, 0.95]], 0.0025, dark)
  sideLine(d, g, [[-0.2, 0.33], [-0.2, 0.6], [-0.2, 0.95]], 0.0025, dark)
  sideLine(d, g, [[-0.92, 0.33], [-1.12, 0.69], [-1.245, 0.99]], 0.0025, dark)
  sideLine(d, g, [[0.87, 0.33], [-0.2, 0.33], [-0.92, 0.33]], 0.0025, dark)
  // 窗框下緣的鍍鉻飾條（ZL 的車有）
  if (d !== 'low') {
    const belt: [number, number][] = []
    for (let x = GLASS.side[1]; x >= -1.24; x -= 0.1) belt.push([x, F.belt(x) + 0.008])
    sideLine(d, g, belt, 0.004, chrome, 0.004)
  }

  // 後視鏡（側面照：前門前上角，鏡座在窗線上）
  for (const side of [1, -1]) {
    const x = 0.56, y = 1.02, z = (sideZ(x, 0.96) + 0.07) * side
    g.add(mesh(rbox(d, 0.13, 0.1, 0.17, 0.035), M.paint(), x - 0.02, y + 0.02, z))
    g.add(mesh(rbox(d, 0.012, 0.085, 0.15, 0.004), M.glossPlastic(), x - 0.085, y + 0.02, z))
    g.add(mesh(rbox(d, 0.08, 0.03, 0.06, 0.01), M.glossPlastic(), x + 0.01, y - 0.04, z - 0.05 * side))
  }
  // 門把（車身同色 + 鍍鉻條）
  for (const x of [-0.05, -1.05]) for (const side of [1, -1]) {
    const z = (sideZ(x, 0.83) + 0.012) * side
    g.add(mesh(rbox(d, 0.13, 0.026, 0.024, 0.01), M.paint(), x, 0.83, z))
    if (d !== 'low') g.add(mesh(rbox(d, 0.11, 0.006, 0.006, 0.002), chrome(), x, 0.842, z + 0.01 * side))
  }

  // 頭燈：貼著車頭弧面的燈罩（深色反射殼 + 透明燈罩 + 兩圈天使眼 + LED 眉燈）
  const nz = d === 'high' ? 16 : d === 'mid' ? 10 : 6
  for (const side of [1, -1] as const) {
    g.add(new THREE.Mesh(lampSkin('front', side, HEAD.z0, HEAD.z1, HEAD.yb, HEAD.yt, 0.004, nz), mat(0x30343a, { metalness: 0.85, roughness: 0.22 })))
    g.add(new THREE.Mesh(lampSkin('front', side, HEAD.z0 - 0.005, HEAD.z1 + 0.005, t => HEAD.yb(t) - 0.006, t => HEAD.yt(t) + 0.006, 0.016, nz), lensMat(0xdfe8f0, 0.22)))
    if (d !== 'low') {
      // 眉燈：上緣一條白色 LED
      g.add(new THREE.Mesh(lampSkin('front', side, HEAD.z0 + 0.03, HEAD.z1 - 0.03, t => HEAD.yt(t) - 0.016, t => HEAD.yt(t) - 0.008, 0.008, nz, 1), lensMat(0xffffff, 0.95, 0xe8f2ff)))
      for (const t of [0.18, 0.5]) {
        const z = lerp(HEAD.z0, HEAD.z1, t), y = (HEAD.yb(t) + HEAD.yt(t)) / 2 - 0.005
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04 - t * 0.02, 0.004, 6, 28), lensMat(0xffffff, 0.9, 0xcfe6ff))
        ring.rotation.y = Math.PI / 2 - endYaw('front', z) * side
        ring.position.set(rakeX(surfX('front', z, y), y) + 0.008, y, z * side)
        ring.rotation.z = -0.3
        g.add(ring)
      }
    }
  }
  // 雙腎型水箱罩：鍍鉻外框 + 黑色直柵
  for (const side of [1, -1]) {
    const kg = new THREE.Group()
    // 正前照（以車牌 32 cm 當比例尺）：每個腎型約 22 cm 寬、14 cm 高，中間只留一條縫
    kg.add(mesh(rbox(d, 0.03, 0.14, 0.22, 0.035), chrome()))
    kg.add(mesh(rbox(d, 0.032, 0.12, 0.2, 0.03), M.glossPlastic(), 0.002, 0, 0))
    if (d === 'high') for (let i = 0; i < 10; i++) kg.add(mesh(rbox(d, 0.012, 0.1, 0.006, 0.002), chrome(), 0.012, 0, -0.09 + i * 0.02))
    kg.position.set(rakeX(endX('front', 0.125), 0.67) - 0.012, 0.67, 0.125 * side)
    kg.rotation.z = -0.32
    kg.rotation.y = -endYaw('front', 0.125) * side
    g.add(kg)
  }

  // 防火牆與通風槽：引擎室和座艙的隔板（拆下引擎蓋時看得到）
  g.add(mesh(rbox(d, 0.02, 0.36, 1.4, 0.01), M.blackPlastic(), 0.6, 0.8, 0))
  g.add(mesh(rbox(d, 0.2, 0.02, 1.4, 0.01), M.blackPlastic(), 0.7, 0.99, 0))
  // 前避震塔：避震器上座坐在上面
  for (const side of [1, -1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, d === 'low' ? 10 : 24), M.paint(), 1.5, 0.82, 0.66 * side))
  }
  // 尾燈外側那段（在葉子板上，L 形外側較高）
  for (const side of [1, -1] as const) {
    const T = TAILL.body
    g.add(new THREE.Mesh(lampSkin('rear', side, T.z0, T.z1, T.yb, T.yt, 0.006, d === 'low' ? 5 : 10), lensMat(0x8a0d16, 0.92, 0x4a0000)))
    if (d !== 'low') g.add(new THREE.Mesh(lampSkin('rear', side, T.z0 + 0.02, T.z1 - 0.04, t => T.yt(t) - 0.022, t => T.yt(t) - 0.012, 0.009, 8, 1), lensMat(0xff5a4a, 0.95, 0x6a1010)))
  }
  // 側面腰線：F30 從前輪拱上方經過門把、一路到尾燈的那條稜線（貼在車皮上的細亮線，讓光照出折線）
  if (d !== 'low') {
    const crease: [number, number][] = []
    for (let x = 1.0; x >= -2.0; x -= 0.1) crease.push([x, SIDE_CREASE_Y(x)])
    sideLine(d, g, crease, 0.005, M.paint, 0.0)
  }
  // 鯊魚鰭天線
  g.add(mesh(rbox(d, 0.16, 0.05, 0.05, 0.02), M.paint(), -0.87, F.top(-0.87) + 0.02, 0))
  return g
})

registerProcedural('hood_v2', (d) => skinGroup(d, 'hood', ORIGIN.hood))

registerProcedural('bumper_front_v2', (d) => {
  const g = skinGroup(d, 'fbumper', ORIGIN.fbumper)
  const o = ORIGIN.fbumper
  // 下進氣口與兩側進氣口（M 套件款，照 ZL 的車）
  // 正前照：下進氣口約 56 cm 寬（車牌正下方），兩側進氣口在保桿兩角，順著弧面
  // 下進氣口分三段貼著圓鼻（中間在最前面，兩段往後轉）
  for (const zc of [-0.19, 0, 0.19]) {
    const zz = Math.abs(zc) + 0.05, yaw = zc === 0 ? 0 : -Math.sign(zc) * endYaw('front', zz)
    g.add(mesh(rbox(d, 0.05, 0.15, 0.215, 0.03), M.glossPlastic(), endX('front', zc === 0 ? 0.09 : zz) - 0.012 - o[0], 0.43 - o[1], zc, 0, yaw, 0))
  }
  for (const side of [1, -1]) g.add(mesh(rbox(d, 0.05, 0.11, 0.2, 0.03), M.glossPlastic(), endX('front', 0.6) - 0.015 - o[0], 0.42 - o[1], 0.6 * side, 0, -endYaw('front', 0.6) * side, 0))
  return g
})

registerProcedural('bumper_rear_v2', (d) => {
  const g = skinGroup(d, 'rbumper', ORIGIN.rbumper)
  const o = ORIGIN.rbumper
  // 下擾流（黑）+ 兩側反光片
  // 車尾照 19501054：下緣黑色飾條（中間一段）、反光片在兩角（z ≈ ±0.6），順著弧面
  g.add(mesh(rbox(d, 0.06, 0.06, 0.9, 0.02), M.glossPlastic(), rakeX(endX('rear', 0.45), 0.36) + 0.02 - o[0], 0.36 - o[1], 0))
  for (const side of [1, -1]) g.add(mesh(rbox(d, 0.01, 0.02, 0.2, 0.005), lensMat(0xb3121a, 0.9), endX('rear', 0.6) - o[0], 0.43 - o[1], 0.6 * side, 0, endYaw('rear', 0.6) * side, 0))
  return g
})

registerProcedural('trunk_lid_v2', (d) => {
  const g = skinGroup(d, 'trunk', ORIGIN.trunk)
  const o = ORIGIN.trunk
  // 尾燈內側那段（在行李廂蓋上，跟著蓋子拆）
  for (const side of [1, -1] as const) {
    const T = TAILL.lid
    g.add(new THREE.Mesh(lampSkin('rear', side, T.z0, T.z1, T.yb, T.yt, 0.006, d === 'low' ? 3 : 6, 3, o), lensMat(0x8a0d16, 0.92, 0x4a0000)))
  }
  return g
})
