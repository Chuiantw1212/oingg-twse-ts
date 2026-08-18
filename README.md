# TWSE 資料同步微服務

從台灣證券交易所 OpenAPI 抓取盤後資料，正規化後存入 Neon Postgres。
TypeScript + ultimate-express + Prisma。

---

## ⚠️ 最重要的限制

**`openapi.twse.com.tw` 只給「今天」的資料，沒有歷史查詢。**

加上 `?date=` 參數無效（回傳內容完全相同）。所以：

- **漏抓一次，那次的資料就永久消失**，沒有任何補救方式
- 因此原始 JSON 必須先存下來（`twse_raw` 表），正規化失敗才有機會重跑
- 因此排程失敗必須告警，不能靜默忽略

Neon 資料庫連線的細節（pooled vs direct、autosuspend、常見錯誤）另外寫在 [NEON.md](NEON.md)。

---

## 資料流

```
Cloud Scheduler  →  POST /api/ingest  →  抓 TWSE  →  存 twse_raw  →  正規化  →  存 daily_price
```

也可以針對單一 dataset 個別觸發（見下面「API」），方便手動驗證某個 dataset 的資料，不用每次都整包一起跑。

沒有訊息隊列、沒有背景 worker。每日資料量小，同步處理幾秒內完成。

---

## 目前抓哪些

| TWSE 端點 | dataset | 狀態 |
|---|---|---|
| `/exchangeReport/STOCK_DAY_ALL` | `STOCK_DAY_ALL` | 完整：抓取 → 存 `twse_raw` → 正規化 → upsert `daily_price`（開高低收、成交量、成交金額、成交筆數） |
| `/exchangeReport/STOCK_DAY_AVG_ALL` | `STOCK_DAY_AVG_ALL` | 完整：抓取 → 存 `twse_raw` → 正規化 → upsert `daily_price`（收盤價、月平均價） |
| `/exchangeReport/BWIBBU_ALL` | `BWIBBU_ALL` | 完整：抓取 → 存 `twse_raw` → 正規化 → upsert `daily_valuation`（本益比、股價淨值比、殖利率） |
| `/opendata/t187ap07_X_ci` | `BALANCE_SHEET_CI` | 完整：抓取 → 存 `twse_raw` → 正規化 → upsert `quarterly_balance_sheet`（資產負債表） |

`STOCK_DAY_ALL` 跟 `STOCK_DAY_AVG_ALL` 都 upsert 同一張 `daily_price`（複合主鍵 `symbol, tradeDate`），各自只寫自己負責的欄位，不會互相覆蓋。`Change`（漲跌價差）刻意不存——能從前後兩天存好的 `close` 算出來，不屬於「抓不到就永久消失」的資料。

判斷要不要抓某個 dataset 的標準：**能不能從已有資料算出來？** 不能就抓，因為明天就沒了。

---

## 專案結構

```
oingg-twse-ts/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts               # Express app、路由、Swagger 掛載、啟動
│   ├── config.ts               # 環境變數 + X-Task-Secret 驗證（timingSafeEqual）
│   ├── db.ts                   # Prisma client、connectDb()、saveRawResponse()
│   ├── ingest.ts                # orchestrator：Promise.all 組合所有 dataset，不含任何 dataset 細節
│   ├── twse-client.ts           # 共用的 axios instance
│   ├── twse-parse.ts            # 共用純函式：rocDateToISO、parseTwseNumber、getTaipeiTodayISO
│   ├── types.ts                 # DatasetResult
│   └── datasets/
│       ├── balanceSheetCi.ts    # t187ap07_X_ci 的 fetch + ingest，全部在這個檔案
│       ├── bwibbuAll.ts         # BWIBBU_ALL 的 fetch + ingest，全部在這個檔案
│       ├── stockDayAll.ts       # STOCK_DAY_ALL 的 fetch + normalize + upsert + ingest，全部在這個檔案
│       └── stockDayAvgAll.ts    # STOCK_DAY_AVG_ALL 的 fetch + normalize + upsert + ingest，全部在這個檔案
├── NEON.md                      # Neon pooled/direct 連線細節
├── pnpm-workspace.yaml           # 必要，見「安裝」
├── package.json
└── tsconfig.json
```

