# 全站審查報告：硬體正確性 × 程式效率

審查日期：2026-11-02　審查對象：`n20-sim` 目前的 `main`（commit `fd57b84`）
審查角色：BMW 造車工程師（看資料對不對）＋ SRE / 軟體工程師（看程式穩不穩、快不快）

> 本報告只「指出問題與建議」，**沒有改任何程式或資料**。每一條建議都有「怎麼驗證」，你可以自己照著做。

---

## 處理狀態（2026-11-02，ZL 指示「須調整的地方全數修正」）

| 編號 | 狀態 | 做了什麼 |
|---|---|---|
| H1 正時鏈位置 | ✅ 已修 | 10 個零件的位置／文字改到前方（VANOS 用 `rotation.y=180` 翻面），`eng.timing.chain` 改成 requires 減震皮帶盤＋油底殼、不再要求飛輪；情境文字、`disassembly.test`、`p6.test`、`engineParts.ts` 的鏈輪與背板座標同步修改 |
| H2 真空來源 | ✅ 已修 | 總泵、節氣門、洩壓閥三處文字改正，來源登記 `bimmerworld_vacuum` |
| H3 輪圈扭力 | ✅ 已填（community） | 140 Nm，來源 Bimmer Guides（稱引自 BMW 維修手冊）。四個輪子的 fastener、三個導覽的裝輪步驟、保養頁警語都更新。**請用車主手冊確認後再升 verified** |
| H4 機油容量 | ✅ 已修 | 數字拿掉，耗材改 unverified，說明寫明 FCP 4.5 L vs Jerry 5.3 qt 的矛盾；來源登記 `getjerry_n20_oil` |
| H5 散文標籤 | ✅ 簡單版 | 新增 `npm run report:claims` → `docs/CLAIMS_REPORT.md`（目前 82 句） |
| H6 小疑點 | ✅ 已修 | HPFP 文字、渦輪／中冷器的「P4 補相依」句子（渦輪改成真的 requires `exh.downpipe_cat`）、手排油週期散文、總泵「左側（LHD）」、凸輪軸感知器改前端。機油加注蓋左右側仍待你用照片確認 |
| H7 真空泵零件 | ✅ 已加 | `eng.head.vacuum_pump`（料號 11667622380，community），產生器 `vacuum_pump_v1` |
| S1 GPU 漏記憶體 | ✅ 已修 | `disposeObject()`（ModelResolver）在 PartNode / GlbObject / CompareView 卸載時呼叫。實測切換 4 次 geometry 373 → 373 |
| S2 錯誤邊界 | ✅ 已修 | `ErrorBoundary.tsx` 包住整個 App；沒有 WebGL 顯示文字提示而不掛 Canvas；壞掉的零件檔記成 issue 顯示在「關於」頁 |
| S3 延遲載入 | ✅ 部分 | CompareView / LearnPanel / MaintenancePanel 改 `React.lazy`；drei 另外分包。**題庫／情境 JSON 仍在首包**（改成非同步載入要動 loadData 的同步 API 與測試，另開一個階段做） |
| S4 useFrame | ✅ 已修 | 到位就不再改 position |
| S5 訂閱瘦身 | ✅ 已修 | PartNode 改用 `useShallow` 一次訂閱；hint 只取 token |
| S6 CI 加固 | ✅ 已修 | `.nvmrc`、`engines`、Dependabot、`npm run e2e`（headless 冒煙：console error、draw calls、記憶體漏、拆一個零件）並接進 deploy.yml。CSP 沒做（Vite dev 會注入 inline script，GitHub Pages 又不能設 header） |
| S7 小修 | ✅ 已修 | 寫死字串改 `t()`；validate 多三條檢查；`pickDetail` 加觸控點數；meta description；favicon |

驗證：`npm run validate` ✓（164 零件、24 來源）、`npm test` 68/68 ✓、`npm run build` ✓、`npm run e2e` ✓。

---

## 0. 我理解的目標與問題

