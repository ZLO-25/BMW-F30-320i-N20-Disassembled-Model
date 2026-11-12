# CLAUDE.md — 專案慣例

BMW F30 320i（N20）互動式拆解教學模擬器。需求原文在 `PROMPT.md`，計畫在 `docs/PLAN.md`。

## 工作方式

- **一次只做一個階段**（見 `docs/PLAN.md`）。階段結束要回報：做了什麼、怎麼測、已知問題，然後停下來等確認。
- 有不清楚的地方先問，不要自己假設規格。

## 資料不准瞎編（最重要）

- 扭力、容量、尺寸、料號、週期：每個數值都要有 `source` 與 `confidence`。
- 查不到就填 `null` + `"confidence": "unverified"`，介面顯示「待查證」。**錯誤的扭力值比沒有扭力值更危險。**
- 不准憑記憶填數字。來源要是網址或文件名稱，登記在 `data/sources.json`。
- 新增資料後跑 `npm run validate`。

## 程式與資料分離

- 零件、步驟、規格、測驗、情境、保養全部在 `data/`。新增零件**只改資料，不改程式**。
- 格式定義在 `src/core/schema.ts`（Zod），說明文件在 `docs/DATA_SCHEMA.md`，兩者要同步。
- 零件 `id` 用點分隔：`<system>.<subsystem>.<part>`，例如 `eng.timing.chain`。全小寫、底線分字。

## 模型

- `modelRef` 兩種格式：`procedural:<name>_v<n>` 或 `glb:/models/<file>.glb#<node>`。
- 程式化零件產生器放在 `src/scene/procedural/`，在 `registry.ts` 註冊，必須接受 `detail: 'high'|'mid'|'low'`。
- 外部模型只能用 CC0 / CC-BY，記錄在 `CREDITS.md`（「關於」頁會讀它）。
- 單位：場景 1 單位 = 1 公尺。座標系（右手）：+X 車頭方向、+Y 向上、**+Z 車身右側（左駕車的副駕駛座側）**。

```
          +Y（上）
           │
           │    +X（車頭）
           │   ╱
           │  ╱
           │ ╱
           └──────── +Z（右側 / 副駕側）
```

- 拆裝語意（詳見 docs/PLAN.md「拆裝的三條規則」）：拆父件子件跟著走；`requires` 是必須先單獨拆掉的例外清單；裝回順序是拆下的反順序。

## 程式碼

- TypeScript strict。React 函式元件 + hooks。狀態放 Zustand（`src/store/`）。
- `src/core/` 是純邏輯，不 import React 或 three，要有 Vitest 測試。
- 動畫在 `useFrame` 裡直接改物件，不要每格 setState。
- localStorage 讀寫一律包 try/catch，讀不到時 App 要能正常運作。
- 介面文字一律走 `t()`，不寫死中文或英文。零件名稱顯示為「中文 / English」。

## 目錄

```
data/            JSON 資料（parts/ procedures/ quizzes/ scenarios/ maintenance/ tools.json sources.json）
public/models/   外部 GLB
src/core/        schema、相依圖、拆裝邏輯、進度
src/scene/       R3F 場景、ModelResolver、procedural/、動畫
src/ui/          介面元件
src/store/       Zustand
docs/            PLAN、DATA_SCHEMA、MODEL_SOURCES
```

## 指令（P1 起生效）

- `npm run dev` 開發
- `npm test` 單元測試
- `npm run validate` 驗證 data/
- `npm run report:verify` 待查證比例報表
- `npm run build` 打包到 `dist/`（GitHub Pages）

## P2 之後
- 拆裝規則：`src/core/disassembly.ts`（純 TS，有 Vitest）。新增零件後一定要跑 `npm test`，裡面會檢查「拆到曲軸再裝回」不會卡住。
- 零件位置要和 `src/scene/procedural/engineParts.ts` 的座標註解一致。
- 材質一律用 `registry.ts` 的 `M.*` 預設（PBR），不要每個零件自己調金屬度。
- 環境光用 `src/scene/workshop.ts` 的程式化「修車廠」房間（R1，不連網、不用圖檔），不要改回 drei `<Environment preset>`（會連外網抓 HDR）。