**每個 dataset 一個檔案**：要追某個 dataset 的完整流程（抓 → 清理 → 存），打開 `datasets/` 底下對應的檔案就好，不用在好幾個檔案之間跳來跳去。`twse-client.ts`、`twse-parse.ts`、`db.ts` 只放真正跨 dataset 共用、不屬於任何單一 dataset 的東西（HTTP client 設定、日期/數字清理函式、raw 落地）。

**還沒建，也先不要建**：通用的 `Dataset` 介面或 `datasets/index.ts` 註冊陣列。雖然現在有三個 dataset 了，但 `BWIBBU_ALL` 還沒做完（沒有 normalize/upsert），共通的形狀還沒被三個「完整」實作驗證過，這時候硬套介面只會讓程式碼為了遷就錯的介面而寫歪。等 `BWIBBU_ALL` 也做完、三個都是完整流程時再抽一次——`stockDayAll.ts` 跟 `stockDayAvgAll.ts` 兩個已經長得很像，是很好的先驗信號，但還不夠。

---

## 給 AI agent 的規則

把以下內容放進專案根目錄的 `GEMINI.md`，Gemini CLI 會自動載入：

```markdown
# 專案規則

## 資料處理（違反會導致靜默的錯誤資料）
- 日期是民國年字串："1150731" → 2026-07-31（前三位 + 1911）
- 所有 JSON 欄位都是字串，包含數字。必須明確轉型
- "1,234,567" 要去掉逗號；"--" 和 "" 要轉成 null
- 價格一律用 Prisma Decimal / Postgres NUMERIC，禁止 Float
- 交易日判定必須用 Asia/Taipei 計算，禁止用 new Date() 直接取當地時間

## 資料庫
- 所有寫入用 upsert，必須可重複執行不出錯
- 原始回應先存 twse_raw，再正規化
- schema 變更用 prisma migrate，禁止 db push
- 禁止在容器啟動時執行 migration

## 其他
- 每個 dataset 一個檔案，放在 src/datasets/ 底下，fetch + normalize + upsert + ingest 都放同一個檔案
- 不要建立通用的 Dataset 介面或 datasets/index.ts 註冊陣列，除非已經有 3 個以上 dataset
- 每個資料清理函式都要有對應的單元測試
```

---

## 安裝

```bash
pnpm install
```

### `pnpm-workspace.yaml` 是必要檔案

`ultimate-express` 依賴的 `uWebSockets.js` 走 GitHub 安裝，pnpm 預設會擋：

```
[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "uWebSockets.js" ...
```

根目錄的 `pnpm-workspace.yaml` 解除限制：

```yaml
blockExoticSubdeps: false

allowBuilds:
  '@prisma/client': true
  '@prisma/engines': true
  '@scarf/scarf': false
  esbuild: true
  prisma: true
```

`allowBuilds` 是 pnpm 對有 postinstall/preinstall script 的套件的白名單，Prisma 的 client/engine 一定要允許才能正確產生查詢引擎。

**必須提交到 Git，也必須 COPY 進 Docker。** 雲端不會 install，但 Docker build 會。

（放 `.npmrc` 無效，pnpm 11 起該檔只讀 auth 設定。）

### Node 版本要固定 22

`uWebSockets.js` 是 native module，綁 Node ABI，build 和 runtime 版本不同會壞。

```json
"engines": { "node": ">=22 <23" }
```

`prisma`/`@prisma/client` 目前釘在 `^5.17.0`——Prisma 7 的 CLI 拿掉了 schema 裡直接寫 `datasource url`/`directUrl` 的支援（改用 `prisma.config.ts` + driver adapter），跟這個專案現在的 schema 寫法不相容，所以先不要升級 major version。

---

## 環境變數

