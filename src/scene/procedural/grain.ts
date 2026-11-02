/**
 * U6 表面質感：程式產生（不連網、不用 DOM）的「紋理貼圖」+ 三面投影（triplanar）。
 *
 * 為什麼不用一般的 UV 貼圖？
 *   程式化零件的 UV 是每個幾何體各自 0..1，大缸體和小螺栓會拿到「一樣多格」的紋理，
 *   顆粒大小就跟著零件大小亂跑。三面投影改用「零件本身的座標（公尺）」去貼：
 *
 *        側面看到的紋理用 (z,y)      上面看到的用 (x,z)      正面看到的用 (x,y)
 *              ┌───┐                    ┌───┐                    ┌───┐
 *        ──►   │ X │              ▼     │ Y │              ●     │ Z │
 *              └───┘                    └───┘                    └───┘
 *      依表面法線朝向，把三張投影混在一起 → 每公尺的顆粒數固定，沒有接縫、不用 UV。
 *
 * 一張 128×128 貼圖塞三種資料（省記憶體，也只要一次取樣）：
 *   R = 細顆粒高度（拿來做凹凸，像 bumpMap）
 *   G = 細顆粒粗糙度倍率（亮點 / 霧面的細小變化）
 *   B = 大範圍斑駁（鑄件表面深淺不一，遠看也看得到）
 *
 * 四種表面（registry.ts 的 M.* 會用到）：
 *   castAl   鑄鋁砂面：細砂顆粒 + 淡淡的斑駁
 *   castIron 鑄鐵：較粗的顆粒 + 小砂孔
 *   plastic  黑色紋理塑膠（咬花）：細小的顆粒凸點
 *   machined 加工面鋼 / 鋁：沿 X 方向的車削 / 拉絲細紋
 */
import * as THREE from 'three'

export type GrainKind = 'castAl' | 'castIron' | 'plastic' | 'machined'

const N = 128

/** 可重現的亂數（同一個 seed 每次產生一樣的貼圖，截圖才能對照） */
function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

const wrap = (i: number, n: number) => ((i % n) + n) % n
const smooth = (t: number) => t * t * (3 - 2 * t)

/** 可無縫拼接的 value noise：lattice 格數 g（g 越大顆粒越細），輸出 N×N，範圍 0..1 */
function valueNoise(g: number, rnd: () => number, stretchX = 1): Float32Array {
  const gx = g, gy = Math.max(1, Math.round(g / stretchX))
  const lat = Array.from({ length: gx * gy }, rnd)
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * gx, fy = (y / N) * gy
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = smooth(fx - x0), ty = smooth(fy - y0)
    const v = (ix: number, iy: number) => lat[wrap(iy, gy) * gx + wrap(ix, gx)]
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx
    out[y * N + x] = a + (b - a) * ty
  }
  return out
}

/** 多個尺度疊加（fBm），結果重新拉到 0..1 */
function fbm(rnd: () => number, octaves: number[], stretchX = 1): Float32Array {
  const out = new Float32Array(N * N)
  let amp = 1
  for (const g of octaves) {
    const n = valueNoise(g, rnd, stretchX)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    amp *= 0.55
  }
  return normalize01(out)
}

/** 可無縫拼接的 Worley（離最近隨機點的距離）：做砂孔與咬花凸點，輸出 0..1（0 = 點中心） */
function worley(cells: number, rnd: () => number): Float32Array {
  const pts: [number, number][] = []
  for (let i = 0; i < cells * cells; i++) pts.push([rnd(), rnd()])
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * cells, fy = (y / N) * cells
    const cx = Math.floor(fx), cy = Math.floor(fy)
    let best = 9
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const p = pts[wrap(cy + dy, cells) * cells + wrap(cx + dx, cells)]
      const d = Math.hypot(cx + dx + p[0] - fx, cy + dy + p[1] - fy)
      if (d < best) best = d
    }
    out[y * N + x] = Math.min(1, best)
  }
  return out
}

