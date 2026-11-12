/**
 * 程式化零件產生器註冊表。
 * 每個產生器：(detail) => THREE.Group。新增零件時在這裡註冊名稱，資料用 "procedural:<name>" 指向它。
 * 產生器必須接受 detail，產出高/中/低三種面數供 LOD 使用。
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { withGrain, GRAIN_SETTINGS, type GrainKind } from './grain'

export type Detail = 'high' | 'mid' | 'low'
export type Generator = (detail: Detail) => THREE.Group

const registry = new Map<string, Generator>()

export function registerProcedural(name: string, gen: Generator) {
  registry.set(name, gen)
}

export function getProcedural(name: string): Generator | undefined {
  return registry.get(name)
}

export const segs = (d: Detail, high = 32, mid = 16, low = 8) => (d === 'high' ? high : d === 'mid' ? mid : low)

/** 共用材質工廠。每個零件各自一份材質，才能單獨高亮。 */
export const mat = (color: number | string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...opts })

export const COLORS = {
  aluminium: 0xb8bcc2,
  castIron: 0x6b6f75,
  blackPlastic: 0x23262b,
  greyPlastic: 0x4a4f57,
  steel: 0x9aa0a8,
  copper: 0xb87333,
  rubber: 0x1c1d20,
  body: 0x1f4fa8,      // 示意用的深藍金屬漆
  glass: 0x8fb5e8,
}

/**
 * R3 車漆顏色。白色是照 ZL 實車照片挑的近似色（不是原廠色號）；其他是常見的 F30 顏色，給教學對照用。
 * 換顏色時 `applyPaint()` 直接改場景裡所有車漆材質，不用重建模型。
 */
export const PAINTS = {
  // 外觀重做：白色是素色漆（沒有金屬粉），金屬度 0；以前 0.35 會把修車廠暖色燈反射染成粉橘色
  zl_white: { color: 0xd9dbd9, metalness: 0, roughness: 0.22 },
  blue: { color: COLORS.body, metalness: 0.6, roughness: 0.32 },
  black: { color: 0x0e1013, metalness: 0.55, roughness: 0.28 },
  silver: { color: 0xa9adb2, metalness: 0.8, roughness: 0.3 },
  red: { color: 0x7d141b, metalness: 0.5, roughness: 0.3 },
} as const
export type PaintKey = keyof typeof PAINTS
let paintKey: PaintKey = 'zl_white'
export function applyPaint(key: PaintKey, root?: THREE.Object3D) {
  paintKey = key
  const p = PAINTS[key]
  root?.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined
    if (m && !Array.isArray(m) && m.userData?.paint) { m.color.setHex(p.color); m.metalness = p.metalness; m.roughness = p.roughness }
  })
}

/** 鑄件表面的細微顆粒：一張共用的平滑雜訊貼圖當 bumpMap（不用 DOM，測試環境也能跑） */
let noise: THREE.DataTexture | null = null
function noiseTex(): THREE.DataTexture {
  if (noise) return noise
  const N = 64
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const raw = Array.from({ length: N * N }, rnd)
  // 模糊兩次，讓顆粒變成柔和的砂面，而不是電視雜訊
  let cur = raw
  for (let pass = 0; pass < 2; pass++) {
    const next = new Array<number>(N * N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += cur[((y + dy + N) % N) * N + ((x + dx + N) % N)]
      next[y * N + x] = sum / 9
    }
    cur = next
  }
  const data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const v = 128 + (cur[i] - 0.5) * 160
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  noise = new THREE.DataTexture(data, N, N)
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping
  noise.magFilter = noise.minFilter = THREE.LinearFilter
  noise.repeat.set(3, 3)
  noise.needsUpdate = true
  return noise
}

/**
 * 有紋理的材質：粗糙度貼圖是「乘上去的」（平均約 1 - rough/2），
 * 所以底值先除回去，讓整體亮度和 U6 之前差不多，只多了細節。
 */
const grained = (kind: GrainKind, color: number, opts: Partial<THREE.MeshStandardMaterialParameters>) => {
  const r = opts.roughness ?? 0.55
  const avg = 1 - GRAIN_SETTINGS[kind].rough / 2
  return withGrain(mat(color, { ...opts, roughness: Math.min(1, r / avg) }), kind)
}

/**
 * 真實感材質預設（PBR）：金屬度、粗糙度照真實材料抓，配合環境光才有反射。
 * U6：主要的四種表面加上程式產生的紋理（grain.ts，三面投影，不需要 UV）。
 *   鑄鋁 castAl / forged → 砂面顆粒      鑄鐵 castIron / hotIron → 粗顆粒 + 砂孔
 *   黑/灰塑膠 → 咬花凸點                  鋼 steel / darkSteel / machinedAl → 車削細紋
 */
