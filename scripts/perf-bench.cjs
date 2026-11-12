/**
 * npm run perf — 效能量測（E0）。先 `npm run build`，再執行；會自己開 vite preview。
 *
 *   對 high / mid / low 各量：載入時間、長工作、draw call、三角形、著色器程式數、貼圖數、JS 記憶體、
 *   每格毫秒（中位數 / P95）、閒置 3 秒畫了幾格；另外量：
 *     - 切換變速箱 6 次後的貼圖與幾何數（記憶體漏失）
 *     - 鏡頭從 3.6 m 拉到 1.5 m 前後的著色器程式數（F11：工作燈是否造成重新編譯）
 *     - 各 chunk 的 gzip 大小
 *   結果寫到 docs/perf/latest.json 並印出表格。
 *
 * 注意：雲端容器沒有顯示卡，3D 用 SwiftShader 軟體繪圖。「每格毫秒」只能比大小，不是真實 FPS；
 * 個數類（draw call、三角形、程式數、貼圖數、閒置重繪）是準的。真實 FPS 請用 ?bench=1。
 * 環境變數：PW_CHROMIUM 指定瀏覽器；PERF_ONLY=high,mid 只量部分；PERF_SKIP_SWITCH=1 略過切換變速箱。
 */
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = path.resolve(__dirname, '..')
const PORT = 4189
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForServer(url, ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* 還沒起來 */ }
    await sleep(300)
  }
  throw new Error('preview server did not start')
}

function chunkSizes() {
  const dir = path.join(ROOT, 'dist/assets')
  const out = {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue
    const buf = fs.readFileSync(path.join(dir, f))
    out[f.replace(/-[\w-]{8}\.js$/, '')] = { rawKB: Math.round(buf.length / 1024), gzipKB: Math.round(zlib.gzipSync(buf).length / 1024) }
  }
  return out
}

async function main() {
  const only = (process.env.PERF_ONLY || 'high,mid,low').split(',')
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const result = { when: new Date().toISOString(), chunks: chunkSizes(), runs: {} }
  try {
    await waitForServer(`http://localhost:${PORT}/`)
    const browser = await chromium.launch({
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
    })
    for (const q of only) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } })
      const page = await ctx.newPage()
      page.setDefaultTimeout(180000)
      await page.addInitScript(() => {
        window.__lt = []
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration) }).observe({ type: 'longtask', buffered: true })
      })
      const t0 = Date.now()
      await page.goto(`http://localhost:${PORT}/?stats=1&quality=${q}`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__n20perf, null, { timeout: 180000 })
      const msToStats = Date.now() - t0
      await sleep(6000)   // 等著色器、接觸陰影都穩定
      const read = () => page.evaluate(() => {
        const p = window.__n20perf, gl = window.__n20gl
        return { ...p, programs: gl.info.programs.length, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }
      })
      const run = { msToStats, ...(await read()) }
      run.longTasks = await page.evaluate(() => ({ count: window.__lt.length, longestMs: Math.round(Math.max(0, ...window.__lt)) }))
      run.scene = await page.evaluate(() => {
        let meshes = 0, tris = 0
        window.__n20scene.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 } })
        return { meshes, triangles: Math.round(tris) }
      })
      // 閒置：3 秒內畫了幾格（按需渲染之後應為 0）
      const f0 = await page.evaluate(() => window.__n20frames)
      await sleep(3000)
      const f1 = await page.evaluate(() => window.__n20frames)
      run.idleRendersIn3s = f1 - f0
      // 連續畫時的每格毫秒：用 __n20cam 每格微動鏡頭 6 秒
      run.moving = await page.evaluate(async () => {
        const dts = []; let last = performance.now(); const t0 = last; let a = 0
        await new Promise(res => {
          const f = (t) => {
            a += 0.02
            window.__n20cam(1.15 + Math.cos(a) * 3.2, 1.5, Math.sin(a) * 3.2, 1.15, 0.55, 0)
            dts.push(t - last); last = t
            if (t - t0 > 6000) res(); else requestAnimationFrame(f)
          }
          requestAnimationFrame(f)
        })
        dts.shift(); dts.sort((x, y) => x - y)
        return { frames: dts.length, p50: Math.round(dts[Math.floor(dts.length / 2)]), p95: Math.round(dts[Math.floor(dts.length * 0.95)]) }
      })
      run.callsMinAfterMoving = (await read()).callsMin
      // BVH 建樹在閒置時分批做，等它做完再量射線
      await page.waitForFunction(() => window.__n20bvh && window.__n20bvh.queued === 0, null, { timeout: 120000 }).catch(() => {})
      // E4：一次射線檢查多久（BVH 開 / 關比較在檔案最後；這裡記目前設定的值與建樹時間）
      run.pickMs = await page.evaluate(() => ({ ...window.__n20pick(-0.1, -0.05, 30), bvh: window.__n20bvh }))
      // F11：鏡頭拉近前後的著色器程式數
      await page.evaluate(() => window.__n20cam(1.15 + 3.0, 1.2, 2.0, 1.15, 0.55, 0)); await sleep(2500)
      const far = await read()
      await page.evaluate(() => window.__n20cam(1.15 + 1.2, 0.9, 0.9, 1.15, 0.55, 0)); await sleep(2500)
      const near = await read()
      run.zoomIn = { programsFar: far.programs, programsNear: near.programs }
      // 切換變速箱
      if (!process.env.PERF_SKIP_SWITCH) {
        const before = await read()
        for (let i = 0; i < 6; i++) { await page.click(`.seg button:has-text("${i % 2 === 0 ? '手排' : '自排'}")`); await sleep(q === 'low' ? 1500 : 3000) }
        await sleep(5000)
        const after = await read()
        run.switch6 = { texturesBefore: before.textures, texturesAfter: after.textures, geometriesBefore: before.geometries, geometriesAfter: after.geometries }
      }
      result.runs[q] = run
      console.log(q, JSON.stringify(run))
      await ctx.close()
    }
    // E4：BVH 關閉（?bvh=0）時的射線檢查，拿來和上面比
    if (!process.env.PERF_SKIP_BVH0) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } })
      const page = await ctx.newPage(); page.setDefaultTimeout(180000)
      await page.goto(`http://localhost:${PORT}/?stats=1&level=1&bvh=0`, { waitUntil: 'load' })
      await page.waitForFunction(() => window.__n20perf, null, { timeout: 180000 })
      await sleep(3000)
      result.pickNoBvh = await page.evaluate(() => ({ ...window.__n20pick(-0.1, -0.05, 30), bvh: window.__n20bvh }))
      console.log('pick without BVH', JSON.stringify(result.pickNoBvh))
      await ctx.close()
    }
    await browser.close()
  } finally { server.kill() }
  fs.mkdirSync(path.join(ROOT, 'docs/perf'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'docs/perf/latest.json'), JSON.stringify(result, null, 1))
  console.log('\n寫入 docs/perf/latest.json')
}

main().catch(e => { console.error(e); process.exit(1) })
