/** E3：推載入畫面（index.html 裡的 #boot）的進度。載入畫面不存在（測試、已移除）時什麼都不做。 */
declare global {
  interface Window { __boot?: { set: (pct: number, text?: string) => void; done: () => void } }
}
export const bootSet = (pct: number, text?: string) => { try { window.__boot?.set(pct, text) } catch { /* 沒有載入畫面就算了 */ } }
export const bootDone = () => { try { window.__boot?.done() } catch { /* 同上 */ } }
