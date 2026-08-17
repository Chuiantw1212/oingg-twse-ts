# TWSE 資料同步微服務

從台灣證券交易所 OpenAPI 抓取盤後資料，正規化後存入 Neon Postgres，並提供讀取 API。
TypeScript + ultimate-express + Prisma，部署在 Cloud Run。

---

## ⚠️ 最重要的限制：只有「今天」

**`openapi.twse.com.tw` 只提供最新一期的資料，沒有歷史查詢。**

加上 `?date=` 參數無效（回傳內容完全相同）。所以：

- **漏抓一次，那一期的資料就永久消失**，沒有補救方式
- 因此原始 JSON 必須先落地（`twse_raw`），正規化失敗才有機會重跑
- 因此排程失敗必須告警，不能靜默忽略

歷史資料要另外從 `www.twse.com.tw` 抓（見「歷史回填」）。

---

## 架構

30 秒版本，可以直接對別人講：

> 每個功能模組有四層，資料由外往內流。
> **Routes** 是網址對照表，沒有邏輯。
> **Controller** 負責 HTTP：驗證輸入、決定狀態碼。唯一碰 `req`/`res` 的地方。
> **Service** 是業務邏輯，不知道 HTTP 存在，所以排程和 script 也能重用。
> **Repository** 是唯一碰資料庫的地方。
> 用 ESLint 強制這個方向，違反會編譯失敗。

名稱是 **modular monolith with layered modules**（按功能垂直切模組，模組內分四層）。

### 這不是什麼（避免過度工程）

**不是 Hexagonal** — service 直接 import repository，沒有 port 介面。刻意省略：不會替換資料庫，介面抽象不會回本。

**不是 DDD** — 本專案沒有領域不變量，核心工作是資料轉換（ETL）。**不要建立 entity 物件、aggregate、domain event。**

唯一的 DDD 元素是 **anti-corruption layer**：`twse/` 把民國年、字串數字、`"--"` 這些外部髒資料擋在邊界，往內一律是乾淨型別。

### 該放哪一層？問這四個問題

| 問題 | 答案 |
|---|---|
| 需要知道 HTTP 嗎？ | controller |
| 需要知道 SQL 嗎？ | repository |
| 兩者都不需要？ | service |
| 是外部資料格式的問題？ | `twse/normalize.ts` |

例：`limit` 不能超過 200 → controller。「查詢區間不能跨超過一年」→ service（CLI 呼叫時也要生效）。`ORDER BY volume DESC` → repository。民國年轉西元 → `twse/`。

---

## 專案結構

