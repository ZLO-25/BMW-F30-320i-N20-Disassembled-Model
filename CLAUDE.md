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
- 環境光用 three 內建 RoomEnvironment（不連網），不要改回 drei `<Environment preset>`。

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
- 手機的像素比由 drei `PerformanceMonitor` 自動調（掉到 30 fps 以下降到 1）。
- 部署：推到 main 就由 `.github/workflows/deploy.yml` 驗證、測試、打包、發佈到 GitHub Pages。
- 查證回顧的修改寫在產生器 `p7.py`（每筆都有來源）；來源互相矛盾的數值（例：N20 放油螺絲 8 Nm vs 25 Nm）維持 null，並在警告文字裡寫明矛盾。