## P3 之後
- 變速箱變體：零件用 `transmissionVariant`，相依用 `removal.requiresVariant`；載入一律走 `buildGraph(parts, variant)`，UI 不要自己過濾。
- 動畫定義在 `src/scene/animations.ts`，靠產生器子物件的命名慣例（見 DATA_SCHEMA「動畫怎麼接到模型」）；新增會動的零件時照慣例取名。
- 變速箱產生器在 `src/scene/procedural/transParts.ts`；`grp()` 之類的小幫手在那個檔案最上面。
- 手排齒比目前是示意值（`MANUAL_RATIOS`，有註明），查到 GS6-17BG 官方齒比再換；自排齒比與接合表來自 Wikipedia ZF 8HP（community）。
- 對照模式（`CompareView.tsx`）用自己的 Canvas 與自己的 PartRegistry，和主畫面互不干擾。

## P4 之後
- 零件資料分檔：`data/parts/{car,engine,transmission,driveline,exhaust,chassis,brakes,steering,electrical}.json`，載入時依系統順序排序（loadData 的 ORDER），不是依檔名。
- 底盤等產生器在 `src/scene/procedural/chassisParts.ts`；桿件一律沿 +X 畫，方向用資料的 `rotation`（gen 裡的 `arm()` 會從兩端座標算中點與角度）。
- 左右對稱零件用同一個產生器，左側加 `rotation.y = 180`。
- 輪子是獨立零件（`chs.wheel_*`），車殼產生器不再畫輪子。
- 網址 `?quality=low|mid|high` 可強制畫質；Playwright 測試用 `mid` 才跑得動。
- 新系統的零件加進來後，`npm test` 的「整車從外拆到內只剩 car.root 與 body.shell」會自動涵蓋。


## P5 之後
- 教學資料：`data/procedures/*.json`（導覽）、`data/quizzes/*.json`（題目）、`data/levels.json`（學習路徑）；格式在 DATA_SCHEMA「P5 定稿」各節，`npm run validate` 會檢查引用。
- 學習進度邏輯在 `src/core/progress.ts`（純邏輯，有測試）：解鎖、計分、錯誤觸發 `mistakesFor`。介面只呼叫它，不要在元件裡算分。
- 錯誤示範寫在零件的 `removal.mistakes`，trigger 只有 `remove_without_tool:<tool>` 與 `remove_before:<part>` 兩種；加新零件有危險操作時順手寫。
- `tryRemove(g, id, { skipMistakes })`：導覽與「故意做錯」會跳過錯誤檢查；一般點拆下不要跳過。
- 側欄分頁「學習」= `LearnPanel`，裡面依狀態切成等級清單 / `GuidePanel` / `QuizPanel`；錯誤示範是 `MistakeModal`。
- 新 UI 字串一律加進 `src/core/i18n.ts` 的 UI 物件（中英都要）。

## P6 之後
- 保養在 `data/maintenance/*.json`、情境在 `data/scenarios/*.json`，格式見 DATA_SCHEMA「P6 定稿」。保養週期沒有來源就 km / months 留 null，text 寫要看什麼。
- 每一種變速箱都要看得到 14 項保養、至少 5 個情境，題目至少 50 題：validate 與 `src/core/p6.test.ts` 都會擋。
- 加新情境時，`p6.test.ts` 會自動驗證它在對應變體裡拆得到、裝得回；`replace` 只能放兩種變體都有的零件，除非情境本身限定變體。
- 拆解提示用 `nextRemovalStep` / `removalPlan`（`src/core/disassembly.ts`），不要在 UI 自己寫找路邏輯。
- 側欄分頁：零件樹 / 資訊 / 托盤 / 動畫 / 學習（等級、導覽、小考、情境）/ 保養。