```dotenv
# runtime 用（host 帶 -pooler）
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require&channel_binding=require&pgbouncer=true"

# migration 用（不帶 -pooler）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require&channel_binding=require"

TASK_SECRET="本機開發用的密鑰"
PORT=3000
```

`.env` 已經在 `.gitignore` 裡，不會被追蹤。兩條連線字串為什麼要分開、`pgbouncer=true` 是做什麼用的、Neon 的 autosuspend 冷啟動——都寫在 [NEON.md](NEON.md)。

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## 資料庫

```bash
pnpm prisma generate                      # 改完 schema 就要跑
pnpm prisma migrate dev --name init       # 本機
pnpm prisma migrate deploy                # 部署時
```

**不要用 `prisma db push`**——不產生 migration 檔，無法追蹤也無法回溯。

**不要在容器啟動時跑 migration**——多 instance 會互相競爭。

### schema

```prisma
// 原始回應，出錯時的救命繩
model TwseRaw {
  id        BigInt   @id @default(autoincrement())
  dataset   String
  tradeDate DateTime @db.Date
  fetchedAt DateTime @default(now())
  payload   Json

  @@unique([dataset, tradeDate])
  @@map("twse_raw")
}

// STOCK_DAY_ALL + STOCK_DAY_AVG_ALL
// Change（漲跌價差）刻意不存：能從前後兩天的 close 算出來，不屬於「抓不到就永久消失」的資料。
model DailyPrice {
  symbol      String
  tradeDate   DateTime @db.Date
  open        Decimal? @db.Decimal(10, 4)
  high        Decimal? @db.Decimal(10, 4)
  low         Decimal? @db.Decimal(10, 4)
  close       Decimal? @db.Decimal(10, 4)
  volume      BigInt?
  turnover    BigInt?
  transaction BigInt?
  monthlyAvg  Decimal? @db.Decimal(10, 4)

  @@id([symbol, tradeDate])
  @@map("daily_price")
}

// BWIBBU_ALL（缺值模式不同，所以分開存；目前還沒有程式碼實際寫入這張表）
model DailyValuation {
  symbol        String
  tradeDate     DateTime @db.Date
  peRatio       Decimal? @db.Decimal(10, 2)
  pbRatio       Decimal? @db.Decimal(10, 2)
  dividendYield Decimal? @db.Decimal(10, 2)

  @@id([symbol, tradeDate])
  @@map("daily_valuation")
}
```

`(symbol, tradeDate)` 複合主鍵讓 upsert 天生幂等，重複觸發、補抓都安全。

估值分開存是因為缺值意義不同：虧損公司沒有本益比、沒發股利的殖利率是 `0`，這跟「沒抓到」不是一回事。混在一張表就分不出來了。

---

## 執行

```bash
pnpm run dev        # tsx watch src/index.ts
pnpm run build       # tsc → dist/
pnpm run start       # node dist/index.js
pnpm test            # 目前還沒接測試框架，先是個 placeholder
```

---

## API

Swagger UI：`GET /api-docs`（spec 直接從 `src/index.ts` 的 `@swagger` JSDoc 註解產生）。

### `GET /healthz`

回 200，不驗證。**不要連 DB**，否則 Neon 冷啟動會讓健康檢查失敗。

### `POST /api/ingest`

同時觸發所有 dataset，各自獨立記錄結果，**某一個失敗不會讓其他的回滾**：

```jsonc
{ "date": "2026-08-15" }   // 省略 = 今天（Asia/Taipei）
```

```jsonc
{
  "tradeDate": "2026-08-15",
  "results": [
    { "dataset": "STOCK_DAY_ALL",     "rows": 1373, "ok": true },
    { "dataset": "STOCK_DAY_AVG_ALL", "rows": 1373, "ok": true },
    { "dataset": "BWIBBU_ALL",        "rows": 1201, "ok": true }
  ]
}
```

### `POST /api/ingest/stock-day-all`

