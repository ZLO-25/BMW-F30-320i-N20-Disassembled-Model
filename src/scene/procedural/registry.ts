/**
 * 程式化零件產生器註冊表。
 * 每個產生器：(detail) => THREE.Group。新增零件時在這裡註冊名稱，資料用 "procedural:<name>" 指向它。
 * 產生器必須接受 detail，產出高/中/低三種面數供 LOD 使用。
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

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

/** 真實感材質預設（PBR）：金屬度、粗糙度照真實材料抓，配合環境光才有反射 */
export const M = {
  castAl: () => mat(0x8f9399, { metalness: 0.75, roughness: 0.62, bumpMap: noiseTex(), bumpScale: 0.12 }),
  machinedAl: () => mat(0xb9bdc2, { metalness: 0.95, roughness: 0.26 }),
  castIron: () => mat(0x55585d, { metalness: 0.7, roughness: 0.8, bumpMap: noiseTex(), bumpScale: 0.18 }),
  hotIron: () => mat(0x6a5a4e, { metalness: 0.6, roughness: 0.85, bumpMap: noiseTex(), bumpScale: 0.18 }),
  steel: () => mat(0xa9afb6, { metalness: 1, roughness: 0.32 }),
  darkSteel: () => mat(0x3c4046, { metalness: 0.9, roughness: 0.45 }),
  forged: () => mat(0x6f747b, { metalness: 0.95, roughness: 0.5, bumpMap: noiseTex(), bumpScale: 0.06 }),
  blackPlastic: () => mat(0x1b1d21, { metalness: 0, roughness: 0.62, bumpMap: noiseTex(), bumpScale: 0.05 }),
  glossPlastic: () => mat(0x15171a, { metalness: 0.05, roughness: 0.3 }),
  greyPlastic: () => mat(0x3d4148, { metalness: 0, roughness: 0.6, bumpMap: noiseTex(), bumpScale: 0.05 }),
  rubber: () => mat(0x121315, { metalness: 0, roughness: 0.92 }),
  ceramic: () => mat(0xefe9dc, { metalness: 0, roughness: 0.25 }),
  copper: () => mat(0xb87333, { metalness: 1, roughness: 0.35 }),
  gold: () => mat(0xc9a24a, { metalness: 1, roughness: 0.3 }),
  filter: () => mat(0xe8dcb0, { metalness: 0, roughness: 0.95, bumpMap: noiseTex(), bumpScale: 0.2 }),
  heatShield: () => mat(0xc4c7cb, { metalness: 0.9, roughness: 0.4, bumpMap: noiseTex(), bumpScale: 0.35 }),
  dark: () => mat(0x0c0d0f, { metalness: 0, roughness: 0.9 }),
  paint: () => new THREE.MeshPhysicalMaterial({ color: COLORS.body, metalness: 0.6, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
  orange: () => mat(0xd9731a, { metalness: 0, roughness: 0.5 }),
}

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

/** 沿 X 軸的圓柱（曲軸、凸輪軸、皮帶盤都是沿 X） */
export const cylX = (d: Detail, r: number, len: number, rTop = r) => {
  const g = new THREE.CylinderGeometry(rTop, r, len, segs(d, 32, 16, 8))
  g.rotateZ(Math.PI / 2)
  return g
}
export const cylY = (d: Detail, r: number, len: number, rTop = r) => new THREE.CylinderGeometry(rTop, r, len, segs(d, 32, 16, 8))
export const cylZ = (d: Detail, r: number, len: number, rTop = r) => {
  const g = new THREE.CylinderGeometry(rTop, r, len, segs(d, 32, 16, 8))
  g.rotateX(Math.PI / 2)
  return g
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
