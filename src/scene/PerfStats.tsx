import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * 效能小面板：網址加 ?stats=1 才會出現（P7 驗收「中階手機 30 fps」用）。
 * 左下角顯示 FPS、draw calls、三角形數，同時寫到 window.__n20perf 給自動測試讀。
 */
export const statsEnabled = () => new URLSearchParams(location.search).get('stats') === '1'

export function PerfStats() {
  const { gl, scene } = useThree()
  const box = useRef<HTMLDivElement | null>(null)
  const acc = useRef({ frames: 0, time: 0 })

  useEffect(() => {
    // 自動測試用：讀得到 3D 場景（例如檢查動畫有沒有真的動到零件）
    ;(window as unknown as { __n20scene: unknown }).__n20scene = scene
    const div = document.createElement('div')
    div.className = 'perf-stats'
    document.body.appendChild(div)
    box.current = div
    return () => { div.remove() }
  }, [scene])

  useFrame((_, dt) => {
    const a = acc.current
    a.frames++; a.time += dt
    if (a.time < 0.5) return
    const fps = a.frames / a.time
    a.frames = 0; a.time = 0
    const { calls, triangles } = gl.info.render
    const out = { fps: Math.round(fps), calls, triangles, geometries: gl.info.memory.geometries, dpr: gl.getPixelRatio() }
    ;(window as unknown as { __n20perf: typeof out }).__n20perf = out
    if (box.current) box.current.textContent = `${out.fps} fps · ${calls} draw calls · ${(triangles / 1000).toFixed(0)}k 三角形 · dpr ${out.dpr.toFixed(2)}`
  })
  return null
}