export const M = {
  castAl: () => grained('castAl', 0x8f9399, { metalness: 0.75, roughness: 0.62 }),
  machinedAl: () => grained('machined', 0xb9bdc2, { metalness: 0.95, roughness: 0.26 }),
  castIron: () => grained('castIron', 0x55585d, { metalness: 0.7, roughness: 0.8 }),
  hotIron: () => grained('castIron', 0x6a5a4e, { metalness: 0.6, roughness: 0.85 }),
  steel: () => grained('machined', 0xa9afb6, { metalness: 1, roughness: 0.32 }),
  darkSteel: () => grained('machined', 0x3c4046, { metalness: 0.9, roughness: 0.45 }),
  forged: () => grained('castAl', 0x6f747b, { metalness: 0.95, roughness: 0.5 }),
  blackPlastic: () => grained('plastic', 0x1b1d21, { metalness: 0, roughness: 0.62 }),
  glossPlastic: () => mat(0x15171a, { metalness: 0.05, roughness: 0.3 }),
  greyPlastic: () => grained('plastic', 0x3d4148, { metalness: 0, roughness: 0.6 }),
  rubber: () => mat(0x121315, { metalness: 0, roughness: 0.92 }),
  ceramic: () => mat(0xefe9dc, { metalness: 0, roughness: 0.25 }),
  copper: () => mat(0xb87333, { metalness: 1, roughness: 0.35 }),
  gold: () => mat(0xc9a24a, { metalness: 1, roughness: 0.3 }),
  filter: () => mat(0xe8dcb0, { metalness: 0, roughness: 0.95, bumpMap: noiseTex(), bumpScale: 0.2 }),
  heatShield: () => mat(0xc4c7cb, { metalness: 0.9, roughness: 0.4, bumpMap: noiseTex(), bumpScale: 0.35 }),
  dark: () => mat(0x0c0d0f, { metalness: 0, roughness: 0.9 }),
  paint: () => {
    const p = PAINTS[paintKey]
    const m = new THREE.MeshPhysicalMaterial({ color: p.color, metalness: p.metalness, roughness: p.roughness, clearcoat: 1, clearcoatRoughness: 0.08 })
    m.userData.paint = true
    return m
  },
  orange: () => mat(0xd9731a, { metalness: 0, roughness: 0.5 }),
}

export type Preset = keyof typeof M

/** 放置輔助：設定位置後回傳同一個 mesh，方便鏈式寫法 */
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T => {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

export const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  at(new THREE.Mesh(geo, m), x, y, z, rx, ry, rz)

/** 圓角方塊 */
export const rbox = (d: Detail, w: number, h: number, depth: number, r = 0.008) =>
  new RoundedBoxGeometry(w, h, depth, d === 'low' ? 1 : d === 'mid' ? 2 : 3, Math.min(r, w / 2.1, h / 2.1, depth / 2.1))

/**
 * R1 倒角：真實的機械零件沒有刀口一樣的 90° 邊，車削件、鑄件的邊緣都有 0.5–2 mm 的倒角或圓角，
 * 光線打到那一圈會亮起一條細線，眼睛就靠這條線判斷「這是實心的金屬」。
 *
 *   側面輪廓（繞 Y 軸旋轉成圓柱）          一般圓柱            有倒角
 *        ┌──────┐                         ┌──────┐           ╭──────╮
 *        │      │                         │      │           │      │
 *        └──────┘                         └──────┘           ╰──────╯
 *
 * 輪廓點在倒角前後各多放一點，讓頂面、側面維持平的，只有倒角那一圈是圓滑過渡。
 * 只在 high（桌機）用；mid / low 與很細的圓柱（螺絲、管子，半徑 < 8 mm）照舊用一般圓柱，面數不變。
 */
export const CHAMFER = { max: 0.0018, ratio: 0.18, minRadius: 0.008 }
export function cylinderY(d: Detail, r: number, len: number, rTop = r): THREE.BufferGeometry {
  const n = segs(d, 32, 16, 8)
  const c = Math.min(CHAMFER.max, Math.min(r, rTop) * CHAMFER.ratio, len * CHAMFER.ratio)
  if (d !== 'high' || Math.min(r, rTop) < CHAMFER.minRadius || c < 0.0004) return new THREE.CylinderGeometry(rTop, r, len, n)
  const h = len / 2
  const pts = [
    [0, -h], [r - 2 * c, -h], [r - c, -h], [r, -h + c], [r, -h + 2 * c],
    [rTop, h - 2 * c], [rTop, h - c], [rTop - c, h], [rTop - 2 * c, h], [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  return new THREE.LatheGeometry(pts, n)
}

/** 沿 X 軸的圓柱（曲軸、凸輪軸、皮帶盤都是沿 X） */
export const cylX = (d: Detail, r: number, len: number, rTop = r) => {
  const g = cylinderY(d, r, len, rTop)
  g.rotateZ(Math.PI / 2)
  return g
}
export const cylY = (d: Detail, r: number, len: number, rTop = r) => cylinderY(d, r, len, rTop)
export const cylZ = (d: Detail, r: number, len: number, rTop = r) => {
  const g = cylinderY(d, r, len, rTop)
  g.rotateX(Math.PI / 2)
  return g
}

/**
 * R2 連接件：機械看起來「真」，很大一部分靠螺絲頭與管束。
 *
 *   六角法蘭螺絲（沿 +Y 長出來）          蝸桿式管束（套在沿 Y 的管子上）
 *        ┌─┴─┐  ← 六角頭                       ┌──────┐ ← 鋼帶
 *      ══╧═══╧══ ← 法蘭                        │ ▣    │ ← 蝸桿座
 *
 * 回傳一個合併好的幾何，呼叫端照一般 mesh 用（材質用 M.steel / M.darkSteel）。
 * af = 對邊寬度（M6 法蘭螺絲約 10 mm、M8 約 13 mm）。low 畫質用簡單圓柱。
 */
export function hexHead(d: Detail, af = 0.010, h = 0.0055): THREE.BufferGeometry {
  const rHex = af / Math.sqrt(3)            // 六角形外接圓半徑
  if (d === 'low') { const g = new THREE.CylinderGeometry(rHex, rHex, h, 6); g.translate(0, h / 2, 0); return g }
  const flange = new THREE.CylinderGeometry(rHex * 1.25, rHex * 1.3, h * 0.25, segs(d, 20, 12, 8))
  flange.translate(0, h * 0.125, 0)
  const head = new THREE.CylinderGeometry(rHex, rHex, h * 0.75, 6)
  head.translate(0, h * 0.25 + h * 0.375, 0)
  return mergeGeometries([flange.toNonIndexed(), head.toNonIndexed()])!
}

export function hoseClamp(d: Detail, r: number, width = 0.009): THREE.BufferGeometry {
  const band = new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, width, segs(d, 32, 16, 8), 1, true)
  if (d === 'low') return band
  const housing = new THREE.BoxGeometry(0.012, width * 1.3, 0.008)
  housing.translate(0, 0, r + 0.004)
  const screw = new THREE.CylinderGeometry(0.0025, 0.0025, 0.016, 8)
  screw.rotateZ(Math.PI / 2)
  screw.translate(0, 0, r + 0.0085)
  return mergeGeometries([band.toNonIndexed(), housing.toNonIndexed(), screw.toNonIndexed()])!
}

/** 沿一串點的管子（水管、油管、增壓管） */
export const tube = (d: Detail, pts: [number, number, number][], r: number, closed = false) =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.3),
    segs(d, 96, 48, 20), r, segs(d, 12, 8, 5), closed)

