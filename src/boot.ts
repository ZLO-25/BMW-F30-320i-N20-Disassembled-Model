/** E3：推載入畫面（index.html 裡的 #boot）的進度。載入畫面不存在（測試、已移除）時什麼都不做。 */
declare global {
  interface Window { __boot?: { done: () => void } }
}
export const bootDone = () => { try { window.__boot?.done() } catch { /* 同上 */ } }