## P7 之後
- 程式化零件載入時會「合併同材質的 mesh」（`src/scene/procedural/optimize.ts`）。**動畫要單獨動的子物件一定要取名字**（`obj.name = '...'`），有名字的節點會保留下來；沒名字的會被合併掉。`optimize.test.ts` 會檢查名字與外形不變。
- `?merge=0` 關掉合併（除錯用）、`?stats=1` 顯示 FPS / draw calls，並把場景放在 `window.__n20scene` 給自動測試讀。
- （E2 起）畫質與像素比由 `src/core/quality.ts` 的畫質設定檔決定，自動降級是 `Scene.tsx` 的 `QualityGovernor`；`PerformanceMonitor` 已拿掉。
- 部署：推到 main 就由 `.github/workflows/deploy.yml` 驗證、測試、打包、發佈到 GitHub Pages。
- 查證回顧的修改寫在產生器 `p7.py`（每筆都有來源）；來源互相矛盾的數值（例：N20 放油螺絲 8 Nm vs 25 Nm）維持 null，並在警告文字裡寫明矛盾。
- **子件的 `position` 是相對父件的**（3D 裡是巢狀 group）。在產生器裡用整車座標寫子件時，要先減掉父件位置（例：`p4.py` 的 `rs_local()`）。`src/core/positions.test.ts` 會擋下整車座標跑到車外的零件。
- 桌機側欄寬度可拖曳（`SideResizer`，存在 localStorage `n20.sideWidth.v1`，雙擊恢復 380px）；手機版仍是下方抽屜拖高度。

## U6 之後（材質與光影）
- 表面紋理在 `src/scene/procedural/grain.ts`：程式產生、三面投影（不靠 UV），`M.*` 透過 `registry.ts` 的 `grained()` 接上。強度只改 `GRAIN_SETTINGS`。新材質要有質感就用 `grained(kind, ...)`，不要自己加 bumpMap。
- AO 用 `@react-three/postprocessing` 的 N8AO（`PostFX.tsx`，延遲載入），開不開、全／半解析度、Bloom、取樣數都由畫質設定檔（`core/quality.ts`）決定。`?ao=0` 強制關。
- 掛後處理時色調映射由最後的 `<ToneMapping>` 做；背景 / 格線顏色與透視透明度（`PartNode.ghostTuning`）在 AO 開啟時有補償，改這些顏色要兩組一起改。
- GLB 材質載入時用 `materialMatch.ts` 的 `presetForMaterial` 換成 `M.*`。

## 審查後（2026-11-02，見 docs/REVIEW_REPORT.md）
- **N20 正時鏈在引擎前方**（皮帶盤後面），不是變速箱側；VANOS 在凸輪軸前端、正時鎖從後端固定。資料與產生器都已照這個改，不要再改回去。
- 煞車倍力器真空來自缸頭後方的機械真空泵（`eng.head.vacuum_pump`），不是節氣門、也不是電動泵。
- 用 `<primitive>` 掛上去的物件 R3F 不會自動釋放：零件卸載時一律呼叫 `disposeObject()`（`ModelResolver.tsx`），不然切換變速箱會漏 GPU 記憶體。
- `PartNode` 用 `useShallow` 一次訂閱 store；新增欄位時加進那個 selector，不要再另外 `useAppStore(s => ...)`。
- 只有點到才需要的面板用 `React.lazy`（CompareView / LearnPanel / MaintenancePanel）；被首包元件共用的小幫手放 `learnHelpers.ts`，不要從面板檔 import。
- `npm run e2e`：打包後的 headless 冒煙測試（console error、draw calls、切換變體記憶體、拆一個零件），CI 會跑；本機沒裝瀏覽器時 `npx playwright install chromium`。
- `npm run report:claims`：列出散文裡標「待查證／示意」的句子（docs/CLAIMS_REPORT.md）。查到來源後改句子並登記 sources.json。
- 來源互相矛盾的數值（放油螺絲 8 vs 25 Nm、機油 4.5 vs 5.0 L）維持 null，矛盾寫在說明文字裡。

