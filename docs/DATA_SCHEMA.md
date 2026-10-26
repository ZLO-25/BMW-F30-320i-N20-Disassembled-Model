# 資料格式定稿（DATA_SCHEMA）

> 以 PROMPT.md 第 5 節為基礎，**只新增欄位，沒有刪欄位**。新增的欄位標 🆕。

## 資料之間的關係

```
sources.json ◄──────────── 每個數值的 source 指向這裡（或直接寫網址）
     ▲
parts/*.json  ──parent──►  另一個零件（組成樹）
     │        ──requires─► 必須先拆掉的零件（組成相依圖，不可有循環）
     ▼
procedures/*.json   導覽步驟，引用零件 id
quizzes/*.json      測驗題，引用零件 id
scenarios/*.json    故障情境，引用 procedure
maintenance/*.json  保養項目，引用 procedure（一鍵跳到 3D 導覽）
```

## 共用型別

```jsonc
// 雙語文字
{ "zh": "正時鏈", "en": "Timing Chain" }

// 有來源的數值 🆕（把 PROMPT 裡 fastener 的 source/confidence 寫法推廣到所有數值）
{ "value": null, "unit": "Nm", "source": null, "confidence": "unverified", "note": null }
```

`confidence`：`verified`（原廠）/ `community`（可信網站、DIY 教學）/ `unverified`（查不到，`value` 必須是 `null`）。

## 驗證規則（`npm run validate` 會檢查）

```
數值類
  ├ confidence ≠ unverified  →  source 不可為 null
  └ confidence = unverified  →  value 必須為 null（不准偷填）
零件樹
  ├ parent 必須存在（level 0 的整車除外）
  ├ 子件 level 不可小於父件 level（P2 新增）
  ├ parent 關係不可成環
  └ 子件的 transmissionVariant 必須包含在父件的範圍內
相依圖
  ├ requires 裡的 id 必須存在
  ├ requires 不可指向自己的祖先（P2 新增，否則永遠拆不下來）
  ├ requires 不可指向 removable=false 的結構件（P2 新增）
  ├ requires 不可成環（A 要先拆 B，B 又要先拆 A）
  ├ 依變體各檢查一次：手排模式下，手排零件 requires 的每個零件都必須在手排模式存在
  │  （否則那個零件永遠拆不下來）；自排同理
  └ requiresVariant.manual 只能指向 manual 零件、.auto 只能指向 auto 零件（P3 新增）
引用
  ├ procedures / quizzes / scenarios / maintenance 引用的零件 id、工具 id、procedure id 都必須存在
  └ removal.tools 裡若是 tool.* 開頭的字串，必須存在於 tools.json
```

## 工具（tools.json）🆕

```jsonc
[
  { "id": "tool.torx_t30", "name": { "zh": "T30 星型起子", "en": "T30 Torx" }, "category": "hand" },
  { "id": "tool.n20_timing_lock", "name": { "zh": "N20 正時鎖定工具組", "en": "N20 Camshaft Timing Lock Kit" },
    "category": "special", "oemRef": null, "source": null, "confidence": "unverified" }
]
```
`removal.tools` 可以填工具 id（會雙語顯示、可被錯誤示範引用），也可以填一般字串（直接顯示）。

## 零件（parts/*.json）