只觸發 `STOCK_DAY_ALL`，方便單獨驗證這個 dataset 的資料：

```jsonc
{ "date": "2026-08-15" }   // 選填，省略 = 今天
```

回傳單一 dataset 的結果，例如 `{ "dataset": "STOCK_DAY_ALL", "rows": 1373, "ok": true }`。

### `POST /api/ingest/stock-day-avg-all`

只觸發 `STOCK_DAY_AVG_ALL`，方便單獨驗證這個 dataset 的資料，不用整包一起等：

```jsonc
{ "date": "2026-08-15" }   // 選填，省略 = 今天
```

回傳單一 dataset 的結果，例如 `{ "dataset": "STOCK_DAY_AVG_ALL", "rows": 1373, "ok": true }`。

### `POST /api/ingest/bwibbu-all`

只觸發 `BWIBBU_ALL` 的抓取。目前只回抓到的筆數，還沒有實際存進資料庫（見「待辦」）。

### 本機測試

```bash
curl -X POST http://localhost:3000/api/ingest/stock-day-avg-all \
  -H "X-Task-Secret: 你的密鑰" \
  -H "Content-Type: application/json"
```

---

## 端點驗證

沒驗證的話任何人都能無限觸發，結果是你的 IP 被證交所封鎖、Neon 寫入配額耗盡。

**本機**：比對 `X-Task-Secret` 標頭。用 `crypto.timingSafeEqual`，不要用 `===`——而且呼叫前一定要先檢查長度和是否存在，`timingSafeEqual` 對長度不同或 `undefined` 的輸入會直接 throw，沒接住的話一個沒帶標頭的請求就能把整個 process 打掛（`src/config.ts` 的 `compareTaskSecret` 已經處理了這兩種情況）。

**GCP（尚未設定，見「待辦」）**：預計用 Cloud Run 內建的 IAM 驗證，程式不用自己驗 token。

---

## 資料清理規則

| 原始值 | 處理 |
|---|---|
| `"1150731"` | 民國年 → `2026-07-31`（前三位 + 1911） |
| `"1,234,567"` | 去掉逗號再轉數字 |
| `"--"` / `""` | `null` |
| `"+"` / `"-"` / `"X"` | 特殊註記，不是數值 |

實作在 `src/twse-parse.ts`（`rocDateToISO`、`parseTwseNumber`、`parseTwseBigInt`），`datasets/stockDayAll.ts` 跟 `datasets/stockDayAvgAll.ts` 都在用。`parseTwseBigInt` 是 `parseTwseNumber` 的變體：規則一樣，但轉成 `bigint`，因為 Prisma 的 `BigInt` 欄位（`volume`/`turnover`/`transaction`）吃 `bigint | number`，不吃字串，不能直接沿用 `parseTwseNumber` 的回傳值。`BWIBBU_ALL` 還沒接上這些清理函式。

**這是最需要測試的地方**——出錯不會拋異常，只會靜默寫入錯誤資料，你要等到看盤畫面出現離譜數字才會發現。

估值資料額外注意：虧損公司沒有本益比、沒發股利的殖利率是 `0.00`（跟 null 不同）、ETF 可能整組欄位是空的。

---

## 待辦

- [x] `BWIBBU_ALL` 完整實作：存 `twse_raw`、正規化、upsert `daily_valuation`
- [ ] 資料清理函式（`twse-parse.ts`）的單元測試
- [ ] Dockerfile、Cloud Run 部署設定
- [ ] `.env.example`
- [ ] Cloud Run IAM 驗證（取代/搭配本機的 `X-Task-Secret`）
- [ ] 交易日曆（國定假日、颱風假）
- [ ] 補漏機制（排程失敗、TWSE 延遲發布時自動回補）
- [ ] 排程失敗告警
- [ ] 除權息資料（不然報酬率和均線都是錯的）
- [ ] 歷史資料回填（`www.twse.com.tw` 舊版 API，只能本機跑，見上面「端點驗證」同樣的 IP 風險考量）

---

MIT Licence
