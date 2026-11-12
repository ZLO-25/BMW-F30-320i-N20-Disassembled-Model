/**
 * E2：裝置偵測（畫質起點用）。要在 Canvas 建立之前就知道顯示卡名稱，所以另外開一個小的
 * WebGL 環境讀 WEBGL_debug_renderer_info，讀完立刻釋放。讀不到（或被瀏覽器隱藏）回傳 null，視為「辨識不出」。
 */
export function isMobileDevice(): boolean {
  // iPadOS 的 Safari 會偽裝成桌機，所以多看一個觸控點數
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1
}

export function probeGpuRenderer(): string | null {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch { return null }
}