```
oingg-twse-ts/
├── prisma/
│   ├── schema.prisma
│   └── migrations/                        # 提交到 Git
│
├── src/
│   ├── index.ts                           # app 組裝 + 註冊模組 + listen
│   ├── config.ts                          # 環境變數，缺就啟動失敗
│   │
│   ├── modules/
│   │   ├── index.ts                       # 模組註冊表，加模組只改這裡
│   │   │
│   │   ├── ingest/                        # ── 寫入side（1 支端點）──
│   │   │   ├── ingest.routes.ts
│   │   │   ├── ingest.controller.ts
│   │   │   ├── ingest.service.ts          # 依 cadence 篩選 dataset 並執行
│   │   │   └── datasets/                  # 150 份設定檔，照 TWSE 分類切
│   │   │       ├── index.ts               # export const ALL = [...]
│   │   │       ├── trading/               # 證券交易 ~50
│   │   │       │   ├── stockDayAll.ts
│   │   │       │   ├── bwibbu.ts
│   │   │       │   ├── stockDayAvg.ts
│   │   │       │   └── twt49u.ts          # 除權息
│   │   │       ├── financials/            # 財務報表 ~50
│   │   │       │   ├── monthlyRevenue.ts
│   │   │       │   └── incomeStatement.ts
│   │   │       └── governance/            # 公司治理 ~50
│   │   │           ├── companyProfile.ts
│   │   │           └── directorHolding.ts
│   │   │
│   │   ├── stocks/                        # ── 讀取side ──
│   │   │   │                              # 個股：詳情、歷史、多檔比較
│   │   │   ├── stocks.routes.ts
│   │   │   ├── stocks.controller.ts
│   │   │   ├── stocks.service.ts
│   │   │   ├── stocks.repository.ts
│   │   │   └── stocks.schema.ts
│   │   │
│   │   ├── screener/                      # 篩選與排行
│   │   │   │                              # 取代「每個排行一支端點」的做法
│   │   │   ├── screener.routes.ts
│   │   │   ├── screener.controller.ts
│   │   │   ├── screener.service.ts
│   │   │   ├── screener.repository.ts
│   │   │   └── screener.schema.ts
│   │   │
│   │   ├── financials/                    # 財報：損益、資產、月營收趨勢
│   │   │   └── (同樣五件套)
│   │   │
│   │   ├── governance/                    # 治理：公司基本資料、董監持股
│   │   │   └── (同樣五件套)
│   │   │
│   │   ├── market/                        # 大盤：指數、成交統計、三大法人
│   │   │   └── (同樣五件套)
│   │   │
│   │   └── overview/                      # 跨分類彙整（個股總覽頁）
│   │       ├── overview.routes.ts
│   │       ├── overview.controller.ts
│   │       └── overview.service.ts        # 只呼叫其他模組的 service
│   │                                      # 沒有自己的 repository
│   │
│   ├── twse/                              # 外部資料源 adapter，跨模組共用
│   │   ├── client.ts                      # fetch openapi.twse.com.tw
│   │   ├── normalize.ts                   # 轉換引擎（全專案唯一）
│   │   └── define-dataset.ts              # defineDataset 型別與驗證
│   │
│   └── shared/
│       ├── db.ts                          # Prisma client
│       ├── period.ts                      # 交易日 / 季度 / 快照日計算
│       ├── pagination.ts                  # cursor 分頁
│       ├── response.ts                    # 統一回應格式
│       ├── cache.ts                       # Cache-Control header
│       └── errors.ts
│
├── tests/
│   ├── normalize.test.ts                  # 最重要
│   └── period.test.ts
├── backfill.ts                            # 只在本機跑，不進 image
├── pnpm-workspace.yaml                    # ⚠️ 必要，見「安裝」
├── eslint.config.js
├── Dockerfile
└── package.json
```

### 讀取模組為什麼不照 TWSE 三分類切

TWSE 的分類是「資料從哪來」，你的 API 該按「使用者要看什麼」切。個股總覽頁一次要價格、本益比、財報、董監持股——**一個畫面跨三個分類**。照 TWSE 分類切模組，這種需求會不知道放哪，最後生出 `misc/`。

所以只有 `ingest/datasets/` 照 TWSE 分類切（那裡確實對應資料來源），讀取端按查詢模式切。

| 模組 | 端點形狀 | 讀哪些表 |
|---|---|---|
| `stocks/` | 單檔或少數幾檔，指定 symbol | daily_price |
| `screener/` | 全市場篩選 + 排序 + 分頁 | daily_price（+ join 財報） |
| `financials/` | 單檔的期間序列 | financial_statement |
| `governance/` | 單檔的現況或快照歷史 | governance_snapshot |
| `market/` | 沒有 symbol 維度 | index / institutional |
| `overview/` | 彙整，無自己的 repository | 呼叫其他 service |

`stocks/` 和 `screener/` 都讀 `daily_price` 但分開，是因為查詢形狀完全不同：一個是 `WHERE symbol = ?` 走主鍵，一個是 `WHERE trade_date = ? ORDER BY ... LIMIT` 走複合索引。SQL、分頁、快取策略都不一樣，混在一個 repository 會變成 400 行的雜物櫃。

### 50 支端點靠 query 參數收斂，不是 50 個檔案

```
✗ /top-volume  /top-gainers  /low-pe  /high-yield     四個端點、四份幾乎相同的 code
✓ /v1/screener?sort=volume&order=desc&limit=50
  /v1/screener?pe_max=15&sort=pe
  /v1/screener?yield_min=5
```