**你的目標**：做一個能拿去教別人的 F30 320i（N20）拆裝模擬器。它要能在手機上跑、資料不准瞎編、錯的扭力比沒有扭力更危險。

**你現在想解決的問題**：專案 P0–P7 都做完了，接下來不知道「哪裡還有錯、哪裡還能更快更穩」。你需要一份有優先順序的清單，而不是一堆零散意見。

```
                 ┌──────────────────────────┐
                 │  硬體面：資料對不對？      │  ← 造車工程師的眼睛
   這份報告 ──►  │  軟體面：跑得快、不會掛？  │  ← SRE 的眼睛
                 │  兩邊各給「優先順序」      │
                 └──────────────────────────┘
```

---

## 1. 一頁總結

| 面向 | 現況 | 一句話結論 |
|---|---|---|
| 資料誠實度 | 289 個數值，82% 標「待查證」，0 個 verified | 很誠實，但「文字敘述」裡藏了幾個**實質錯誤**，信心標籤管不到它們 |
| 最嚴重的硬體錯誤 | 正時鏈位置寫成「引擎後方、靠變速箱側」 | **錯了。N20 正時鏈在引擎前方。** 這個錯誤連帶影響 6 個零件的位置、相依與一個情境的教學文字 |
| 程式正確性 | 68 個單元測試全過、`npm run validate` 全過、打包 9 秒 | 核心邏輯穩 |
| 效能 | 桌機 358 draw calls、20 萬三角形 | 可以，但**切換變速箱會漏 GPU 記憶體**（實測 370 → 856 個 geometry） |
| 可靠性 | 沒有 ErrorBoundary、沒有 WebGL 不支援的提示 | 一筆資料壞掉或舊手機沒 WebGL2，使用者看到的是白畫面 |
| 建置部署 | CI 有驗證＋測試＋打包，推 main 自動上 Pages | 架構正確，缺 e2e 與 Node 版本鎖定 |

**優先順序（建議的處理順序）**

```
 P0 立刻處理（教錯人）        P1 下一個版本            P2 有空再做
 ───────────────────────     ───────────────────      ──────────────────
 H1 正時鏈在前不在後          H4 機油容量來源矛盾       H7 缺真空泵零件
 H2 煞車真空來源寫錯          S2 ErrorBoundary/WebGL    S5 零件節點訂閱太多
 S1 變速箱切換漏記憶體        S3 首包太大、延遲載入      S6 CI 加 e2e / 版本鎖
 H3 輪圈螺絲扭力可查          H5 文字敘述也要有信心標籤  S7 小修（i18n 硬字串等）
```

---

## 2. 硬體面（BMW 工程師視角）

### 先講好的地方

- 大方向都對：N20 直四渦輪縱置後驅、雙渦流、Valvetronic、直噴、電子水泵、塑膠導軌老化、機濾座墊片漏油、8HP45 齒比與接合表、GS6-17BG 料號、電瓶在後廂右側要註冊、F30 沒機油尺。
- 「扭力不知道就留 null」這條規則被徹底執行，連放油螺絲（來源互相矛盾 8 vs 25 Nm）都誠實留白，這是對的。
- 相依規則（拆父件子件跟著走、requires 例外清單、反順序裝回）邏輯清楚，而且有測試在守。

### H1（P0）正時鏈在引擎「前方」，不是後方 ★最重要

**現況**：`data/parts/engine.json` 多處寫「N20 正時鏈在引擎後方、靠變速箱那一側，所以要先拆變速箱／飛輪」。零件位置也照這個假設擺：VANOS、張緊器、鏈條、導軌全部在 x ≈ −0.31～−0.33（引擎後端），凸輪軸「後端裝 VANOS」，`eng.timing.chain` 的 `requiresVariant` 還要求先拆 DMF／驅動盤。`scn.cold_rattle` 的 replaceNote 也教學生「要先拆變速箱」。

