# 3D 模型來源調查（MODEL_SOURCES）

> 調查日期：2026-10-25
> 規則：只用 **CC0** 或 **CC-BY**。標示 NonCommercial（NC）、NoAI、禁止再散布、或來源可疑（疑似從遊戲拆出）的模型一律不用。

## 結論先講

```
需求                 找到了嗎？          決定
──────────────────────────────────────────────────────────────
F30 外觀車殼         有 CC-BY 候選       先用簡化幾何；候選模型待你下載並確認來源後再替換
N20 引擎（可拆）     沒有                 100% 程式化建模（本來就是主力）
ZF 8HP 外型參考      只有 NC 授權         不可用 → 程式化建模
手排箱外型參考       只有 NC 授權         不可用 → 程式化建模
通用變速箱掃描       有 CC-BY（Artec 3D） 只當「外型參考」，不放進 App（900 萬面，太重）
```

**重要限制：** 我這邊的執行環境連不上 Sketchfab 的下載 API（被網路政策擋住），所以沒辦法替你下載或實際打開模型檔看面數、檢查結構。下表的授權與面數是從各模型頁面讀到的；**下載前請你再到頁面上親自確認一次授權**。

## 候選清單

| # | 名稱 | 來源網址 | 作者 | 授權 | 面數（三角形） | 格式 | 可用？ | 說明 |
|---|---|---|---|---|---|---|---|---|
| 1 | BMW 3 Series VI F30 | https://sketchfab.com/3d-models/bmw-3-series-vi-f30-b94e907d247e4ade964f613d17293b31 | Merc_TV (@szymonpasterczyk) | CC-BY 4.0 | 約 276k | Sketchfab 下載（通常可選 glTF/GLB） | ⚠️ 有條件 | 面數適中，最適合當車殼。**疑慮**：同一作者上傳大量車款，描述寫「Engine 2.0 Petrol Imported From England」，有可能是從遊戲拆出再上傳（授權洗白）。若確認是遊戲素材，就不能用 |
| 2 | BMW 3 Series (F30) 2011-2018 | https://sketchfab.com/3d-models/bmw-3-series-f30-2011-2018-0a8cbfa6a5df46fdb836174feb712c28 | Merc_TV (@szymonpasterczyk) | CC-BY 4.0 | 約 2.3M | 同上 | ❌ 不建議 | 230 萬面，手機跑不動；同 #1 的來源疑慮 |
| 3 | BMW F30 | https://sketchfab.com/3d-models/bmw-f30-3426109189ae47c8a61f0214ee3acd33 | SuperScriptDEV2 | CC-BY 4.0 | 約 393k | fbx / blend（標籤） | ⚠️ 備案 | 標籤混有 mercedes、porsche，像是素材包，來源可疑度更高 |
| 4 | BMW F30 | https://sketchfab.com/3d-models/bmw-f30-2c3abb224dcd4d06990c45b3ffaea3e3 | Pavel_otw | 未開放下載 | – | – | ❌ | 只能線上看 |
| 5 | Stanced BMW F30 | https://sketchfab.com/3d-models/stanced-bmw-f30-3b8c8703b97f4abe9ec9ca1d11cb346f | Zuniargo | 未開放下載 | – | – | ❌ | 改裝車，比例不對 |
| 6 | ZF8HP70 | https://sketchfab.com/3d-models/zf8hp70-d0d18eb4a2d54cc5b61d899633ae269c | rjsdotorg | CC BY-**NC**-SA 4.0 | 約 212k | Scaniverse 掃描 | ❌ | 非商用授權，規則禁止。且是 8HP70（RAM），不是 F30 的 8HP45 |
| 7 | Manual Transmission / gear box | https://sketchfab.com/3d-models/manual-transmission-gear-box-811ce409dda746099924ac0b39d34140 | UnforgettableName | CC BY-**NC** 4.0 | 約 53k | – | ❌ | 非商用。可「看」它的同步器結構當學習參考，但不能放進專案 |
| 8 | Transmission（雷射掃描） | https://sketchfab.com/3d-models/transmission-034c29fff408424ea6365bd7dcc954bb | Artec 3D | CC-BY 4.0 | 約 9.1M | 掃描 | ⚠️ 只當參考 | 授權可以，但不是 BMW 的變速箱，面數太大。最多在 Blender 減面後當「變速箱長什麼樣」的示意 |
| 9 | Transmission Model (for 3D Printing) | https://sketchfab.com/3d-models/transmission-model-for-3d-printing-0ca1116adc3b49d28983c61e498157b9 | T-FLEX CAD | 待確認 | – | – | ❓ | 教學用齒輪箱，可能有分件；請你看一下授權 |
| 10 | GrabCAD「zf」標籤 | https://grabcad.com/library/tag/zf | 多位 | GrabCAD 授權（非 CC） | – | STEP 等 | ❌ | GrabCAD 預設授權不是 CC0/CC-BY，不能再散布到公開網站 |

N20 引擎：在 Sketchfab、GrabCAD、Printables、Thingiverse 都沒找到 BMW N20 的免費模型（搜「N20」幾乎都是 N20 小馬達）。

### 複審補充：怎麼判斷 #1 是不是遊戲拆出來的

到 Sketchfab 作者頁看三件事：(a) 是否同一天上傳幾十台不同品牌的車；(b) 模型內部有沒有遊戲常見的 LOD 命名（`_LOD0`、`body_lod1`）或 Forza / GTA 風格的材質名；(c) 描述有沒有寫出建模軟體與製作過程。三項都中就是拆出來的，不要用。

## 為什麼「程式化建模」是主力

```
外部模型的問題                         程式化零件的好處
────────────────────────               ────────────────────────
是一整塊網格，不能拆                   每個零件本來就是獨立物件
授權常常不乾淨                         沒有授權問題
面數高，手機卡                         面數自己控制，天生有 LOD
位置關係不一定正確                     座標直接寫在 JSON，可以對照真實尺寸
```

## 手動下載步驟（給你做）

1. 打開 #1 的網址，登入 Sketchfab，按「Download 3D Model」，選 **glTF（.glb）**。
2. 到作者的個人頁看一下描述，確認不是遊戲拆出的模型。不確定就先不要用，App 會用簡化車殼。
3. 檔案改名為 `f30_body.glb`，放到 `public/models/`。
4. 在 `data/parts/body.json` 把車殼的 `modelRef` 從 `procedural:body_shell_v1` 改成 `glb:/models/f30_body.glb`，不用改程式。
5. 把作者、授權、網址填進 `CREDITS.md`（App 的「關於」頁會自動讀取）。
