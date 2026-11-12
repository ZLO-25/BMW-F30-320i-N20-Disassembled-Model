/**
 * npm run shots:quality — L0–L5 同一視角各截一張（E2 報告用，看每一級犧牲了什麼）。先 `npm run build`。
 * 結果放 docs/e2/level_N.jpg。軟體繪圖下很慢（每張約 1 分鐘）。
 */
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs/e2')
const PORT = 4193
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break } catch { /* 等 server */ } await sleep(300) }
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    for (const level of [0, 1, 2, 3, 4, 5]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 620 } })
      page.setDefaultTimeout(240000)
      await page.goto(`http://localhost:${PORT}/?stats=1&level=${level}`)
      await page.waitForFunction(() => window.__n20perf, null, { timeout: 240000 })
      await page.evaluate(() => { document.querySelector('.onboard button')?.click() })
      // 固定鏡頭：看引擎室，近一點
      await page.evaluate(() => window.__n20cam(2.9, 1.25, 1.5, 1.75, 0.6, 0))
      await sleep(4000)
      await page.waitForFunction(() => true)
      await page.screenshot({ path: path.join(OUT, `level_${level}.jpg`), type: 'jpeg', quality: 82 })
      console.log('shot level', level)
      await page.close()
    }
    await browser.close()
  } finally { server.kill() }
}
main().catch(e => { console.error(e); process.exit(1) })
