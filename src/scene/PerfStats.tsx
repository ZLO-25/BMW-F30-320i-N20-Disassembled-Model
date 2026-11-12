import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * 效能小面板：網址加 ?stats=1 才會出現（P7 驗收「中階手機 30 fps」用）。
 * 左下角顯示 FPS、draw calls、三角形數，同時寫到 window.__n20perf 給自動測試讀。
 */
export const benchEnabled = () => new URLSearchParams(location.search).get('bench') === '1'
export const statsEnabled = () => new URLSearchParams(location.search).get('stats') === '1' || benchEnabled()

/** E0：最近 N 格的每格毫秒（拿來算中位數與 P95）。讀的人：PerfStats 面板、Bench。 */
const RING = 120
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

export function PerfStats() {
  const { gl, scene, camera, controls } = useThree()
  const box = useRef<HTMLDivElement | null>(null)
  const acc = useRef({ frames: 0, time: 0 })

  useEffect(() => {
    // 自動測試用：讀得到 3D 場景（例如檢查動畫有沒有真的動到零件）
    ;(window as unknown as { __n20scene: unknown }).__n20scene = scene
  }, [scene])
  useEffect(() => {
    // 自動測試用：直接讀 renderer（shadowMap、info.programs、info.memory）
    ;(window as unknown as { __n20gl: unknown }).__n20gl = gl
  }, [gl])
  useEffect(() => {
    // 自動截圖用：把鏡頭擺到指定位置看指定目標（審查截圖才有固定視角可以前後比較）
    type Ctl = { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null
    ;(window as unknown as { __n20cam: unknown }).__n20cam = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      camera.position.set(px, py, pz)
      const c = controls as unknown as Ctl
      if (c) { c.target.set(tx, ty, tz); c.update() } else camera.lookAt(tx, ty, tz)
    }
  }, [camera, controls])
  useEffect(() => {
    const div = document.createElement('div')
    div.className = 'perf-stats'
    document.body.appendChild(div)
    box.current = div
    return () => { div.remove() }
  }, [scene])

  // U6：開了 AO 之後一個畫面會 render 好幾次（場景 + 後處理），three 預設每次 render 都把計數歸零，
  // 只會看到最後一次。改成自己在「每個畫面開頭」讀上一個畫面的總數、再歸零。
  useEffect(() => {
    gl.info.autoReset = false
    return () => { gl.info.autoReset = true }
  }, [gl])
  const last = useRef({ calls: 0, triangles: 0 })
  const ring = useRef<number[]>([])
  const callsRing = useRef<number[]>([])   // 最近 20 格的 draw call：取中位數，才不會被「接觸陰影多畫一遍」的那幾格影響
  const total = useRef(0)   // 累計畫了幾格（一格 = 一次 useFrame；後處理多次 render 也只算一格）

  const lastFrameAt = useRef(0)
  // E1：按需渲染之後靜止時沒有畫面，面板要顯示「閒置」而不是停在舊數字
  useEffect(() => {
    const id = setInterval(() => {
      if (box.current && lastFrameAt.current && performance.now() - lastFrameAt.current > 700) {
        box.current.dataset.idle = '1'
        box.current.textContent = `idle · 最近一次連續畫面 ${(window as unknown as { __n20perf?: { fps: number } }).__n20perf?.fps ?? '-'} fps`
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  useFrame((_, dt) => {
    last.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
    gl.info.reset()
    callsRing.current.push(last.current.calls); if (callsRing.current.length > 20) callsRing.current.shift()
    total.current++
    ;(window as unknown as { __n20frames: number }).__n20frames = total.current   // 每格更新，閒置測試讀這個
    lastFrameAt.current = performance.now()
    // 兩格之間隔了 1.5 秒以上 = 中間閒置過（按需渲染），那段不算「每格耗時」（軟體繪圖下真的有一格 1 秒多的，所以門檻不能太低）
    const a = acc.current
    const early = total.current <= 3   // 開頭幾格一定要發布一次，自動測試等的就是 __n20perf 出現
    if (dt <= 1.5) { a.frames++; a.time += dt; ring.current.push(dt * 1000); if (ring.current.length > RING) ring.current.shift() }
    if (!early && (dt > 1.5 || (a.time < 0.5 && a.frames < 20))) return
    const fps = a.time > 0 ? a.frames / a.time : 0
    a.frames = 0; a.time = 0
    const { triangles } = last.current
    const calls = percentile([...callsRing.current].sort((x, y) => x - y), 0.5)
    const sorted = [...ring.current].sort((x, y) => x - y)
    const out = {
      fps: Math.round(fps), calls, triangles, geometries: gl.info.memory.geometries, dpr: gl.getPixelRatio(),
      // E0：每格毫秒中位數 / P95、著色器程式數、貼圖數、累計畫了幾格
      frameMsP50: +percentile(sorted, 0.5).toFixed(1), frameMsP95: +percentile(sorted, 0.95).toFixed(1),
      programs: gl.info.programs?.length ?? 0, textures: gl.info.memory.textures, renders: total.current,
    }
    ;(window as unknown as { __n20perf: typeof out }).__n20perf = out
    if (box.current) { delete box.current.dataset.idle; box.current.textContent = `${out.fps} fps · ${calls} draw calls · ${(triangles / 1000).toFixed(0)}k 三角形 · dpr ${out.dpr.toFixed(2)} · p50 ${out.frameMsP50} ms · p95 ${out.frameMsP95} ms` }
  }, -1000) // 負的優先序：在所有其他 useFrame 與繪製之前執行，也不會接管繪製
  return null
}