**查證結果**：FCP Euro 的 N20 正時鏈更換教學（[Part 1](https://www.fcpeuro.com/blog/how-to-replace-the-bmw-n20-timing-chain-part-1-removal)）：鏈條在**引擎前方、曲軸皮帶盤與正時蓋後面**；流程是拆減震皮帶盤、油底殼、氣門室蓋、VANOS 鏈輪、導軌，**不拆變速箱、不拆飛輪**（飛輪只用固定工具鎖住）。VANOS 電磁閥在氣門室蓋**前端**，高壓油泵在 VANOS 蓋旁邊（缸頭上方），凸輪軸感知器也跟上鏈條一起從前方拆。

```
  實際的 N20（側視，+X 車頭）                 模擬器現在畫的
  ┌─────────────────────────┐               ┌─────────────────────────┐
  │皮帶盤│ 正時鏈 │  缸體   │變速箱           │皮帶盤│  缸體   │ 正時鏈 │變速箱
  │  ◎   │ ╭─╮   │         │ ▒▒▒            │  ◎   │         │ ╭─╮    │ ▒▒▒
  │      │ │ │   │         │                │      │         │ │ │    │
  │      │ ╰─╯   │         │                │      │         │ ╰─╯    │
  └─────────────────────────┘               └─────────────────────────┘
   +X ◄── 車頭                                     鏈條跑到飛輪那一側了 ✗
```

**影響範圍**（改資料就好，不用改程式）：

| 檔案 / 零件 | 要改什麼 |
|---|---|
| `eng.assembly` explain.specific | 刪「正時鏈在引擎後方…」 |
| `eng.timing.chain` | 位置改到前端（x ≈ +0.33）、`requiresVariant` 的 DMF／flexplate 拿掉、warnings 改成「要先拆減震皮帶盤、油底殼、氣門室蓋」、requires 加 `eng.front.vibration_damper` |
| `eng.timing.guides`、`eng.timing.tensioner` | 位置改前端 |
| `eng.timing.vanos_intake` / `vanos_exhaust` / `vanos_solenoids` | 位置改前端；explain「後端」改「前端」 |
| `eng.head.camshaft_intake` / `camshaft_exhaust` | 「後端裝 VANOS」改「前端」 |
| `elec.cam_sensors` | 位置 x=−0.2 改前端 |
| `eng.head.cylinder_head` explain | 「因為正時鏈在後方」那句刪掉 |
| `data/scenarios/basic.json` `scn.cold_rattle` replaceNote | 刪「要先拆變速箱」；改成「要拆減震皮帶盤與油底殼，並檢查吸油網」 |
| `src/scene/procedural/engineParts.ts` 第 4、52、493 行註解與鏈輪座標 | 這是**產生器**，和 U6 材質那條線無關，但等那邊收工再改比較安全 |
| `src/core/disassembly.test.ts` 第 141–152 行 | 測試現在「要求」鏈條 requires 飛輪，資料改了測試要一起改 |

**為什麼嚴重**：這是教學工具，正時鏈又是 N20 最有名的大工程。學生學到「要拆變速箱」，去到實車會完全找不到鏈條。

### H2（P0）煞車倍力器的真空來源寫錯

**現況**：
- `brk.master_cylinder`：「N20 有電動真空泵幫倍力器（待查證）」
- `eng.intake.throttle_body`：節氣門「主要負責…製造煞車倍力器需要的真空」
- `eng.boost.wastegate`：「致動方式（真空或電子）待查證」

**查證結果**：N20/N26 有一顆**凸輪軸驅動的機械真空泵**，鎖在缸頭後方靠防火牆，料號 11667622380，同時供應煞車倍力器、渦輪洩壓閥致動器與排氣閥門（[BimmerWorld](https://www.bimmerworld.com/Brakes/Vacuum-Pump-For-N20-N26-Engines-F22-F23-F30-F31-F32-F33-F34-F36-F10.html)；FCP Euro 教學也說它「在缸頭後方幾乎貼著防火牆」）。

```
   凸輪軸 ──► 機械真空泵（缸頭後方）──┬──► 煞車倍力器
                                    ├──► 渦輪洩壓閥致動器（真空式）
                                    └──► 排氣閥門（有配的話）
   節氣門 ✗ 不是真空來源（Valvetronic 引擎節氣門平常幾乎全開，本來就抽不到真空）
```

**建議**：三處文字改掉；新增零件 `eng.head.vacuum_pump`（見 H7）；洩壓閥寫「真空致動」並附來源。

### H3（P1）輪圈螺絲扭力其實查得到

**現況**：四個輪子的「輪圈螺絲」都是 null，explain 寫「約 120–140 Nm（待查證）」，導覽的裝輪步驟也留白。

**建議**：這個值在 **F30 車主手冊（技術資料／車輪與輪胎）** 就有，是原廠文件，可以升到 `verified`。我記憶中是 140 Nm（M14×1.25），但**請你用自己手上的車主手冊確認後再填**，並把手冊登記到 `sources.json`（type: oem）。這會是全站第一個 verified 的扭力，而且是學生最常用到的一個。

### H4（P1）機油容量兩個來源不一致

**現況**：`mnt.oil` 與 `proc.oil_change` 寫「約 4.5 L（FCP Euro，community）」。

**查證結果**：另一個來源（[Jerry](https://getjerry.com/car-repair/bmw-n20-oil-capacity)）寫 5.3 quart（≈ 5.0 L）。兩邊差 0.5 L，對沒有機油尺的 F30 來說，加到 4.5 L 可能顯示偏低。

**建議**：照你們放油螺絲的做法，來源矛盾就**把數字拿掉、在 note 寫明兩個來源各說多少**，等查到車主手冊再填。放油螺絲 25 Nm 我也再找了一個來源（kevinsautos），但它沒註明出處，不足以解除矛盾，維持 null 是對的。

### H5（P1）「文字敘述」沒有信心標籤，錯誤會從這裡溜進來

H1、H2 都不是數字，是 `explain.specific`、`warnings`、`replaceNote` 裡的一句話。現在的 schema 只管 `specs` / `fasteners` / `partNumbers` / `interval` 的 confidence，**散文沒人管**，validate 也抓不到。

```
   數字  ──► SourcedValue{value, source, confidence} ──► validate 擋得住 ✓
   句子  ──► 純字串                                   ──► 沒人擋      ✗  ← H1/H2 從這裡進來
```

**建議（二選一，先做簡單的）**：
1. 簡單版：寫一個 `npm run report:claims`，把所有 explain / warnings / notes 裡含「（待查證）」的句子列成表，當成待辦清單（和 VERIFY_REPORT 併在一起）。
2. 完整版：schema 加一個 `claims: [{text, source, confidence}]`，把「位置」「驅動方式」這種關鍵事實從散文抽出來，介面顯示時帶標籤。

### H6（P2）其他較小的硬體疑點（都已標待查證，列出來方便你查）

| 零件 | 現況寫法 | 我的看法 |
|---|---|---|
| `eng.fuel.hpfp` | 位置示意 | FCP 教學說它在 VANOS 蓋旁（缸頭上方），不是遠在後端 |
| `eng.head.oil_filler_cap` | z = −0.09（左側） | 之前 U0 討論時實車照片顯示在右側，請以照片為準 |
| `eng.boost.turbo` warnings | 「實車還要先拆排氣前段（P4 加入後補上相依）」 | P4 已經做完，`exh.downpipe_cat` 已存在，可以把這句改成真的 requires |
| `eng.boost.intercooler` | 同上「P4 加入後補上相依」 | `requires` 已經有 `body.front_bumper`，那句話可以刪 |
| `trans.manual.assembly` | 「變速箱油是終身油，但多數人建議 10 萬公里換」 | 沒來源的數字出現在散文裡，和保養頁「待查證」互相矛盾 |
| `mnt.oil` oem 16,000 km / 12 個月 | 來源是 BMW 北美 CBS 表 | 寫法 OK，但台灣原廠是 CBS 動態算，建議在介面再強調一次「以車上顯示為準」 |
| `brk.master_cylinder` 位置 | z = −0.6（左） | 左駕車正確，但 explain 寫「駕駛座側」在英文版對 RHD 讀者會混淆，建議寫「左側（LHD）」 |

### H7（P2）值得補的零件

- `eng.head.vacuum_pump` 機械真空泵（H2 的主角，也是 N20 常見漏油點）。
- `eng.intake.pcv`／曲軸箱通風現在併在氣門室蓋裡，OK；但 `eng.boost.charge_pipe` 把兩段畫成一組，教學上分成「渦輪→中冷」「中冷→節氣門」會更清楚。

---

## 3. 軟體面（SRE 視角）

### 實測數據（本次在雲端容器跑）

| 項目 | 結果 |
|---|---|
| `npm run validate` | 163 零件、29 工具、20 來源、14 導覽、54 題、15 保養、7 情境，全部通過 |
| `npm test` | 6 個檔案 68 個測試全過，2.1 秒 |
| `npm run build` | 9 秒；`index` 499 KB（gzip 146）、`vendor` 583 KB（gzip 179）、`three` 754 KB（gzip 194）。**首次載入要下載約 520 KB gzip 的 JS** |
| 無頭瀏覽器（軟體 GL，quality=mid） | 358 draw calls、20.4 萬三角形、370 個 geometry、JS heap 43 MB、0 個 console error |
| 切換手排／自排 6 次後 | draw calls 不變，但 **geometry 從 370 增到 856**，之後透視切換不再增加 |

### S1（P0）切換變速箱會漏 GPU 記憶體

**現象**：每切一次變體，`Scene` 把整棵 `PartNode` 樹重建；舊零件的 `THREE.Group` 是在 `useMemo` 裡自己 `new` 出來、用 `<primitive>` 掛上去的，React Three Fiber **不會自動 dispose primitive**，所以舊的 geometry／material 留在 GPU。

```
   切換變體 ──► Scene 重建 ──► 新零件 geometry +163 ◄── 舊的沒 dispose
                                  370 → 452 → 534 → … → 856（實測 6 次）
   手機上多切幾次 → WebGL context lost → 黑畫面
```

**改法（小、安全、不碰 registry.ts）**：在 `PartNode` 的 `ProceduralHolder` 和 `GlbObject` 加卸載清理：

```ts
useEffect(() => () => {
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mm.dispose()
  })
}, [obj])
```
注意共用的雜訊貼圖（`noiseTex()`）不要 dispose，材質 dispose 不會動到 texture，所以上面這段是安全的。`CompareView` 的 `StaticPart` 也一樣。

**驗證**：開 `?stats=1`，切換變體幾次，看 `geometries` 不再上升。

### S2（P0）沒有錯誤邊界、沒有 WebGL 檢查

- `loadData` 裡 parts 壞掉會 `console.error` 然後**靜默跳過整個檔案**（例如 brakes.json 壞了，煞車系統就消失，沒人知道）；procedures／quizzes／maintenance 用的是 `.parse()`，壞掉會**直接 throw，整個 App 白畫面**。
- 沒有 `ErrorBoundary`；3D 場景裡任何例外（例如某個產生器在低階 GPU 上爆掉）都會讓整頁死掉。
- 舊 Android / iOS 低電量模式有時拿不到 WebGL2，R3F 會丟錯，使用者只看到白畫面。

**建議**：
1. `App` 外層包一個 `ErrorBoundary`，顯示「載入失敗，請換瀏覽器／重新整理」並列出錯誤（走 `t()`）。
2. `Scene` 之前先 `canvas.getContext('webgl2')` 檢查，不行就顯示文字版零件樹（PartTree 與 InfoCard 不靠 3D，其實都還能用）。
3. `loadData` 跳過壞檔時，把 issue 放進 `issues` 陣列並在「關於」頁顯示，不要只 console。

### S3（P1）首包太大，大部分使用者用不到的東西也先載

`index` 這包 499 KB 裡包含：全部 JSON 資料（約 320 KB 原始）、全部程式化產生器、六個分頁 UI、第二個 Canvas（對照模式）。手機 4G 下首次開啟要等 1.5–3 秒純下載。

```
   現在：index.js ─┬─ 零件資料（必要）
                  ├─ 產生器（必要）
                  ├─ 題庫 / 情境 / 保養 / 導覽（點「學習」才需要）  ← 可延遲
                  ├─ CompareView（點「對照」才需要）                ← 可延遲
                  └─ Zod 驗證（打包時已經 validate 過，瀏覽器再驗一次）← 可省
```

**建議**：
1. `React.lazy` 包 `CompareView`、`LearnPanel`、`MaintenancePanel`（各自 `Suspense fallback`）。
2. `data/procedures|quizzes|maintenance|scenarios` 改成 `import.meta.glob(..., { eager: false })`，在 `loadData` 提供 `loadLearning()` 非同步載入。
3. 瀏覽器端的 Zod 驗證可以保留（它也擋了執行期錯誤），但 `vendor` 裡 zod v4 約 60 KB gzip；如果想省，用 `safeParse` 只在 `import.meta.env.DEV` 跑，production 直接信任 CI 驗過的資料。
4. 現在 `three` 單獨一包是對的；再把 `three/examples/jsm` 和 drei 從 `vendor` 拆出，快取命中率更高（改 vite.config 的 manualChunks 就好）。

### S4（P1）每一格畫面 163 個零件都在算 lerp

`PartNode.useFrame` 不管有沒有在動，每格都做 `target.copy().addScaledVector()` + `position.lerp()`，而且 `position` 一改，three 每格都要重算 163 個 group 的 world matrix。

**建議**：靜止時提早返回：

```ts
if (a.fly === goal && s.explode === lastExplode.current && g.position.distanceToSquared(target) < 1e-8) return
```
三行就能把閒置時的每格成本降到接近零，手機電池會感謝你。

### S5（P2）零件節點訂閱太多 store 欄位

每個 `PartNode` 訂閱 11 個 selector（163 × 11 ≈ 1,800 個 listener）。Zustand 在**任何** `set()` 後會跑完所有 listener；`hover()` 在滑鼠掃過零件時每次都 set，等於每次 hover 跑 1,800 次比較。`hint` 整個物件被訂閱，每次拆裝 163 個節點全部 re-render。

**建議**：用 `useShallow` 把一個節點需要的欄位合成一個 selector；`hint` 只訂閱 `hint?.token` 再用 `getState()` 取內容。這是「有空再做」，目前桌機感覺不出來。

### S6（P2）CI / 部署加固

| 項目 | 現況 | 建議 |
|---|---|---|
| Node 版本 | workflow 寫 22，repo 沒 `.nvmrc` / `engines` | 加 `"engines": {"node": ">=22"}` 與 `.nvmrc`，避免本機跟 CI 不同版 |
| e2e | 有 Playwright 手動測，CI 沒跑 | CI 加一條「打包 → preview → headless 開 `?stats=1&quality=mid` → 斷言 0 console error、draw calls < 500」。本報告的 S1 就是這樣抓到的 |
| 依賴更新 | 無 | 加 Dependabot（每月），three / R3F 大版本升級前先跑 e2e |
| 快取 | Pages 預設 | 檔名已有 hash，OK；`index.html` 設短快取即可 |
| 安全標頭 | Pages 不能設 CSP header | 可用 `<meta http-equiv="Content-Security-Policy">` 限制 script 只能來自同源；外連連結已有 `rel="noreferrer"` ✓ |

### S7（P2）小修清單

- `CompareView.tsx:116`、`AnimPanel.tsx:86`、`MaintenancePanel.tsx:40,43` 有寫死的中英文，違反 CLAUDE.md「介面文字一律走 `t()`」。
- `scripts/validate.ts` 的 `res_has_scn` 每呼叫一次就重讀所有情境檔；改成先建 Set。
- `validate.ts` 沒檢查 `specs[].key` 在同一零件內是否重複（`InfoCard` 用 key 當 React key，重複會警告）。
- `validate.ts` 可以加一條：`taiwanConservative.km` 若有值必須 ≤ `oem.km`（保守建議不該比原廠寬鬆）。
- `pickDetail()` 用 UA 判斷手機；iPadOS 的 Safari 會偽裝成桌機拿到 `high`。現在有 `PerformanceMonitor` 兜底所以沒事，但可以加 `navigator.maxTouchPoints > 1` 當第二訊號。
- `index.html` 缺 `<meta name="description">`，分享連結時沒有摘要。

---

## 4. 建議的執行順序（可以直接當成下一個階段的 PLAN）

```
 第一步（只改資料 + 測試，半天）
 ├─ H1 正時鏈搬到前方，拿掉飛輪相依，改情境文字，改 disassembly.test
 ├─ H2 真空來源三處文字
 └─ H4 機油容量改成矛盾待查
          │  npm run validate && npm test
          ▼
 第二步（程式，小改，等 U6 材質那條線收工後）
 ├─ S1 dispose（PartNode / CompareView）
 ├─ S2 ErrorBoundary + WebGL 檢查
 └─ S4 useFrame 提早返回
          │  ?stats=1 切換變體看 geometries
          ▼
 第三步（有空）
 ├─ H3 輪圈扭力（你查車主手冊）、H7 真空泵零件
 ├─ S3 延遲載入、S6 CI e2e
 └─ H5 claims 標籤、S5 訂閱瘦身、S7 小修
```

---

## 5. 這次查證用到的來源（都可以登記進 `sources.json`）

| 用途 | 來源 |
|---|---|
| 正時鏈在前方、不拆變速箱；VANOS 電磁閥在氣門室蓋前端；HPFP 在 VANOS 蓋旁；真空泵在缸頭後方 | [FCP Euro — N20 timing chain Part 1](https://www.fcpeuro.com/blog/how-to-replace-the-bmw-n20-timing-chain-part-1-removal)（type: diy） |
| 真空泵凸輪軸驅動、供應倍力器＋洩壓閥＋排氣閥門、料號 11667622380 | [BimmerWorld — Vacuum Pump N20/N26](https://www.bimmerworld.com/Brakes/Vacuum-Pump-For-N20-N26-Engines-F22-F23-F30-F31-F32-F33-F34-F36-F10.html)（type: parts_catalog） |
| 機油容量 5.3 qt（與 FCP 4.5 L 矛盾） | [Jerry — BMW N20 oil capacity](https://getjerry.com/car-repair/bmw-n20-oil-capacity)（type: media） |
| 放油螺絲 25 Nm（無出處，不足以採用） | [kevinsautos FAQ](https://kevinsautos.com/faq/what-is-the-torque-spec-of-the-n20-drain-plug.html) |

沒查到可靠來源、我**沒有**填數字的：輪圈螺絲扭力（請用車主手冊）、火星塞型號與扭力、ATF 油底殼螺絲扭力、差速器油規格。

---

## 6. 本次審查怎麼做的（讓你能重現）

1. 把 9 個零件檔、保養、導覽、情境、題庫全部展開成純文字逐條讀（右側鏡像零件略過）。
2. 挑出「不是待查證、或待查證但方向明顯可疑」的技術陳述，用網路查證 5 個關鍵點（結果在第 5 節）。
3. 讀 `Scene / PartNode / ModelResolver / useAppStore / loadData / optimize / disassembly / validate / vite.config / deploy.yml`。
4. 在容器裡跑 `npm ci && npm run validate && npm test && npm run build`，再用 headless Chromium 開 `vite preview`，讀 `window.__n20perf`，切換變體與透視模式各數次，比較 geometry 數。