function normalize01(a: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v }
  const k = hi > lo ? 1 / (hi - lo) : 0
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k
  return a
}

/** 產生某一種表面的 RGBA 資料（純計算，Vitest 可以直接測） */
export function grainData(kind: GrainKind): Uint8Array {
  const rnd = rng({ castAl: 11, castIron: 23, plastic: 37, machined: 51 }[kind])
  let h: Float32Array, r: Float32Array
  const mottle = fbm(rnd, [2, 4, 8])
  switch (kind) {
    case 'castAl': {
      h = fbm(rnd, [32, 64, 128])
      r = fbm(rnd, [16, 32])
      break
    }
    case 'castIron': {
      const base = fbm(rnd, [16, 32, 64])
      const pits = worley(14, rnd)
      // 砂孔：離點很近的地方往下凹
      h = normalize01(base.map((v, i) => v - 0.9 * (1 - smooth(Math.min(1, pits[i] / 0.22)))))
      r = fbm(rnd, [8, 32])
      break
    }
    case 'plastic': {
      const w = worley(24, rnd)
      // 咬花：一顆顆圓頂小凸點
      h = normalize01(w.map(v => 1 - smooth(Math.min(1, v / 0.7))))
      r = normalize01(h.map((v, i) => v * 0.6 + mottle[i] * 0.4))
      break
    }
    case 'machined': {
      // 車削 / 拉絲：沿 u 方向變化快、沿 v 方向幾乎不變 → 一條條細紋
      const lines = fbm(rnd, [128, 64], 64)
      const soft = fbm(rnd, [16, 32])
      h = normalize01(lines.map((v, i) => v * 0.85 + soft[i] * 0.15))
      r = normalize01(lines.map((v, i) => v * 0.6 + soft[i] * 0.4))
      break
    }
  }
  const out = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    out[i * 4] = Math.round(h[i] * 255)
    out[i * 4 + 1] = Math.round(r[i] * 255)
    out[i * 4 + 2] = Math.round(mottle[i] * 255)
    out[i * 4 + 3] = 255
  }
  return out
}

/**
 * 每種表面的強度。單位：
 *   density  每公尺幾張貼圖（越大顆粒越細）
 *   height   凹凸高度（公尺）
 *   rough    粗糙度細變化幅度（0 = 不變；0.3 = 在原本粗糙度的 70%–100% 之間跳）
 *   mottle   大範圍斑駁對粗糙度的影響（±）
 *   tint     大範圍斑駁對顏色深淺的影響（±）
 *   mottleScale 斑駁貼圖比細顆粒放大幾倍
 */
export const GRAIN_SETTINGS: Record<GrainKind, { density: number; height: number; rough: number; mottle: number; tint: number; mottleScale: number }> = {
  castAl:   { density: 9,  height: 0.00035, rough: 0.30, mottle: 0.25, tint: 0.16, mottleScale: 0.12 },
  castIron: { density: 6,  height: 0.0006,  rough: 0.30, mottle: 0.25, tint: 0.20, mottleScale: 0.12 },
  plastic:  { density: 22, height: 0.00012, rough: 0.35, mottle: 0.15, tint: 0.08, mottleScale: 0.08 },
  machined: { density: 14, height: 0.00006, rough: 0.45, mottle: 0.15, tint: 0.06, mottleScale: 0.1 },
}

const textures = new Map<GrainKind, THREE.DataTexture>()

export function grainTexture(kind: GrainKind): THREE.DataTexture {
  let t = textures.get(kind)
  if (t) return t
  t = new THREE.DataTexture(grainData(kind), N, N)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter // 遠處自動變平順，不會閃爍
  t.generateMipmaps = true
  t.colorSpace = THREE.NoColorSpace // 這是資料，不是顏色
  t.needsUpdate = true
  textures.set(kind, t)
  return t
}