## 查核後（2026-11-02，見 docs/AUDIT_REPORT.md）
- **冷氣濾網在車內副駕腳部空間**（手套箱下，T20），不在引擎室；E90 才在進氣飾蓋下。
- 缸頭後端：**高壓油泵在排氣側（右）**（排氣凸輪軸驅動，ST1111）、**真空泵在進氣側（左）**（推論，文字有寫明）。高壓油管產生器 `hp_line_v1` 是照這個走的。
- 機油泵在平衡軸殼體飛輪側、由平衡軸齒輪帶動；平衡軸才是曲軸鏈條帶的（ST1111 p.72）。
- **前軸 x=+1.5、後軸 x=−1.31（軸距 2.81 m）**，輪距前 1.543 / 後 1.583 m；車殼後輪拱、傳動軸長度（`driveshaft_v1` 約 1.1 m）都照這個。動後軸相關零件時十個都要一起動。
- 透視時 `PartNode.applyGhostSpecular` 會把材質改成霧面（關 clearcoat／金屬度／環境反射），切回實體還原；新增會透視的材質不用自己處理。
- **不要把 drei / three-stdlib 另外分 chunk**：和 `@react-three/postprocessing` 循環載入會讓整頁白掉（forwardRef undefined）。`npm run e2e` 會抓到。
- `?stats=1` 另外提供 `window.__n20cam(px,py,pz,tx,ty,tz)` 給自動截圖擺鏡頭。
- ZL 實車照片（`sources.json` 的 `zl_owner_photos_2026`）確認：**機油加注蓋在氣門室蓋前端右側（排氣側）**、**320i 單支尾管在左**。照片含車牌，不放進 repo。


## R1 之後（光與環境，2026-11-12）
- 場景舞台在 `src/scene/Stage.tsx`：`WorkshopEnvironment`（反射 + 背景）、`StageFloor`（水泥地 / 格線）、`SoftContactShadows`、`WorkLight`。修車廠房間與水泥地貼圖在 `workshop.ts`（純 three，有測試）。
- 背景模式 `stage`：`workshop`（預設）/ `studio`（原本的深色格線），檢視工具裡切換，存在 localStorage `n20.stage.v1`。簡潔模式的顏色補償在 `STUDIO_COLORS`。
- 接觸陰影不是每格更新：store 的拆裝、爆炸、顯示、車殼模式、變體改變後停 0.65 秒再重畫 2 格。新增會改變外形的 store 欄位時，加進 `SoftContactShadows` 的相依清單。
- 工作燈跟著鏡頭，距離 target < 2.4 m 才亮（E1 起一直在場景裡、遠處強度 0，不要改回切 visible）；Bloom 只在 L5。
- `cylX/cylY/cylZ` 在 high 會產生有倒角的圓柱（`cylinderY`，半徑 ≥ 8 mm）；外形範圍不變，mid / low 照舊。要刀口邊的特殊零件直接用 `new THREE.CylinderGeometry`。

## R2 之後（引擎室寫實化，2026-11-12）
- 零件可寫 `shape: { basis: schematic|photo|scan|cad, source }`（外形依據）；不寫 = 示意。非 schematic 一定要有 source（validate 會擋），資訊卡會顯示這一行。照 ZL 實車照片重畫的零件標 `photo` + `zl_owner_photos_2026`。
- 連接件小幫手在 `registry.ts`：`hexHead(d, af, h)`（六角螺栓頭，底部在 y=0）、`hoseClamp(d, r)`（管束，沿 Y 軸）；`engineParts.ts` 的 `clampLike()` 把沿 Y 的環轉到管子端點方向。low 會自動退成簡單形狀。
- 照片確認的位置（不要改回去）：**空濾盒是車頭中間、水箱上方的 T 字形盒**（`AIRBOX` 常數，`eng.intake.airbox` 在 (1.8, 0.82, −0.04)）；**副水箱 `eng.cooling.expansion_tank` 在引擎室左前角**（1.72, 0.68, −0.58，掛在 car.root）；引擎飾蓋右前有缺口讓機油加注蓋露出來。
- 進氣管路徑點 `P_AIRBOX_OUT` → `P_COMP_IN`，改空濾盒位置時兩端一起改。

