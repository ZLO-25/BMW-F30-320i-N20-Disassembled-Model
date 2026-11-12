/**
 * npm run e2e — 打包後的冒煙測試（審查 S6）。
 * 用 headless Chromium 開 `vite preview`，讀 ?stats=1 寫到 window.__n20perf 的數據，檢查：
 *   1. 沒有 console error / page error
 *   2. draw calls 在合理範圍（< 600）
 *   3. 切換手排／自排 4 次後 geometry 數量不會一直漲（審查 S1 的記憶體漏洞回歸測試）
 *   4. 拆一個零件（引擎飾蓋）托盤會出現
 *   5. E2 畫質第 3 級與手動切換畫質
 *   6. E1 按需渲染：靜止時不重畫；每種操作（拖曳、爆炸圖、剖面、背景、車殼模式、拆下、動畫）都會讓畫面「真的變」，然後停下來
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

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** E1：按需渲染的回歸測試用小工具。frames() = 累計畫了幾格（PerfStats 每格更新） */
const makeHelpers = (page) => {
  const frames = () => page.evaluate(() => window.__n20frames ?? 0)
  const shot = () => page.locator('canvas').first().screenshot()
  // 等到連續 2.5 秒沒有新畫面（軟體繪圖一格要好幾百毫秒，所以用「穩定」而不是固定秒數），最多等 maxMs
  const settle = async (maxMs = 40000) => {
    const t0 = Date.now()
    let last = await frames(), since = Date.now()
    while (Date.now() - t0 < maxMs) {
      await sleep(400)
      const f = await frames()
      if (f !== last) { last = f; since = Date.now() }
      else if (Date.now() - since > 2500) return true
    }
    return false
  }
  return { frames, shot, settle }
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
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
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

    const { frames, shot, settle } = makeHelpers(page)

    // E1-a：靜止時不重畫
    if (!(await settle())) fails.push('never became idle after load (still rendering continuously)')
    const idle0 = await frames()
    await sleep(3000)
    const idle1 = await frames()
    console.log('idle frames in 3s:', idle1 - idle0)
    if (idle1 - idle0 > 0) fails.push(`idle re-render: ${idle1 - idle0} frames in 3 s`)

    // E1-b：每種操作都要讓畫面真的變，而且之後會停下來
    const act = async (label, fn, { expectChange = true, expectIdle = true, maxMs = 40000 } = {}) => {
      const before = await shot()
      const f0 = await frames()
      await fn()
      await sleep(600)
      const ok = await settle(maxMs)
      const after = await shot()
      const f1 = await frames()
      const changed = !before.equals(after)
      console.log(`  ${label}: frames +${f1 - f0}, canvas ${changed ? 'changed' : 'SAME'}, ${ok ? 'idle' : 'STILL RENDERING'}`)
      if (expectChange && !changed) fails.push(`[E1] ${label}: canvas did not change`)
      if (expectChange && f1 === f0) fails.push(`[E1] ${label}: no frame was rendered`)
      if (expectIdle && !ok) fails.push(`[E1] ${label}: never went idle`)
    }
    await page.click('.tools-fab')
    await act('orbit drag', async () => {
      const box = await page.locator('canvas').first().boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45, { steps: 6 }); await page.mouse.up()
    }, { maxMs: 150000 })   // 慣性滑行約 60 格；軟體繪圖一格近 1 秒
    // draw call 要在「普通畫面」上量：載入後前幾格都在畫接觸陰影（多畫一遍整台車），中位數要等轉過鏡頭才準
    const pOrbit = await read()
    console.log('draw calls after orbit (median of last 20 frames):', pOrbit.calls)
    if (pOrbit.calls > 600) fails.push(`draw calls too high: ${pOrbit.calls}`)
    await act('explode slider', () => page.locator('.tools-panel input[type=range]').first().fill('0.8'))
    await act('explode back', () => page.locator('.tools-panel input[type=range]').first().fill('0'))
    await act('section cut (cross)', () => page.click('.tools-panel .seg:has-text("橫切") button:has-text("橫切")'))
    await act('section off', () => page.click('.tools-panel .seg:has-text("橫切") button:has-text("關")'))
    await act('background plain grid', () => page.click('.tools-panel button:has-text("簡潔格線")'))
    await act('background workshop', () => page.click('.tools-panel button:has-text("修車廠")'))
    await act('body x-ray', () => page.click('.topbar button:has-text("透視")'))
    await act('body hidden', () => page.click('.topbar button:has-text("隱藏")'))
    await act('body solid', () => page.click('.topbar button:has-text("實體")'))
    await act('reset camera after orbit', async () => {
      const box = await page.locator('canvas').first().boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 4 }); await page.mouse.up()
      await settle()
      await page.click('.topbar button[title*="視角"]')
    })

    // 動畫播放中：持續在畫（frames 一直增加）；停止後要停下來
    await page.click('.side-tabs button:has-text("動畫")')
    await page.click('.anim-list .anim-item >> nth=0')
    await sleep(1500)
    const a0 = await frames(); await sleep(2500); const a1 = await frames()
    console.log('animation running, frames in 2.5s:', a1 - a0)
    if (a1 - a0 < 1) fails.push('[E1] animation selected but nothing is rendering')
    await page.click('.anim-body button.link')
    if (!(await settle())) fails.push('[E1] still rendering after animation stopped')
    await page.click('.side-tabs button:has-text("零件樹")')

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
    await act('remove a part', () => page.click('.actions button.primary'))
    const tray = await page.$eval('.side-tabs .count', el => el.textContent).catch(() => null)
    if (tray !== '1') {
      await page.click('.side-tabs button:has-text("托盤")').catch(() => {})
      fails.push(`tray count expected 1, got ${tray}: ${(await page.textContent('.pane.show').catch(() => '')).slice(0, 300)}`)
    }

    // E2：畫質第 3 級（後處理 + 半解析度 AO + 2x 取樣）也要能按需渲染；檢視工具的畫質切換要生效（含重建畫布）
    {
      const p2 = await browser.newPage({ viewport: { width: 960, height: 600 } })
      p2.on('pageerror', e => errors.push(`pageerror(L3): ${e}`))
      p2.on('console', m => { if (m.type() === 'error') errors.push(`console(L3): ${m.text()}`) })
      await p2.goto(`http://localhost:${PORT}/?stats=1&level=3`, { waitUntil: 'load' })
      await p2.waitForFunction(() => window.__n20perf, null, { timeout: 90000 })
      const h2 = makeHelpers(p2)
      if (!(await h2.settle(60000))) fails.push('[E2] L3: never went idle after load')
      const q0 = await h2.frames(); await sleep(3000)
      if ((await h2.frames()) - q0 > 0) fails.push('[E2] L3: re-rendering while idle')
      await p2.click('.tools-fab')
      const note0 = await p2.textContent('.tools-note')
      if (!/3/.test(note0 ?? '')) fails.push(`[E2] quality note should show level 3, got: ${note0}`)
      const shotA = await h2.shot()
      await p2.click('.topbar button:has-text("隱藏")')
      await sleep(600)
      if (!(await h2.settle(60000))) fails.push('[E2] L3: never went idle after body hidden')
      if (shotA.equals(await h2.shot())) fails.push('[E2] L3: canvas did not change after hiding the body')
      // ?level= 強制時按「流暢」會解鎖並套用 L2（原生抗鋸齒，需要重建畫布）
      await p2.click('.tools-panel .seg:has-text("流暢") button:has-text("流暢")')
      await sleep(800)
      if (!(await h2.settle(90000))) fails.push('[E2] L2: never went idle after switching quality')
      const note1 = await p2.textContent('.tools-note')
      if (!/2/.test(note1 ?? '')) fails.push(`[E2] quality note should show level 2, got: ${note1}`)
      const saved = await p2.evaluate(() => localStorage.getItem('n20.quality.v1'))
      if (!saved || !saved.includes('"smooth"')) fails.push(`[E2] quality choice not saved: ${saved}`)
      await p2.close()
    }

    if (errors.length) fails.push(...errors.slice(0, 5))
    await browser.close()
  } finally {
    server.kill()
  }
  if (fails.length) { console.error('✗ e2e smoke failed:\n  ' + fails.join('\n  ')); process.exit(1) }
  console.log('✓ e2e smoke passed')
}

main().catch(e => { console.error(e); process.exit(1) })