**「回傳形狀不同」才開新端點，「篩選條件不同」用參數。** 三個分類 × 50 支端點的規模下，這件事的槓桿比任何資料夾結構都大——真正需要獨立實作的大概是 15~20 支。

### overview/ 是唯一沒有 repository 的模組

它只編排其他模組的 service：

```ts
// overview.service.ts
export async function getStockOverview(symbol: string) {
  const [price, financials, governance] = await Promise.all([
    stocksService.getLatest(symbol),
    financialsService.getLatestQuarter(symbol),
    governanceService.getCurrent(symbol),
  ])
  return { price, financials, governance }
}
```

**跨模組只能經 service，不可直接碰別人的 repository。** 這條由 ESLint 強制。

`twse/` 不放進 `modules/`：它是被 service 呼叫的 adapter，不對應任何 API 功能，而且 ingest 和 backfill 都要用。

`backfill.ts` 在根目錄且被 `.dockerignore` 排除。**不可與 `index.ts` 合併**——它會在 20 分鐘內對證交所發幾百次請求，這段 code 不該存在於 production image，避免被誤觸發導致 IP 被封。

---

## 三個 OpenAPI 分類的差異

**分類是給人看的組織方式，更新頻率才是排程依據。** 兩者不是同一個軸。

| 分類 | 頻率 | 主鍵形狀 | 歷史語意 |
|---|---|---|---|
| 證券交易 | 每交易日 | `(symbol, tradeDate)` | 時間序列 |
| 財務報表 | 每季 + 月營收每月 | `(symbol, year, quarter)` | 期間，會被更正重發 |
| 公司治理 | 不定期，事件驅動 | `(symbol, snapshotDate)` | 現況快照 |

「月營收」屬於財務報表但頻率是每月，所以不能用分類當排程單位。

---

## defineDataset：宣告式欄位對應

三個分類各約 50 個 endpoint，共 150 個。**不可能手寫 150 個 normalizer**（12,000 行、風格不一致、測試量爆炸）。

每個 dataset 是一份設定，共用一個轉換引擎：

```ts
// modules/ingest/datasets/trading/stockDayAll.ts
export const stockDayAll = defineDataset({
  name: 'STOCK_DAY_ALL',
  category: 'trading',
  cadence: 'daily',
  endpoint: 'exchangeReport/STOCK_DAY_ALL',
  table: 'daily_price',
  key: ['symbol', 'tradeDate'],
  columns: {
    Code:         { as: 'symbol',    type: 'string' },
    Date:         { as: 'tradeDate', type: 'rocDate' },
    OpeningPrice: { as: 'open',      type: 'decimal' },
    HighestPrice: { as: 'high',      type: 'decimal' },
    LowestPrice:  { as: 'low',       type: 'decimal' },
    ClosingPrice: { as: 'close',     type: 'decimal' },
    TradeVolume:  { as: 'volume',    type: 'bigint' },
    TradeValue:   { as: 'turnover',  type: 'bigint' },
  },
})
```

支援的 `type`：`string` `decimal` `bigint` `int` `rocDate` `rocMonth` `percent`。
所有髒資料處理（民國年、千分位、`"--"` → null）**只實作在 `twse/normalize.ts`**。

逃生門：極少數 dataset 可加 `transform?: (row) => Partial<Output>`。但如果超過兩三個 dataset 需要它，那是訊號——去看引擎是不是少支援一種 type，而不是繼續寫 transform。

加新 dataset 的流程：對照 swagger 頁面填一份設定 → 在 `datasets/index.ts` 加一行 → 完成。`ingest.service.ts` 永遠不用改。

---

## 排程按頻率，不按分類

四個 Cloud Scheduler job 涵蓋 150 個 dataset：

| cadence | 排程 | 說明 |
|---|---|---|
| `daily` | 交易日 14:30 | 盤後行情 |
| `monthly` | 每月 11 號 | 月營收公布後 |
| `quarterly` | 每天檢查一次 | 財報公布日不固定，公司會提前或延後 |
| `weekly` | 週六 | 治理類等低頻資料 |

