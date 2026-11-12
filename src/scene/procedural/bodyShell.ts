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

// ───────────────────────── 輪廓表（X 由後往前） ─────────────────────────
type Key = [number, number]
export const PROFILE = {
  /** 中線最高點 */
  top: [
    [-2.426, 0.6], [-2.4, 0.874], [-2.32, 1.026], [-2.261, 1.111], [-2.078, 1.123], [-1.672, 1.141], [-1.432, 1.172],
    [-1.116, 1.336], [-0.793, 1.418], [-0.47, 1.429], [0.014, 1.418], [0.224, 1.385], [0.773, 1.1], [0.983, 1.06],
    [1.306, 1.02], [1.662, 0.97], [1.865, 0.925], [2.089, 0.828], [2.15, 0.77], [2.19, 0.7], [2.2, 0.62],
  ] as Key[],
  /** 側面肩線高度 */
  belt: [
    [-2.426, 0.58], [-2.4, 0.85], [-2.32, 0.98], [-2.26, 1.0], [-2.0, 1.03], [-1.6, 1.03], [-1.245, 1.01], [-0.5, 0.975],
    [0.4, 0.95], [0.773, 0.96], [1.3, 0.93], [1.865, 0.87], [2.089, 0.78], [2.15, 0.74], [2.19, 0.66], [2.2, 0.6],
  ] as Key[],
  /** 側面最下緣 */
  bot: [
    [-2.426, 0.36], [-2.3, 0.33], [-1.95, 0.31], [-1.82, 0.22], [-1.7, 0.2], [1.9, 0.2], [2.05, 0.235], [2.15, 0.25], [2.2, 0.32],
  ] as Key[],
  /** 最寬處半寬 */
  hw: [
    [-2.426, 0.66], [-2.4, 0.78], [-2.32, 0.85], [-2.2, 0.89], [-1.9, 0.905], [1.8, 0.905], [2.0, 0.89], [2.089, 0.86],
    [2.15, 0.8], [2.19, 0.72], [2.2, 0.64],
  ] as Key[],
  /** 肩線半寬 */
  hs: [
    [-2.426, 0.6], [-2.4, 0.72], [-2.32, 0.81], [-2.2, 0.85], [-1.9, 0.87], [1.8, 0.875], [2.0, 0.85], [2.089, 0.81],
    [2.15, 0.75], [2.19, 0.66], [2.2, 0.58],
  ] as Key[],
}
export const BODY_X = { rear: -2.426, front: 2.2 }
/** 輪拱：圓心就是輪心（前軸 x=+1.5、後軸 x=−1.31），半徑照側面照 */
export const ARCHES = [{ c: 1.5, y: 0.345, r: 0.44, wIn: 0.6 }, { c: -1.31, y: 0.345, r: 0.43, wIn: 0.64 }]
/** 可拆蓋板的分界（X） */
export const SPLIT = { hoodFront: 2.07, cowl: 0.8, fBumper: 1.97, trunkFront: -1.47, trunkRear: -2.27, rBumper: -1.8 }
/** 車窗範圍（X） */
const GLASS = { side: [-1.25, 0.62], bPillar: [-0.23, -0.17], windshield: [0.224, 0.79], rear: [-1.45, -1.08] } as const
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
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = THREE.MathUtils.lerp