```jsonc
{
  "id": "eng.timing.chain",
  "system": "engine",                  // engine / transmission / driveline / exhaust / chassis / brakes / steering / electrical / body
  "subsystem": "timing",               // 🆕 用來在零件樹分組
  "level": 2,                          // 0=整車 1=總成 2=次總成 3=零件（P2 起）。這是「語意層級」，
                                       //    不等於樹的深度：子件可以和父件同級，但不能比父件更上層
  "name": { "zh": "正時鏈", "en": "Timing Chain" },
  "modelRef": "procedural:chain_v1",   // 或 "glb:/models/xxx.glb#node"
  "position": { "x": 0, "y": 0, "z": 0 },        // 相對父件，單位公尺
  "rotation": { "x": 0, "y": 0, "z": 0 },        // 🆕 角度（度）
  "explodeDir": { "x": 0, "y": 0, "z": -1 },     // 🆕 爆炸圖時往哪個方向移
  "removePath": [{ "x": 0, "y": 0.3, "z": 0 }],  // 🆕 拆下時的移動路徑（避免穿模），可省略
  "parent": "eng.cylinder_head",
  "explain": {
    "universal": { "zh": "...", "en": "..." },
    "specific":  { "zh": "...", "en": "..." }
  },
  "removal": {
    "requires": ["eng.valve_cover", "trans.assembly"],
    "requiresVariant": {               // 🆕 P3：依變速箱變體多出來的 requires（載入時合併進 requires）
      "manual": ["trans.manual.dmf"],  //    手排模式才加的；只能指向 transmissionVariant = manual 的零件
      "auto":   ["trans.auto.flexplate"]
    },
    "tools": ["tool.torx_t30", "tool.n20_timing_lock"],   // 工具 id 或一般字串
    "fasteners": [
      { "desc": "張緊器", "qty": 1, "torque_nm": null, "oneTimeUse": false,
        "spec": null,                                       // 🆕 螺紋規格，例 "M8x1.25"，可 null
        "source": null, "confidence": "unverified" }
    ],
    "warnings": [{ "zh": "...", "en": "..." }],
    "mistakes": [                      // 🆕 錯誤示範用：做錯會怎樣
      { "trigger": "remove_without_tool:tool.n20_timing_lock",   // 或 "remove_before:<part id>"
        "severity": "critical",                                   // info / warning / critical
        "consequence": { "zh": "正時跑掉，氣門可能撞活塞", "en": "..." } }
    ]
  },
  "removable": true,                   // 🆕 P2：false = 結構件（整車、車身），不能拆
  "detachesWithParent": true,          // 🆕 預設 true：拆父件時跟著走（見 PLAN「拆裝三規則」）；
                                       //    設 false 表示父件拆下前必須先單獨拆掉它（等同父件 requires 它）
  "specs": [                           // 🆕 容量、尺寸等其他數值
    { "key": "length_links", "label": { "zh": "鏈節數", "en": "Links" },
      "value": null, "unit": null, "source": null, "confidence": "unverified" }
  ],
  "partNumbers": [{ "number": null, "source": null, "confidence": "unverified" }],
  "commonIssues": [{ "zh": "...", "en": "..." }],
  "transmissionVariant": "both",       // both / manual / auto
  "animations": [],                    // 保留；P3 實作時動畫改寫在 src/scene/animations.ts（用零件 id 找模型），資料不用填
  "tags": []                           // 🆕 搜尋用關鍵字
}
```

## 導覽步驟（procedures/*.json）（P5 定稿）

一個導覽 = 一件維修工作，一步一步做。`remove` / `install` 的步驟會真的去動 3D（照拆裝規則走），`check` / `note` 只是提醒你做一件事，按「完成」就過。

```jsonc
{
  "id": "proc.spark_plugs",                 // 一定 proc. 開頭
  "title": { "zh": "更換火星塞", "en": "Replace Spark Plugs" },
  "difficulty": 1,                          // 1（最簡單）–5
  "level": 4,                               // 屬於學習路徑哪一級
  "transmissionVariant": "both",            // both | manual | auto（換離合器就只在手排）
  "intro": { "zh": "...", "en": "..." },
  "minutes": 40,                            // 示意工時，可 null；不是原廠工時
  "steps": [
    { "action": "note",    "part": null, "title": {...}, "tools": ["tool.socket_set"], "note": {...} },
    { "action": "remove",  "part": "eng.head.engine_cover", "title": {...}, "tools": ["tool.trim_pry"] },
    { "action": "install", "part": "eng.ignition.spark_plug_set", "title": {...},
      "tools": ["tool.spark_plug_socket", "tool.torque_wrench"],
      "torque": { "value": null, "unit": "Nm", "source": null, "confidence": "unverified" },   // null = 待查證，介面會寫「請查原廠手冊」
      "note": {...}, "warning": {...} }
  ]
}
```

validate 會檢查：`remove` / `install` 一定要有 `part`；`part` 與 `tool.*` 都要存在；`confidence: unverified` 的扭力 `value` 必須是 null。

## 測驗題（quizzes/*.json）（P5 定稿）

```jsonc
{ "id": "quiz.l1_identify_radiator", "level": 1,
  "type": "identify",                       // identify：3D 亮零件問是什麼；choice：原理選擇題；order：排步驟
  "prompt": {...}, "part": "eng.cooling.radiator",   // identify 一定要有 part
  "options": [ {zh,en}, ... ],
  "answer": 0,                              // identify / choice：正確選項索引；order：正確順序（索引陣列，必須是 options 的排列）
  "explain": {...} }
```

## 學習路徑（levels.json）（P5 定稿）

剛好 5 級。`goals` 是這一級要做的事清單，介面會給「去做」按鈕：

