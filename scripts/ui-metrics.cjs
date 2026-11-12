/**
 * npm run ui — 介面量測與截圖（E5）。先 `npm run build`。
 * 量：手機 390×844 的 3D 畫面高度、小於 40 px 的按鈕數、桌機 1366×768 小於 24 px 的按鈕數、側欄分頁文字是否折行、
 * 是否有 tablist。截圖放 docs/e5/（desktop_*.png、mobile_*.png），結果寫 docs/e5/metrics.json。
 * 環境變數 PW_CHROMIUM 指定瀏覽器。
 */
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs/e5')
const PORT = 4192
const sleep = ms => new Promise(r => setTimeout(r, ms))
const MOB = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const res = {}
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break } catch { /* 等 server */ } await sleep(300) }
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    const metrics = (minPx) => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }
      const vis = [...document.querySelectorAll('button, select, summary, input[type=checkbox]')].filter(b => { const x = b.getBoundingClientRect(); return x.width > 0 && x.height > 0 })
      const tabs = [...document.querySelectorAll('.side-tabs [role=tab]')]
      return {
        topbar: r('.topbar'), disclaimer: r('.disclaimer'), viewport: r('.viewport'), side: r('.side'), tabsBar: r('.side-tabs'),
        buttonsTotal: vis.length, buttonsSmall: vis.filter(b => { const x = b.getBoundingClientRect(); return x.width < minPx || x.height < minPx }).length,
        tablist: !!document.querySelector('[role=tablist]'), tabCount: tabs.length,
        // 分頁文字有沒有折行：文字區塊高度超過一行（行高 × 1.5）就算折行
        tabsWrapped: tabs.filter(t => { const tx = t.querySelector('.tab-txt'); return tx && tx.getBoundingClientRect().height > parseFloat(getComputedStyle(tx).lineHeight) * 1.5 }).length,
        pageScrollX: document.documentElement.scrollWidth > window.innerWidth,
      }
    }
    // 桌機
    { const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage()
      await page.goto(`http://localhost:${PORT}/?stats=1&level=0`)
      await page.waitForFunction(() => window.__n20perf, null, { timeout: 120000 }); await sleep(2500)
      await page.screenshot({ path: path.join(OUT, 'desktop_1_default.png') })
      res.desktop = await page.evaluate(metrics, 24)
      await page.click('.tools-fab'); await sleep(800); await page.screenshot({ path: path.join(OUT, 'desktop_2_tools.png') })
      await ctx.close() }
    // 手機
    { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOB }); const page = await ctx.newPage()
      await page.goto(`http://localhost:${PORT}/?stats=1&level=0`)
      await page.waitForFunction(() => window.__n20perf, null, { timeout: 120000 }); await sleep(2500)
      await page.screenshot({ path: path.join(OUT, 'mobile_1_default.png') })
      res.mobile = await page.evaluate(metrics, 40)
      await page.tap('.more-btn'); await sleep(500); await page.screenshot({ path: path.join(OUT, 'mobile_2_menu.png') })
      await page.tap('.more-btn'); await sleep(300)
      await page.tap('.tools-fab').catch(() => {}); await sleep(800); await page.screenshot({ path: path.join(OUT, 'mobile_3_tools.png') })
      res.mobileToolsPanel = await page.evaluate(() => { const p = document.querySelector('.tools-panel'), v = document.querySelector('.viewport'); return p && v ? { panelH: Math.round(p.getBoundingClientRect().height), viewportH: Math.round(v.getBoundingClientRect().height) } : null })
      await ctx.close() }
    await browser.close()
  } finally { server.kill() }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
}
main().catch(e => { console.error(e); process.exit(1) })