```ts
// ingest.service.ts
const targets = ALL.filter(d => d.cadence === cadence)
```

`quarterly` 刻意設成每天跑：邏輯是「檢查該季資料是否已取得，沒有就試著抓」，抓到空記 skipped。這比賭 5/15 當天一次抓到可靠得多。

---

## 資料庫

### 原始落地表

`periodKey` 是泛化的——`tradeDate` 對財報沒有意義。

```prisma
model TwseRaw {
  id        BigInt   @id @default(autoincrement())
  dataset   String
  category  String   // 'trading' | 'financials' | 'governance'
  periodKey String   // '2026-08-15' | '2026Q2' | '2026-08'
  fetchedAt DateTime @default(now())
  payload   Json

  @@unique([dataset, periodKey])
  @@index([category, fetchedAt])
  @@map("twse_raw")
}
```

### 三種正規化形狀

```prisma
// 證券交易：時間序列
model DailyPrice {
  symbol     String
  tradeDate  DateTime @db.Date
  open       Decimal? @db.Decimal(10, 4)
  high       Decimal? @db.Decimal(10, 4)
  low        Decimal? @db.Decimal(10, 4)
  close      Decimal? @db.Decimal(10, 4)
  volume     BigInt?
  turnover   BigInt?

  @@id([symbol, tradeDate])
  @@index([tradeDate, volume(sort: Desc)])   // 排行榜查詢
  @@map("daily_price")
}

// 財務報表：期間，會被更正重發
model FinancialStatement {
  symbol      String
  fiscalYear  Int
  fiscalQ     Int
  revenue     Decimal? @db.Decimal(18, 2)
  eps         Decimal? @db.Decimal(10, 2)
  revisedAt   DateTime @updatedAt          // 更正時間，不留就不知道數字變過

  @@id([symbol, fiscalYear, fiscalQ])
  @@map("financial_statement")
}

// 公司治理：現況快照
model GovernanceSnapshot {
  symbol       String
  snapshotDate DateTime @db.Date
  payload      Json                        // 欄位差異大，先用 Json

  @@id([symbol, snapshotDate])
  @@map("governance_snapshot")
}
```

**公司治理一定要用 `snapshotDate` 當主鍵一部分。** 只存「現況」的話一覆蓋就沒有歷史了——去年的董事名單、去年的持股比例都查不到。多存幾千列的成本很低。

價格與金額一律 `Decimal` / `NUMERIC`，**禁止 `Float`**。

### 指令

```bash
pnpm prisma generate                      # 改完 schema 就要跑
pnpm prisma migrate dev --name init       # 本機
pnpm prisma migrate deploy                # 部署時
```

**不要用 `prisma db push`** — 不產生 migration 檔，無法追蹤也無法回溯。

**不要在容器啟動時跑 migration** — Cloud Run 多 instance 會競爭。

---

## 依賴規則用 ESLint 強制

靠自律維持依賴方向會失敗，尤其用 AI agent 寫 code。

```js
// eslint.config.js
'import/no-restricted-paths': ['error', {
  zones: [
    { target: './src/modules/*/*.repository.ts',
      from: './src/modules/!(*)/*.repository.ts',
      message: '跨模組只能經 service，不可直接碰別人的 repository' },
    { target: './src/modules/*/*.routes.ts',
      from: './src/modules/*/*.repository.ts',
      message: 'routes 不可碰 repository，要經過 controller → service' },
    { target: './src/modules/*/*.controller.ts',
      from: './src/modules/*/*.repository.ts',
      message: 'controller 不可碰 repository，要經過 service' },
    { target: './src/modules/*/*.service.ts',
      from: './node_modules/@prisma/client',
      message: 'Prisma 只能出現在 repository' },
    { target: './src/shared', from: './src/modules',
      message: 'shared 不可依賴 modules' },
    { target: './src/twse', from: './src/modules',
      message: 'twse 不可依賴 modules' },
  ],
}]
```