| kind | ref | 按下去 |
|---|---|---|
| look | `body` 或零件 id | 車殼切透視；是零件就選取並對準鏡頭 |
| isolate | 子系統 id（如 `wheels`、`boost`） | 檢視工具「只看這個」 |
| animation | 動畫 id | 切到動畫分頁播放 |
| procedure | 導覽 id | 開始導覽 |
| scenario / text | — | 只顯示文字（情境任務 P6 才接） |

`passPct`（預設 80）：這一級測驗達到此分數才解鎖下一級。validate 會檢查每級都有題目、導覽與零件 ref 存在。

## 錯誤示範（parts 裡的 `removal.mistakes`）

```jsonc
"mistakes": [
  { "trigger": "remove_without_tool:tool.n20_timing_lock", "severity": "critical",
    "consequence": { "zh": "凸輪軸一鬆正時就跑掉，氣門會撞活塞。", "en": "..." } },
  { "trigger": "remove_before:elec.battery", "severity": "critical", "consequence": {...} }
]
```

- `remove_without_tool:<tool>`：手上沒拿這個工具就拆（工具在資訊卡「工具」區勾選；導覽會自動幫你拿）。
- `remove_before:<part>`：該先處理的零件還在車上。
- 規則上拆得下來才會判斷錯誤（被 requires 擋住的優先顯示「必須先拆」）。觸發時跳對話框：「照正確方式做」或「故意做錯，看後果」；後者會記進進度。

## 學習進度（不是資料檔，存瀏覽器 localStorage `n20.progress.v1`）

```jsonc
{ "levelBest": { "1": 100 }, "completedProcedures": ["proc.spark_plugs"],
  "mistakes": [{ "partId": "str.column", "trigger": "remove_before:elec.battery", "severity": "critical", "at": 1793011241106 }],
  "unlockAll": false }   // true = 關掉解鎖條件
```

讀寫都包 try/catch（無痕模式、空間滿了不會讓程式掛掉）。邏輯在 `src/core/progress.ts`，有測試。

## 保養（maintenance/*.json）（P6 定稿）

每一項 = 保養分頁的一張卡片。**原廠建議與台灣保守建議分開，各自有來源與可信度。**

```jsonc
{
  "id": "mnt.oil",
  "title": { "zh": "機油與機油濾芯", "en": "Engine Oil & Filter" },
  "group": null,                          // 同組排在一起（例：gearbox_oil = 自排 ATF + 手排齒輪油）
  "transmissionVariant": "both",          // 只有 ATF（auto）與手排齒輪油（manual）分開
  "purpose":   { "zh": "...", "en": "..." },   // 通用層：為什麼要做
  "f30Method": { "zh": "...", "en": "..." },   // 專屬層：F30 / N20 怎麼做
  "interval": {
    "oem": { "km": 16000, "months": 12, "text": {...}, "source": "bmw_cbs_us_2020", "confidence": "community" },
    "taiwanConservative": { "km": 8000, "months": 6, "text": {...}, "source": "bumper_severe", "confidence": "community" }
  },
  "tools": ["tool.oil_filter_socket"],
  "consumables": [ { "name": {...}, "spec": null, "qty": "約 4.5 L", "source": "fcp_n20_oil", "confidence": "community" } ],
  "focusPart": "eng.lube.oil_filter",     // 「在 3D 看位置」對準的零件
  "procedure": "proc.oil_change",         // 「用導覽帶我做」開的導覽（可 null）
  "warnings": [ {...} ]
}
```

規則（schema + validate 都會擋）：

- `confidence: unverified` 時 `km` 與 `months` 必須是 null；`text` 寫「要看什麼」。有數字就一定有來源。
- 「原廠沒有這一項」也是一種有來源的事實：`km`/`months` 為 null、`confidence: community`、`source` 指向那張參考表。
- 耗材 `spec` / `qty` 沒來源就留 null（介面顯示「待查證」）。
- 每一種變速箱都要看得到 14 項（手排看到齒輪油、自排看到 ATF）。

### 為什麼原廠週期標 community 而不是 verified

來源是 BMW 北美的 CBS 參考表（英里、2020 版），不是台灣 F30 的原廠手冊；CBS 還會依實際使用調整。所以數字有來源，但不保證就是你那台車的設定。

## 故障情境（scenarios/*.json）（P6 定稿）