## R3–R5 之後（車殼、引擎運轉、螺栓級拆裝，2026-11-12）
- **車殼**（`bodyShell.ts`）：照 ZL 側面照 / 車尾照描的輪廓表 `PROFILE`（yTop / yBelt / yBot / hw / hs，X 由後往前），每隔幾公分取截面放樣成一張車皮，再用 `regionOf()` 切成 `shell / hood / fbumper / rbumper / trunk` 五塊。各塊零件的 `position` 必須等於 `ORIGIN`（產生器會減掉）。改輪廓只改 `PROFILE`，`bodyShell.test.ts` 會檢查長寬高對得上規格、引擎蓋高過避震器上座。
- 前避震器 `chs.front_strut_*` 降到 y 0.36（上座頂 0.94），避震塔在車殼裡；不要再把它們調高，會穿出引擎蓋。
- 車色：`PAINTS`（registry.ts）+ store `paint`（localStorage `n20.paint.v1`），`M.paint()` 會帶 `userData.paint`，`PaintSync` 換色時直接改材質。預設是 ZL 實車的白（近似色，不是色號）。
- **引擎運轉**：純邏輯在 `src/core/engineCycle.ts`（行程、點火順序、氣門開度、曲柄連桿，有測試）；動畫 `engine_running`（control `'rpm'`）在 `animations.ts` 的 `poseEngine()`。會動的節點：`piston_i` / `rod_i`（piston_rod_set）、`vi_i` / `ve_i`（valve_set）、`bal_0/1`（balance_shafts），其餘整個零件繞 X 轉。幾何常數在 `procedural/engineGeom.ts`，CYL_X 索引 3 = 1 缸（車頭）。
- 點火順序 1-3-4-2 目前是「直列四缸常見順序」，N20 原廠資料待查證；轉速上限 7,000 rpm 來自 wiki_n20 / bmwtuning_n20。
- 引擎外殼（缸體、缸頭、氣門室蓋、油底殼…）與車皮都標 `userData.shell`，播放任何動畫時自動半透明。
- 引擎聲 `src/scene/engineSound.ts`：Web Audio 即時合成（不是錄音），要使用者按下才出聲。
- **螺栓級拆裝**：純邏輯 `src/core/boltSteps.ts`，介面 `BoltDialog.tsx`，開關在檢視工具（localStorage `n20.boltMode.v1`，預設關）。store 的 `tryRemove/tryInstall` 在 boltMode 時先設 `pendingBolt`；導覽、故意做錯、全部裝回都會跳過（`skipBolts`）。扭力只在 fastener 有 source 時顯示數字。