更完整的方案可考慮 `eslint-plugin-boundaries`，它專為分層架構設計，表達力更強。

---

## 給 AI agent 的規則

放進根目錄 `GEMINI.md`，Gemini CLI 會自動載入。**不要在裡面寫「本專案採用 Clean Architecture」**——那會讓 agent 生成 `entities/`、`use-cases/`、port 介面等等你不需要的東西。描述規則，不要命名架構。

```markdown
# 專案規則

## 架構
- 每個模組四層：routes（網址表）→ controller（HTTP）→ service（邏輯）→ repository（SQL）
- controller 是唯一碰 req/res 的地方
- repository 是唯一碰 Prisma 的地方
- service 不可知道 HTTP 存在（排程與 script 要能重用）
- 不要建立 entity 物件、aggregate、port 介面 —— 本專案是 ETL，沒有領域不變量
- 不要新增資料夾層級

## 資料處理（違反會導致靜默的錯誤資料）
- 日期是民國年字串："1150731" → 2026-07-31（前三位 + 1911）
- 所有 JSON 欄位都是字串，包含數字，必須明確轉型
- "1,234,567" 去掉逗號；"--" 和 "" 轉 null
- 價格用 Prisma Decimal / NUMERIC，禁止 Float
- 交易日判定用 Asia/Taipei，禁止直接 new Date() 取當地時間
- 民國年只存在於 twse/normalize.ts 內部，不可洩漏到 API 邊界

## 新增 dataset
- 用 defineDataset 填欄位對應表，不要手寫 normalizer
- 需要 transform 時先確認 normalize.ts 是不是少支援一種 type

## 資料庫
- 所有寫入用 upsert，必須可重複執行
- 原始回應先存 twse_raw 再正規化
- schema 變更用 prisma migrate，禁止 db push
- 禁止在容器啟動時執行 migration

## API 慣例
- 分頁一律 cursor-based：{ data, nextCursor }
- 錯誤一律 { error: { code, message } }
- 日期輸出一律 ISO 字串

## 測試
- twse/normalize.ts 的測試覆蓋率要接近 100%
```

---

## 分階段實作

架構按 150 個 dataset 設計（那決定了宣告式 vs 手寫，改不回來），但**實作先做 10 個**。

**階段一（現在）** — 打通一條垂直切片

- `twse/` 三個檔案 + `shared/db.ts` + `shared/period.ts`
- `modules/ingest/` 四件套 + `datasets/trading/` 三個設定檔
- 本機 → Docker → Cloud Run → Cloud Scheduler 全跑通
- **`modules/` 底下此時只有 `ingest/` 一個資料夾。**不要預先建 `stocks/`、`screener/` 等空殼

**階段二** — 驗證抽象

- 補到 10 個 dataset：加除權息（`TWT49U`，不然報酬率是錯的）、月營收、一個財報、一個治理
- 每個分類至少一個，確認 `defineDataset` 對三種形狀都夠用
- **如果 `defineDataset` 有問題，這時改還很快；150 個時發現就是災難**

**階段三** — 開讀取 API

- 先開 `modules/stocks/` 五件套，只做 2~3 支端點
- 再開 `modules/screener/`，驗證 query 參數收斂的設計
- ESLint 依賴規則、zod schema、OpenAPI 自動生成、cache header
- `financials/`、`governance/`、`market/`、`overview/` 等真的有畫面要用時才建

**階段四** — 批次補齊 dataset，加 `financials/`、`governance/` 讀取模組

150 個 dataset 裡大概只有 20 個會被實際查詢（上市公司英文名稱、承銷商資料這類沒人會點）。優先做有人要看的。

---

## 快取：最有效的優化

盤後資料有一個很棒的性質：**收盤後就不再變動**。

```ts
// 今日資料
res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
// 歷史資料（非今日）
res.set('Cache-Control', 'public, max-age=604800')
```

這會讓 Neon 查詢量掉一個數量級，比任何架構優化都有效，也是連線數壓力的主要解法。

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

根目錄的 `pnpm-workspace.yaml`：