```jsonc
{
  "id": "scn.misfire", "title": {...}, "level": 5, "difficulty": 1, "transmissionVariant": "both",
  "symptom": { "zh": "車主說：……", "en": "..." },
  "questions": [ { "prompt": {...}, "options": [ {...} ], "answer": 0, "explain": {...} } ],   // 問診（可以重答）
  "cause":       { "prompt": {...}, "options": [ {...} ], "answer": 0, "explain": {...} },     // 判斷
  "replace": ["eng.ignition.coil_set"],     // 要拆下換新的零件（全部拆下才進「換」）
  "replaceNote": {...}, "reassembleNote": {...},
  "sources": ["bmwtuning_n20"]
}
```

流程：問診 → 判斷 → 拆（有「下一個拆誰」提示，用 `nextRemovalStep`）→ 按「裝上新零件」→ 托盤清空 = 完成。成績 = 問診與判斷「第一次就答對」的比例；錯誤示範次數另外列出，不扣分。測試會證明每個情境在它的變速箱世界裡都拆得到、裝得回。

## 來源（sources.json）

`[{ id, title, url, type: "oem" | "parts_catalog" | "repair_site" | "diy" | "wiki" | "forum" | "manufacturer" | "media", accessed, note? }]`。P6 新增 `manufacturer`（例：輪胎廠）與 `media`（例：汽車媒體）。

## 拆裝規則怎麼用到這些欄位（P2 新增，程式在 `src/core/disassembly.ts`）

```
parent              → 規則 1：拆父件時，還裝著的子件一起走（一起走的整包 = 托盤上的一個「單元」）
detachesWithParent  → false 的子件不跟著走，要先單獨拆（例：水箱的電子風扇）
requires            → 規則 2：root 自己的 requires 一律要先拆（就算是自己的子件，例：缸頭要先拆 VANOS）
                      單元裡其他成員 requires「單元外面」的零件，也要先拆（例：節氣門接著增壓管，所以拆歧管要先拆增壓管）
                    → 規則 3：想裝回 A，但某個托盤單元當初是因為 A 擋住才排在 A 後面拆 → 先裝那個
removable           → false 的零件點了只會提示「結構件不能拆」
transmissionVariant → 載入時用 buildGraph(parts, variant) 先過濾：手排模式看不到自排零件，反之亦然（P3）
requiresVariant     → 過濾後把對應變體的清單併進 requires，所以規則 2 不用知道變體這回事（P3）
```

`npm test` 裡有測試會用真實資料、**手排與自排各跑一次**「從全部裝好拆到曲軸，再全部裝回」，資料改壞了測試會失敗。

## 零件檔案怎麼分（P4）

```
data/parts/
  car.json           整車、車殼、引擎蓋、前後保桿、行李廂蓋、底護板（system = car / body）
  engine.json        引擎（57）
  transmission.json  手排 + 自排（26）
  driveline.json     傳動軸、撓性盤、中心軸承、差速器、半軸
  exhaust.json       前段觸媒、中段、後消音器
  chassis.json       輪胎、前後懸吊、副車架、引擎腳、防傾桿、變速箱橫樑
  brakes.json        卡鉗、來令片、碟盤、總泵、ABS
  steering.json      轉向機、外拉桿、轉向柱
  electrical.json    電瓶、IBS、DME、感知器（含氧、凸輪、爆震、水溫、油壓）
```

檔案只是方便維護；載入時全部合併，零件樹順序由 `system` 決定。左右對稱零件 id 以 `_l` / `_r` 結尾，左側 `rotation.y = 180`。

## 動畫怎麼接到模型（P3，程式在 `src/scene/animations.ts`）

動畫不寫在 JSON，而是用「零件 id + 模型裡的子物件名稱」去找要動的東西：

```
AnimDef { id, variant, title, desc, control: 'slider' | 'gear', phases, parts: [零件 id…], apply(ctx) }
                                                                        │
PartRegistry（每個 Canvas 一份：零件 id → Object3D）◄───────────────────┘
        │
        └ 產生器裡的命名慣例：spin（會轉的整包）、fingers / ring / bearing（離合器）、
          sleeve / ring_l / ring_r / gear_l / gear_r（同步器）、gear_<n>（檔位齒輪）、
          pack_<A-E> / piston_<A-E>（離合器包）、set_<1-4> 下的 sun / carrier / ring（行星組）、
          pump / turbine / stator / lockup（扭力變換器）；userData.shell = true 的外殼在動畫時自動半透明
```

換成 GLB 時只要節點名稱照這個慣例取，動畫就能直接套用。