/** 同一種表面的所有材質共用同一組 uniform：改 GRAIN_SETTINGS 一處就全部生效 */
const uniformCache = new Map<GrainKind, Record<string, THREE.IUniform>>()
function grainUniforms(kind: GrainKind) {
  let u = uniformCache.get(kind)
  if (u) return u
  const s = GRAIN_SETTINGS[kind]
  u = {
    grainMap: { value: grainTexture(kind) },
    grainDensity: { value: s.density },
    grainHeight: { value: s.height },
    grainRough: { value: s.rough },
    grainMottle: { value: s.mottle },
    grainTint: { value: s.tint },
    grainMottleScale: { value: s.mottleScale },
  }
  uniformCache.set(kind, u)
  return u
}

const VERT_DECL = /* glsl */ `
varying vec3 vGrainPos;
varying vec3 vGrainNrm;`

const FRAG_DECL = /* glsl */ `
uniform sampler2D grainMap;
uniform float grainDensity, grainHeight, grainRough, grainMottle, grainTint, grainMottleScale;
varying vec3 vGrainPos;
varying vec3 vGrainNrm;
vec4 grainTri(float s) {
  vec3 w = abs(normalize(vGrainNrm));
  w = w * w; w = w * w;            // 讓三張投影的交界窄一點
  w /= (w.x + w.y + w.z + 1e-5);
  vec3 p = vGrainPos * s;
  return texture2D(grainMap, p.zy) * w.x + texture2D(grainMap, p.xz) * w.y + texture2D(grainMap, p.xy) * w.z;
}`

/** 細顆粒 + 斑駁：取樣一次，後面粗糙度與法線都用它 */
const FRAG_SAMPLE = /* glsl */ `
vec4 grainFine = grainTri(grainDensity);
float grainBig = grainTri(grainDensity * grainMottleScale).b;
diffuseColor.rgb *= 1.0 + (grainBig - 0.5) * 2.0 * grainTint;
float grainH = grainFine.r * grainHeight;`

const FRAG_ROUGH = /* glsl */ `
roughnessFactor *= 1.0 - grainRough * (1.0 - grainFine.g);
roughnessFactor *= 1.0 + (grainBig - 0.5) * 2.0 * grainMottle;
roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);`

/** 用畫面上的高度變化（dFdx/dFdy）推出新的法線：和 three 的 bumpMap 同一套公式（Mikkelsen） */
const FRAG_NORMAL = /* glsl */ `
{
  vec3 gSp = -vViewPosition;
  vec3 gSx = dFdx(gSp), gSy = dFdy(gSp);
  vec3 gR1 = cross(gSy, normal), gR2 = cross(normal, gSx);
  float gDet = dot(gSx, gR1) * faceDirection;
  vec2 gDH = vec2(dFdx(grainH), dFdy(grainH));
  vec3 gGrad = sign(gDet) * (gDH.x * gR1 + gDH.y * gR2);
  // 斜看（掠射角）時 gDet 很小，凹凸會被放大成閃爍白點：限制最大傾斜量
  float gLen = length(gGrad), gMax = 0.6 * abs(gDet);
  if (gLen > gMax) gGrad *= gMax / gLen;
  vec3 gN = abs(gDet) * normal - gGrad;
  // 退化的像素（det = 0）會算出 0 向量 → normalize 變 NaN → 白點；這種像素就不加凹凸
  if (abs(gDet) > 1e-14 && dot(gN, gN) > 1e-28) normal = normalize(gN);
}`

/** 把三面投影紋理接到一個 MeshStandardMaterial（或 Physical）上。回傳同一個材質。 */
export function withGrain<T extends THREE.MeshStandardMaterial>(m: T, kind: GrainKind): T {
  m.userData.grain = kind
  const uniforms = grainUniforms(kind)
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvGrainNrm = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainPos = transformed;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${FRAG_SAMPLE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${FRAG_ROUGH}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${FRAG_NORMAL}`)
  }
  // 不同表面要編成不同的 shader 程式；同一種表面的材質共用程式
  m.customProgramCacheKey = () => `grain:${kind}`
  return m
}