```yaml
blockExoticSubdeps: false
```

**必須提交到 Git，也必須 COPY 進 Docker。** 雲端不會 install，但 Docker build 會。放 `.npmrc` 無效（pnpm 11 起該檔只讀 auth 設定）。

### Node 固定 22

`uWebSockets.js` 是 native module，綁 Node ABI，build 與 runtime 版本不同會壞。

```json
"engines": { "node": ">=22 <23" }
```

`@types/node` 也要 `^22`。

---

## 環境變數

```dotenv
# runtime（host 帶 -pooler）
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require&pgbouncer=true"
# migration（不帶 -pooler）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require"

TASK_SECRET="本機開發用"
PORT=3000
TZ=UTC
```

**為什麼兩條**：Cloud Run 多 instance 各自持有連線池，容易超出 Neon 上限，所以 runtime 走 pooled。但 pooled 走 PgBouncer，DDL 行為受限，migration 要走 direct。

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

> Prisma 對 PgBouncer 的參數在版本間有變動，請對照你使用版本的官方文件。

**時區**：容器 `TZ=UTC`，欄位用 `timestamptz`。交易日判定明確用 `Asia/Taipei`——收盤後（14:30 之後）跑的排程若用 UTC 會標到前一天。

---

## 執行

```bash
pnpm run dev        # tsx watch src/index.ts
pnpm run build
pnpm run start
pnpm test
pnpm run backfill   # 歷史回填，只在本機跑
```

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "vitest run",
  "backfill": "tsx backfill.ts"
}
```

---

## API

`/v1/` 從第一天就加——端點多了不可能全部同時改版。

### `GET /healthz`

回 200，不驗證。**不要連 DB**，否則 Neon 冷啟動會讓健康檢查失敗。

### `POST /v1/ingest`

```jsonc
{
  "cadence": "daily",        // 必填：daily | weekly | monthly | quarterly
  "date": "2026-08-15",      // 選填，省略 = 今天（Asia/Taipei）
  "dataset": "STOCK_DAY_ALL" // 選填，指定單一 dataset 補抓
}
```

```jsonc
{
  "periodKey": "2026-08-15",
  "results": [
    { "dataset": "STOCK_DAY_ALL", "rows": 1373, "ok": true },
    { "dataset": "BWIBBU_ALL",    "rows": 1201, "ok": true }
  ]
}
```

**某一個 dataset 失敗不要讓其他回滾**，各自 try/catch、分別記錄，補漏時只補失敗的。

`date` 與 `dataset` 是刻意保留的：沒有它們就無法補抓漏掉的資料。

---

## 端點驗證（必要）

沒驗證的話任何人都能無限觸發，結果是你的 IP 被證交所封鎖、Neon 配額耗盡。

**本機**：比對 `X-Task-Secret`，用 `crypto.timingSafeEqual`，不要用 `===`。

**GCP**：用 Cloud Run 內建 IAM，程式不用自己驗 token。

```bash
gcloud iam service-accounts create twse-scheduler

gcloud run services add-iam-policy-binding twse-sync \
  --member="serviceAccount:twse-scheduler@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" --region=asia-east1
```

部署時加 `--no-allow-unauthenticated`。

---

## Docker

```dockerfile
FROM node:22-slim AS build
# git: uWebSockets.js 走 GitHub 安裝 / openssl: Prisma engine
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TZ=UTC
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
```

三個不能改的地方：

1. **`node:22-slim`（Debian），不要 Alpine** — uWS 預編譯 binary 與 Prisma engine 都對 musl libc 不友善
2. **build 與 runtime 同一個 base image** — native module 綁 ABI，直接複製 `node_modules` 的前提是環境相同
3. **`prisma generate` 在 build 階段** — 產物在 `node_modules/.prisma`，隨 `node_modules` 複製

`.dockerignore`：

```
node_modules
dist
.env
.git
tests
backfill.ts
*.md
```

`backfill.ts` 刻意排除，讓回填程式碼進不了 production image。

---

## 部署

```ts
// src/index.ts
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0")
```

必須綁 `process.env.PORT` 與 `0.0.0.0`，否則 Cloud Run 判定容器沒起來。

```bash
echo -n "postgresql://..." | gcloud secrets create twse-database-url --data-file=-

