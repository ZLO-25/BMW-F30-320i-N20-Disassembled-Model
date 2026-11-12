/**
 * E1 按需渲染的小工具。Canvas 設成 frameloop="demand" 之後，畫面「靜止就不畫」；
 * 任何會讓畫面改變的事情都要呼叫 redraw()，不然畫面會停在舊的樣子。
 *
 *   store 改變 ─► InvalidateOnStore 自動 redraw      （安全網，寧可多畫也不要漏畫）
 *   零件還在飛 / 滑 ─► PartNode 的 useFrame 每格 redraw(true)
 *   動畫播放中 ─► AnimationDriver 每格 redraw(true)
 *   不經過 store 的改變（計時器、材質、環境貼圖）─► 自己在 effect 裡 redraw()
 *
 * redraw(true) = 連陰影圖也要重畫（有東西移動、顯示、隱藏了）。只轉鏡頭、只高亮時不需要，省下整台車再畫一遍。
 *
 * 「多補幾格」是用自己的計數器合併的（RedrawDriver 每格消耗一次），不要直接 invalidate(n)：
 * 一次切換背景會讓 148 個零件各呼叫一次，R3F 的 invalidate(n) 會把 n 累加到 60 格，等於白畫一秒。
 */
import { invalidate } from '@react-three/fiber'

/** 之後還要補畫幾格。React 的 effect（改 visible、材質、castShadow）可能比第一次重畫晚，所以多給幾格 */
const EXTRA_FRAMES = 3
let extraFrames = 0
let shadowFrames = 0

export function redraw(shadow = false) {
  if (shadow) shadowFrames = EXTRA_FRAMES
  extraFrames = EXTRA_FRAMES
  invalidate()
}

/** RedrawDriver 每格呼叫：這一格之後還要不要續畫、這一格要不要更新陰影圖 */
export function tickRedraw(): { more: boolean; shadow: boolean } {
  const shadow = shadowFrames > 0
  if (shadow) shadowFrames--
  const more = extraFrames > 0
  if (more) extraFrames--
  return { more, shadow }
}
