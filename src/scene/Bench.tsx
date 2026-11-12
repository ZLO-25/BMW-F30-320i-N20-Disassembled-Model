import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { percentile } from './PerfStats'
import { useAppStore } from '../store/useAppStore'
import { ui } from '../core/i18n'

/**
 * E0：?bench=1 一鍵跑分（給沒有開發工具的人用，例如在手機上）。
 *
 *   載入完成 ─► 等 2.5 秒（著色器編譯、環境貼圖）─► 鏡頭繞車一圈 6 秒（每格都畫）─► 畫面中央顯示結果
 *
 * 結果是純文字，按「複製」就能貼回對話。繞圈時每格都 invalidate()，所以按需渲染（E1）之後也量得到真實的連續幀。
 */
const WARMUP_MS = 2500
const ORBIT_MS = 6000

export type BenchResult = {
  avgFps: number; frameMsP50: number; frameMsP95: number; frameMsMax: number; frames: number
  detail: string; dpr: number; canvas: string; gpu: string; msToFirstFrame: number; cores: number; ua: string
}

export function gpuName(gl: THREE.WebGLRenderer): string {
  try {
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  } catch { return 'unknown' }
}

export function formatBench(r: BenchResult): string {
  return [
    `N20 bench`,
    `avg FPS: ${r.avgFps}`,
    `frame ms p50 / p95 / max: ${r.frameMsP50} / ${r.frameMsP95} / ${r.frameMsMax}  (${r.frames} frames)`,
    `quality: ${r.detail}`,
    `dpr: ${r.dpr}  canvas: ${r.canvas}`,
    `GPU: ${r.gpu}`,
    `load -> first frame: ${r.msToFirstFrame} ms`,
    `cores: ${r.cores}`,
    `UA: ${r.ua}`,
  ].join('\n')
}

export function Bench({ detail }: { detail: string }) {
  const { camera, controls, gl, invalidate } = useThree()
  const st = useRef<{ phase: 'wait' | 'orbit' | 'done'; t0: number; first: number; dts: number[]; start: THREE.Vector3; tgt: THREE.Vector3 } | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const lang = useAppStore.getState().lang

  useEffect(() => () => { box.current?.remove() }, [])

  useFrame((_, dt) => {
    const now = performance.now()
    if (!st.current) {
      st.current = { phase: 'wait', t0: now, first: Math.round(now), dts: [], start: new THREE.Vector3(), tgt: new THREE.Vector3() }
    }
    const s = st.current
    if (s.phase === 'done') return
    invalidate()   // 跑分期間每格都要畫
    if (s.phase === 'wait') {
      if (now - s.t0 < WARMUP_MS) return
      const c = controls as unknown as { target: THREE.Vector3 } | null
      s.tgt.copy(c?.target ?? new THREE.Vector3(1.15, 0.55, 0))
      s.start.copy(camera.position)
      s.phase = 'orbit'; s.t0 = now
      return
    }
    // orbit
    const p = Math.min(1, (now - s.t0) / ORBIT_MS)
    s.dts.push(dt * 1000)
    const rel = s.start.clone().sub(s.tgt)
    rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), p * Math.PI * 2)
    camera.position.copy(s.tgt).add(rel)
    const c = controls as unknown as { update: () => void } | null
    if (c) c.update(); else camera.lookAt(s.tgt)
    if (p < 1) return
    s.phase = 'done'
    camera.position.copy(s.start)
    if (c) c.update()
    const sorted = [...s.dts.slice(1)].sort((a, b) => a - b)
    const total = s.dts.slice(1).reduce((x, y) => x + y, 0)
    const cv = gl.domElement
    const r: BenchResult = {
      avgFps: +(sorted.length / (total / 1000)).toFixed(1),
      frameMsP50: +percentile(sorted, 0.5).toFixed(1), frameMsP95: +percentile(sorted, 0.95).toFixed(1),
      frameMsMax: +(sorted[sorted.length - 1] ?? 0).toFixed(1), frames: sorted.length,
      detail, dpr: +gl.getPixelRatio().toFixed(2), canvas: `${cv.width}x${cv.height}`, gpu: gpuName(gl),
      msToFirstFrame: s.first, cores: navigator.hardwareConcurrency ?? 0, ua: navigator.userAgent,
    }
    ;(window as unknown as { __n20bench: BenchResult }).__n20bench = r
    const div = document.createElement('div')
    div.className = 'bench-result'
    const pre = document.createElement('pre'); pre.textContent = formatBench(r)
    const btn = document.createElement('button'); btn.textContent = ui('benchCopy', lang)
    btn.onclick = () => { navigator.clipboard?.writeText(pre.textContent ?? '').then(() => { btn.textContent = ui('benchCopied', lang) }, () => { btn.textContent = ui('benchCopyFail', lang) }) }
    const close = document.createElement('button'); close.textContent = ui('close', lang)
    close.onclick = () => div.remove()
    const h = document.createElement('strong'); h.textContent = ui('benchTitle', lang)
    div.append(h, pre, btn, close)
    document.body.appendChild(div)
    box.current = div
  })
  return null
}
