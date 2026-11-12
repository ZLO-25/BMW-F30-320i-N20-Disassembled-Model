/**
 * npm run e2e — 打包後的冒煙測試（審查 S6）。
 * 用 headless Chromium 開 `vite preview`，讀 ?stats=1 寫到 window.__n20perf 的數據，檢查：
 *   1. 沒有 console error / page error
 *   2. draw calls 在合理範圍（< 600）
 *   3. 切換手排／自排 4 次後 geometry 數量不會一直漲（審查 S1 的記憶體漏洞回歸測試）
 *   4. 拆一個零件（引擎飾蓋）托盤會出現
 * 用法：先 `npm run build`，再 `node scripts/e2e-smoke.cjs`（會自己開 preview）。
 * 環境變數 PW_CHROMIUM 可指定瀏覽器執行檔（例如容器內預裝的 /opt/pw-browsers/chromium）。
 */
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')

const PORT = 4173
const URL = `http://localhost:${PORT}/?stats=1&quality=mid`

async function waitForServer(url, ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* 還沒起來 */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('preview server did not start')
}

async function main() {
  const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  const fails = []
  try {
    await waitForServer(`http://localhost:${PORT}/`)
    const browser = await chromium.launch({
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', e => errors.push(`pageerror: ${e}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()} ${m.location()?.url ?? ''}`) })
    page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`) })
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__n20perf, null, { timeout: 90000 })
    // R1：接觸陰影在畫面靜止 0.65 秒後才重畫 2 格；軟體繪圖一秒才 1–2 格，要多等一下才是「靜止時」的數字
    await page.waitForTimeout(6000)
    const read = () => page.evaluate(() => window.__n20perf)
    const p0 = await read()
    console.log('initial', p0)
    if (p0.calls > 600) fails.push(`draw calls too high: ${p0.calls}`)

    // 切換變體 4 次：geometry 數量不該一直漲（允許少量快取差異）
    for (let i = 0; i < 4; i++) {
      await page.click(`.seg button:has-text("${i % 2 === 0 ? '手排' : '自排'}")`)
      await page.waitForTimeout(1200)
    }
    await page.waitForTimeout(6000)
    const p1 = await read()
    console.log('after 4 variant switches', p1)
    if (p1.geometries > p0.geometries * 1.3 + 20) fails.push(`geometry leak: ${p0.geometries} → ${p1.geometries}`)

    // 拆引擎飾蓋：點零件樹的搜尋 → 選零件 → 按「拆下」，托盤計數應出現
    await page.fill('input.search', 'engine_cover')
    await page.click('.tree .node.match .label')
    await page.click('.actions button.primary')
    await page.waitForTimeout(800)
    const tray = await page.$eval('.side-tabs .count', el => el.textContent).catch(() => null)
    if (tray !== '1') fails.push(`tray count expected 1, got ${tray}`)

    if (errors.length) fails.push(...errors.slice(0, 5))
    await browser.close()
  } finally {
    server.kill()
  }
  if (fails.length) { console.error('✗ e2e smoke failed:\n  ' + fails.join('\n  ')); process.exit(1) }
  console.log('✓ e2e smoke passed')
}

main().catch(e => { console.error(e); process.exit(1) })