/** 某個 X 的半邊截面，12 個點（z ≥ 0），編號見檔頭的圖 */
export function section(X: number): [number, number][] {
  const yT = F.top(X), yB = Math.min(F.belt(X), yT - 0.015), yF = F.bot(X)
  const hw = F.hw(X), hs = Math.min(F.hs(X), hw - 0.01), hS = hw - 0.03
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
  for (const x of [-2.42, -2.41, -2.38, -2.35, 2.17, 2.18, 2.19, 2.195]) xs.add(x)
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
      b.pos.push(xs[i], y, z * side)
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
    for (const [z, y] of ring) b.pos.push(xs[i], y, z)
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

/** 尾燈：L 形，外側那段在車身（葉子板）上，內側那段在行李廂蓋上 */
const TAIL = { y: 0.9 }

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

  // 頭燈：車頭兩角，往後斜，裡面兩圈「天使眼」
  for (const side of [1, -1]) {
    const hl = new THREE.Group()
    hl.add(mesh(rbox(d, 0.11, 0.085, 0.36, 0.025), lensMat(0xdfe8f0, 0.55)))
    hl.add(mesh(rbox(d, 0.05, 0.06, 0.28, 0.01), chrome(), -0.03, 0, 0))
    if (d !== 'low') for (const z of [-0.06, 0.07]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 24), lensMat(0xffffff, 0.9, 0xcfe6ff))
      ring.rotation.y = Math.PI / 2
      ring.position.set(0.02, 0, z)
      hl.add(ring)
    }
    hl.position.set(2.12, 0.745, 0.63 * side)
    hl.rotation.y = -0.55 * side
    g.add(hl)
  }
  // 雙腎型水箱罩：鍍鉻外框 + 黑色直柵
  for (const side of [1, -1]) {
    const kg = new THREE.Group()
    kg.add(mesh(rbox(d, 0.03, 0.12, 0.2, 0.03), chrome()))
    kg.add(mesh(rbox(d, 0.032, 0.1, 0.18, 0.025), M.glossPlastic(), 0.002, 0, 0))
    if (d === 'high') for (let i = 0; i < 9; i++) kg.add(mesh(rbox(d, 0.012, 0.1, 0.006, 0.002), chrome(), 0.012, 0, -0.08 + i * 0.02))
    kg.position.set(2.175, 0.66, 0.135 * side)
    kg.rotation.z = -0.25
    kg.rotation.y = -0.12 * side
    g.add(kg)
  }

  // 防火牆與通風槽：引擎室和座艙的隔板（拆下引擎蓋時看得到）
  g.add(mesh(rbox(d, 0.02, 0.36, 1.4, 0.01), M.blackPlastic(), 0.6, 0.8, 0))
  g.add(mesh(rbox(d, 0.2, 0.02, 1.4, 0.01), M.blackPlastic(), 0.7, 0.99, 0))
  // 前避震塔：避震器上座坐在上面
  for (const side of [1, -1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, d === 'low' ? 10 : 24), M.paint(), 1.5, 0.82, 0.66 * side))
  }
  // 尾燈外側那段（在葉子板上，順著車尾轉角斜過去）
  for (const side of [1, -1]) {
    const t = mesh(rbox(d, 0.12, 0.12, 0.34, 0.025), lensMat(0xa3101a, 0.85, 0x5a0000), -2.31, TAIL.y + 0.02, 0.69 * side)
    t.rotation.y = 0.45 * side
    g.add(t)
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
  g.add(mesh(rbox(d, 0.04, 0.12, 0.8, 0.03), M.glossPlastic(), 2.175 - o[0], 0.4 - o[1], 0))
  for (const side of [1, -1]) g.add(mesh(rbox(d, 0.05, 0.13, 0.2, 0.03), M.glossPlastic(), 2.12 - o[0], 0.4 - o[1], 0.62 * side, 0, -0.45 * side, 0))
  return g
})

registerProcedural('bumper_rear_v2', (d) => {
  const g = skinGroup(d, 'rbumper', ORIGIN.rbumper)
  const o = ORIGIN.rbumper
  // 下擾流（黑）+ 兩側反光片
  g.add(mesh(rbox(d, 0.06, 0.06, 1.3, 0.02), M.glossPlastic(), -2.39 - o[0], 0.36 - o[1], 0))
  for (const side of [1, -1]) g.add(mesh(rbox(d, 0.01, 0.02, 0.2, 0.005), lensMat(0xb3121a, 0.9), -2.415 - o[0], 0.43 - o[1], 0.5 * side))
  return g
})

registerProcedural('trunk_lid_v2', (d) => {
  const g = skinGroup(d, 'trunk', ORIGIN.trunk)
  const o = ORIGIN.trunk
  for (const side of [1, -1]) {
    g.add(mesh(rbox(d, 0.06, 0.08, 0.26, 0.02), lensMat(0xa3101a, 0.85, 0x5a0000), -2.345 - o[0], TAIL.y + 0.03 - o[1], 0.4 * side))
  }
  return g
})
