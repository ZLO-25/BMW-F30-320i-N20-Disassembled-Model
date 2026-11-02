/**
 * U6：GLB 模型的材質 → App 的 M.* 預設材質。
 *
 * 外部模型（或 text-to-cad 匯出的）各有各的材質設定，跟程式化零件放在一起會「一塊亮一塊暗」。
 * 載入時先看材質名稱，名稱看不出來再看顏色與金屬度，換成同一套 M.*，兩種來源看起來就一致：
 *
 *   材質名稱含 alu / aluminium …   ─┐
 *   材質名稱含 iron / guss …        ├─►  M.castAl / M.castIron / M.steel / M.blackPlastic …
 *   名稱看不出來 → 顏色 + 金屬度    ─┘
 *   都對不上 → 保留模型原本的材質（例如車漆、玻璃、燈殼）
 */
import type { Preset } from './registry'

/** 名稱關鍵字（小寫比對），由上往下第一個符合的生效。 */
const NAME_RULES: [RegExp, Preset][] = [
  [/machin|turned|polish/, 'machinedAl'],
  [/cast.?al|alu|alumin/, 'castAl'],
  [/hot.?iron|manifold.?iron/, 'hotIron'],
  [/iron|guss|cast.?fe/, 'castIron'],
  [/dark.?steel|black.?steel|oxide/, 'darkSteel'],
  [/forg/, 'forged'],
  [/steel|stahl|chrome|metal/, 'steel'],
  [/rubber|gummi|hose|seal|gasket/, 'rubber'],
  [/copper|kupfer/, 'copper'],
  [/ceramic|porcelain/, 'ceramic'],
  [/grey.?plast|gray.?plast/, 'greyPlastic'],
  [/gloss.?plast|piano/, 'glossPlastic'],
  [/plast|pa66|pa6|pp-|nylon|abs/, 'blackPlastic'],
]

export interface MaterialInfo {
  name: string
  /** 線性色彩 0..1 */
  color: { r: number; g: number; b: number }
  metalness: number
  transparent?: boolean
}

/** 相對亮度（線性色彩） */
const luma = (c: MaterialInfo['color']) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
const saturation = (c: MaterialInfo['color']) => {
  const hi = Math.max(c.r, c.g, c.b), lo = Math.min(c.r, c.g, c.b)
  return hi > 0 ? (hi - lo) / hi : 0
}

/** 回傳對應的 M.* 名稱；對不上就回傳 null（保留原材質）。純函式，有 Vitest。 */
export function presetForMaterial(info: MaterialInfo): Preset | null {
  if (info.transparent) return null // 玻璃、燈殼不要換
  const name = info.name.toLowerCase()
  for (const [re, p] of NAME_RULES) if (re.test(name)) return p
  // 名稱看不出來：只處理「沒什麼顏色」的灰階材質，有顏色的（車漆、橘色標籤）保留
  // （很暗的顏色飽和度算出來不穩，接近黑色就當灰階）
  const l = luma(info.color)
  if (l > 0.03 && saturation(info.color) > 0.25) return null
  if (info.metalness >= 0.5) {
    if (l > 0.35) return 'castAl'
    if (l > 0.12) return 'steel'
    return 'castIron'
  }
  if (l < 0.04) return 'blackPlastic'
  if (l < 0.15) return 'greyPlastic'
  return null
}