/**
 * 皮帶 / 鏈條路徑：給幾個圓（在 YZ 平面），取外包絡線，回傳 X=0 平面上的封閉點列。
 * 用凸包近似，蛇形皮帶內側繞的惰輪不在這裡處理。
 */
export function beltLoop(circles: { y: number; z: number; r: number }[], n = 48): [number, number, number][] {
  const pts: [number, number][] = []
  for (const c of circles) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([c.y + Math.sin(a) * c.r, c.z + Math.cos(a) * c.r])
  }
  // Andrew monotone chain 凸包
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  // 太密的點會讓 CatmullRom 打結，抽稀
  const out: [number, number, number][] = []
  for (const [y, z] of hull) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(last[1] - y, last[2] - z) > 0.006) out.push([0, y, z])
  }
  return out
}

/** 帶齒的鏈輪 / 齒輪外形，沿 X 軸擠出 */
export function sprocket(d: Detail, r: number, teeth: number, thick: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const n = d === 'low' ? Math.min(teeth, 12) : teeth
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2
    const ro = r, ri = r * 0.9
    const p = (a: number, rr: number) => [Math.cos(a) * rr, Math.sin(a) * rr] as const
    if (i === 0) s.moveTo(...p(a0, ro)); else s.lineTo(...p(a0, ro))
    s.lineTo(...p(a1 - 0.3 / n, ro))
    s.lineTo(...p(a1, ri))
    s.lineTo(...p(((i + 1) / n) * Math.PI * 2 - 0.3 / n, ri))
  }
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false })
  g.translate(0, 0, -thick / 2)
  g.rotateY(Math.PI / 2)
  return g
}

/** 開頂的「托盤」形狀（缸頭、缸體下半部）：四面牆，不封頂 */
export function openTray(d: Detail, w: number, h: number, depth: number, wall: number, m: () => THREE.Material, floor = true): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, w, h, wall, 0.004), m(), 0, h / 2, depth / 2 - wall / 2))
  g.add(mesh(rbox(d, w, h, wall, 0.004), m(), 0, h / 2, -depth / 2 + wall / 2))
  g.add(mesh(rbox(d, wall, h, depth, 0.004), m(), w / 2 - wall / 2, h / 2, 0))
  g.add(mesh(rbox(d, wall, h, depth, 0.004), m(), -w / 2 + wall / 2, h / 2, 0))
  if (floor) g.add(mesh(rbox(d, w, wall, depth, 0.004), m(), 0, wall / 2, 0))
  return g
}