## E0–E5 之後（效能與 UIUX，2026-11-12，見 docs/E0–E5_REPORT 與 docs/PERF_BASELINE.md）
- **按需渲染**：Canvas 是 `frameloop="demand"`，靜止就不畫。任何會讓畫面改變的事都要讓它重畫：store 改變由 `InvalidateOnStore` 自動處理；**不經過 store 的改變**（計時器、材質、環境貼圖、effect 裡改場景）要自己呼叫 `redraw()`（`src/scene/redraw.ts`）；會讓外形改變的（移動、顯示／隱藏）呼叫 `redraw(true)` 連陰影圖一起更新。不要直接用 `invalidate(n)`（n 會累加到 60 格，見 redraw.ts 註解）。持續移動的東西在 `useFrame` 裡每格 `redraw(true)` 續命。
- 陰影圖不每格重畫（`RedrawDriver` + `shadowMap.autoUpdate = false`）；只轉鏡頭不會更新。新增會動的東西記得 `redraw(true)`。
- `npm run e2e` 現在會檢查：閒置 3 秒 0 格、每種操作（拖曳、爆炸、剖面、背景、車殼模式、拆下、動畫）畫面真的變、之後會停、L3 畫質、手動切換畫質。新增會影響畫面的操作時，在 `scripts/e2e-smoke.cjs` 加一條 `act(...)`。
- **畫質**：`src/core/quality.ts` 六級階梯（L0–L5），`?quality=low|mid|high` 對應 L0/L1/L5，`?level=0..5` 直接指定；網址指定時不自動降級。檢視工具有「畫質：自動／流暢／均衡／精緻」，選擇存 localStorage `n20.quality.v1`。新增特效要加進 `QualityProfile`，不要在元件裡自己判斷裝置。
- AO 可以在執行中關掉：store 的 `postfx` 旗標會讓 `PartNode` 重套透視透明度（`ghostTuning`）。
- **載入**：`index.html` 有純 HTML 載入畫面，`src/boot.ts` 推進度；第一格前用 `compileAsync` 編譯著色器（Canvas 在這之前 `frameloop="never"`）。`PostFX.tsx` 與教學資料（`core/learnData.ts`，用 `loadLearnData()` / `useFullData()`）是動態載入，**不要從首包會用到的檔案直接 import 它們**。vite 的 `postfx` chunk 只能單向依賴 vendor / three；改分包後一定跑 `npm run e2e`。
- 射線：每個夠大的 mesh 建 BVH（three-mesh-bvh，`ModelResolver.tsx`，`?bvh=0` 可關），拖曳超過 4 px 時 `DragGuard` 暫停偵測；`disposeObject()` 會一併 `disposeBoundsTree()`。
- 量測：`?bench=1`（一鍵跑分，結果可複製）、`?stats=1`、`npm run perf`（headless，輸出 docs/perf/latest.json）、`npm run ui`（版面與按鈕大小，輸出 docs/e5/）。改效能相關的東西前後都跑一次，數字寫進報告。
- 介面：手機把次要控制項收進「⋯」（CSS `.topbar-more`）；手機按鈕最小 44 px、桌機 24 px（`styles.css`）；側欄分頁是 `role=tablist`，左右鍵切換；預設模式是「檢視」；預設視角依畫面長寬比算（`defaultView()`），資訊卡有「看這個零件」；第一次使用引導存 `n20.onboard.v1`。
- low 畫質的輪圈、碟盤用 16 邊（`chassisParts.ts` 的 `roundZ`）。

## R6-B 之後（實車照片疊圖，2026-11-12）
- 檢視工具 →「📷 實車照片疊圖」：純邏輯 `src/core/photoOverlay.ts`（焦距 → 視角、標準視角、讀 EXIF 35mm 等效焦距，有測試），狀態 `src/store/useOverlayStore.ts`（調整值存 localStorage `n20.overlay.v1`），介面 `src/ui/PhotoOverlay.tsx`（React.lazy），鏡頭 `src/scene/OverlayCamera.tsx`。
- **照片只用 `URL.createObjectURL` 放在記憶體**，不上傳、不存 localStorage；ZL 的照片含車牌，仍然不能放進 repo（截圖也不行）。
- 有照片且面板開著時，3D 鏡頭的視角 = 照片的視角（`cameraVfov(vfovFromFocal35(...), scale)`），只暫時隱藏照片時視角不變；關掉面板回到 42°。
- `CAR`（photoOverlay.ts）是車身外形常數，要和 `bodyShell.ts` 的 `BODY_X` 一致，`bodyShell.test.ts` 會檢查。
- 手機照片 EXIF 的焦距不一定可信：ZL 側面照記 24 mm，反推實際約 45 mm（裁切 / 變焦），而且畫面中心往下偏（`dy ≈ −23%`）。
- **前後懸用官方值**（`bmw_press_f30_us_2017`）：前 790、後 1,044 mm，車長 4,643 mm。`bodyShell.ts` 的 `stretchX()` 把照片描的 X 換成官方比例；hw / hs（俯視輪廓）直接用最終座標寫，兩端是圓弧（車頭圓鼻、車尾兩角收 16 cm）。
- 車頭車尾的燈、進氣口一律用 `endX(end, z)` / `endYaw(end, z)` 貼著弧面放，改 hw 之後不用逐一調位置。
