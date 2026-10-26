# BMW F30 320i（N20）互動式拆解教學模擬器

瀏覽器上的「虛擬修車廠」。需求在 `PROMPT.md`，計畫在 `docs/PLAN.md`，專案慣例在 `CLAUDE.md`。

> ⚠ 本工具為教學用途，實際維修請以原廠維修手冊為準。

## 在本機跑起來（Windows / macOS 都一樣）

1. 安裝 [Node.js](https://nodejs.org/) 20.19 以上（建議 22 LTS）。
2. 在專案資料夾開終端機：
   ```
   npm install
   npm run dev
   ```
3. 打開畫面上顯示的網址（通常是 http://localhost:5173 ）。
4. 電腦跑不動時，網址加 `?quality=mid` 或 `?quality=low` 關掉陰影、降低面數。
   網址加 `?stats=1` 會在左下角顯示 FPS 與 draw calls（量效能用）。
5. 手機測試：同一個 Wi-Fi 下，用 `npm run dev -- --host`，再用手機開終端機顯示的區網網址。

## 線上版（GitHub Pages）

網址：<https://zlo-25.github.io/BMW-F30-320i-N20-Disassembled-Model/>

```
推到 main ──► GitHub Actions：validate → test → build ──► 自動發佈到 Pages
```

流程寫在 `.github/workflows/deploy.yml`。資料驗證或測試沒過，就不會發佈，線上版會維持上一版。

## 其他指令

| 指令 | 用途 |
|---|---|
| `npm test` | 單元測試（相依圖、拆裝三規則、手排／自排各自把整車拆到只剩車身再裝回、學習進度與解鎖、每個情境都拆得到裝得回、P6 數量） |
| `npm run validate` | 檢查 `data/` 的 JSON 格式與相依關係，壞資料會擋下來 |
| `npm run report:verify` | 產出 `docs/VERIFY_REPORT.md`，統計「待查證」比例 |
| `npm run build` | 打包到 `dist/`（推到 main 時 GitHub 會自動做） |
| `npm run preview` | 預覽打包結果 |

## 怎麼新增零件（只改資料，不改程式）

```
data/parts/<系統>.json   ← 加一筆零件（格式見 docs/DATA_SCHEMA.md）
        │
        ├ modelRef: "procedural:xxx_v1"  → 在 src/scene/procedural/ 寫產生器並註冊
        └ modelRef: "glb:/models/x.glb#Node" → 把 GLB 放進 public/models/，不用寫程式
```

新增後跑 `npm run validate`。

## 怎麼新增導覽、題目、錯誤示範、保養、情境（P5 起，一樣只改資料）

```
data/procedures/<主題>.json   ← 一步一步的維修導覽（remove / install 步驟會真的動 3D）
data/maintenance/<主題>.json  ← 保養項目（原廠與台灣保守週期分開，各自有來源）
data/scenarios/<主題>.json    ← 故障情境任務（問診 → 判斷 → 拆 → 換 → 裝回）
data/quizzes/<主題>.json      ← 題目（identify / choice / order），level 決定屬於哪一級
data/levels.json             ← Lv1–Lv5 每級要做的事與通過門檻
data/parts/*.json → removal.mistakes  ← 「沒拿工具就拆」「該先拆的還沒拆」的後果
```

格式與 validate 會檢查的規則都在 `docs/DATA_SCHEMA.md`。學習進度存在瀏覽器（localStorage），側欄「學習」分頁最下面可以清除。

## 目錄

```
data/            零件（依系統分檔）、工具、來源、導覽 procedures、題目 quizzes、學習路徑 levels、保養 maintenance、情境 scenarios（JSON）
docs/            PLAN、DATA_SCHEMA、MODEL_SOURCES、VERIFY_REPORT、各階段回報 P1–P7_REPORT
.github/         GitHub Pages 自動部署
public/models/   外部 GLB（目前沒有）
scripts/         validate、reportVerify
src/core/        schema（Zod）、相依圖、拆裝規則 disassembly、學習進度 progress、i18n、資料載入（純邏輯，有測試）
src/scene/       R3F 場景、ModelResolver、animations（運轉動畫）、PerfStats（?stats=1）、procedural/ 產生器與合併網格 optimize
src/store/       Zustand
src/ui/          零件樹、資訊卡、托盤、動畫面板、學習（等級 / 導覽 / 小考 / 情境任務）、保養分頁、錯誤示範對話框、手排 vs 自排 對照、關於頁、樣式
```