gcloud run deploy twse-sync \
  --source . \
  --region=asia-east1 \
  --no-allow-unauthenticated \
  --set-secrets=DATABASE_URL=twse-database-url:latest,DIRECT_URL=twse-direct-url:latest \
  --set-env-vars=TZ=UTC \
  --min-instances=1 \
  --max-instances=3
```

`--min-instances=1`：Neon 入門方案會 autosuspend，冷啟動數百 ms 到數秒。常駐一個 instance 可消除，月費約幾美金。

`--max-instances=3`：限制連線數。連線池每 instance 設 `max: 3`，算式是 `instances × pool ≤ Neon 上限`。

### 排程

```bash
gcloud scheduler jobs create http twse-daily \
  --location=asia-east1 \
  --schedule="30 14 * * 1-5" \
  --time-zone="Asia/Taipei" \
  --uri="https://twse-sync-xxx.run.app/v1/ingest" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"cadence":"daily"}' \
  --oidc-service-account-email="twse-scheduler@PROJECT_ID.iam.gserviceaccount.com"
```

其餘三個 cadence 同理，改 `--schedule` 與 `--message-body`。

`1-5` 只排除週末，**國定假日和颱風假還是會觸發**。程式要自己判斷非交易日（回傳空資料記 skipped，不是錯誤）。

### 補漏機制

排程可能漏觸發、服務可能失敗、證交所可能延遲發布。每次任務應先檢查最近幾期有無缺漏，缺則一併補。

**沒有這個機制，資料會靜默遺失且補不回來。**

---

## 資料清理規則

全部實作在 `twse/normalize.ts`，這是全專案最需要測試的地方。

| 原始值 | 處理 |
|---|---|
| `"1150731"` | 民國年 → `2026-07-31`（前三位 + 1911） |
| `"1,234,567"` | 去逗號再轉數字 |
| `"--"` / `""` | `null` |
| `"+"` / `"-"` / `"X"` | 特殊註記，不是數值 |

每個 dataset 的髒法不同，要分別驗證。**清理錯誤不會拋異常，只會靜默寫入錯誤資料**，要等看盤畫面出現離譜數字才會發現。

估值資料額外注意：虧損公司沒有本益比、沒發股利的殖利率是 `0.00`（跟 null 不同）、ETF 可能整組欄位是空的。

---

## 歷史回填

OpenAPI 沒有歷史，用 `www.twse.com.tw` 舊版 API。可回溯到 2010-01-04。

```bash
pnpm run backfill
```

**首選（按日期取全市場，一年約 245 次請求）：**

```
https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20250817&type=ALLBUT0999
```

**備用（按個股取單月，只用於補缺漏）：**

```
https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20250801&stockNo=2330
```

按個股跑一年要 12,000 次請求，是上面的 50 倍。

### 注意事項

- **請求間隔 3~5 秒**。官網 API 沒公開上限但會封 IP。一年約 15~20 分鐘
- **在本機跑，不要放 Cloud Run** — 出口 IP 共用，被封會影響其他服務
- **`MI_INDEX` 回應結構歷年改過** — 早期是 `data1`~`data9`（編號還會浮動），近年是 `tables` 陣列。**不要 hardcode 索引**，按 table 的 `title` 找「每日收盤行情」，否則跨年份會靜默錯位
- 實作前先手動抓 2010、2018、2025 各一天比對結構

---

## 待辦

- [ ] `twse/normalize.ts` 單元測試
- [ ] 交易日曆（國定假日、颱風假）
- [ ] 補漏機制
- [ ] 排程失敗告警（Cloud Monitoring）
- [ ] 除權息資料（`TWT49U`，不然報酬率是錯的）
- [ ] 歷史回填
- [ ] 結構化 JSON 日誌
- [ ] 上櫃資料（TPEx，欄位命名與證交所不同）

---

MIT