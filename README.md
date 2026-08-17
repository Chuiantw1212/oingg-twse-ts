# TWSE 資料同步微服務

每日從台灣證券交易所抓取盤後資料，存入 Neon Postgres。
TypeScript + ultimate-express + Prisma，部署在 Cloud Run。

---

## ⚠️ 最重要的限制

**`openapi.twse.com.tw` 只給「今天」的資料，沒有歷史查詢。**

加上 `?date=` 參數無效（回傳內容完全相同）。所以：

- **漏抓一天，那天的資料就永久消失**，沒有任何補救方式
- 因此原始 JSON 必須先存下來（`twse_raw` 表），正規化失敗才有機會重跑
- 因此排程失敗必須告警，不能靜默忽略

歷史資料要另外從 `www.twse.com.tw` 抓（見最後一節）。

---

## 資料流

```
Cloud Scheduler  →  POST /api/ingest  →  抓 TWSE  →  存 twse_raw  →  正規化  →  存 daily_price
   每天 14:30                                                                    daily_valuation
```

就這樣，沒有訊息隊列、沒有背景 worker。每日資料量小，同步處理幾秒內完成。

---

## 專案結構

```
oingg-twse-ts/
├── prisma/
│   ├── schema.prisma       # 資料表定義
│   └── migrations/         # 要提交到 Git
├── src/
│   ├── index.ts            # 進入點：Express + 路由 + 驗證
│   ├── config.ts           # 環境變數（啟動時檢查，缺就直接掛掉）
│   ├── twse.ts             # 抓取 + 資料清理
│   ├── db.ts               # Prisma client + upsert
│   └── ingest.ts           # 主流程：抓 → 存 raw → 正規化 → upsert
├── tests/
│   └── twse.test.ts        # 資料清理的測試（最重要）
├── backfill.ts             # 歷史回填，只在本機跑，不進 image
├── pnpm-workspace.yaml     # ⚠️ 必要，見「安裝」
├── Dockerfile
├── .env.example
└── package.json
```

刻意保持扁平。每個檔案一個職責，不要再往下分層。

**唯一的例外，等觸發了再做：** 當 `twse.ts` 超過約 400 行時（大概是第 4~5 個 dataset），按 dataset 拆分：

```
src/
├── twse-client.ts        # 只有 fetch
├── twse-parse.ts         # 共用純函式：rocToDate, parseTwseNumber
└── datasets/
    ├── index.ts          # export const DATASETS = [...]
    ├── stockDayAll.ts    # 每個 dataset 一個檔案
    └── bwibbu.ts
```

每個 dataset 檔案 export 同一個形狀（`{ name, endpoint, normalize, upsert }`），`datasets/index.ts` 用陣列註冊。這樣新增 dataset 只要新增一個檔案 + 註冊一行，`ingest.ts` 完全不用改。

**在那之前不要預先建立這個結構**，也不要先定 `Dataset` 介面。等三個 dataset 都寫完，共通的部分才會明確，這時抽象一次就對。現在憑想像定介面會定錯，然後 normalizer 會為了遷就錯的介面而寫歪。

`backfill.ts` 放在根目錄而非 `src/`，是因為它被 `.dockerignore` 排除、不會被編譯進 `dist/`。放在 `src/` 底下會讓「哪些檔案會進 image」變得不明顯。

**它不能跟 `index.ts` 合併。** 兩者生命週期相反（server 常駐、backfill 跑完就結束），但真正的理由是安全：回填會在 20 分鐘內對證交所發幾百次請求，這段 code 不該存在於 production image 裡。萬一被環境變數或旗標誤觸發，你的線上服務會開始猛打證交所並導致 IP 被封。不存在的 code 不會被誤觸。

---

## 每天抓哪些

三支端點，各一次請求，全市場一次拿完：

| 端點 | 內容 | 為什麼要抓 |
|---|---|---|
| `/exchangeReport/STOCK_DAY_ALL` | 開高低收、成交量、成交金額 | 地基，所有計算都靠它 |
| `/exchangeReport/BWIBBU_ALL` | 本益比、殖利率、股價淨值比 | **算不出來**，需要 EPS 和股利 |
| `/exchangeReport/STOCK_DAY_AVG_ALL` | 收盤價、月平均價 | 可交叉驗證自己算的平均 |

判斷要不要抓某個 dataset 的標準：**能不能從已有資料算出來？** 不能就抓，因為明天就沒了。

之後建議加上除權息資料，否則除權息日會出現假跳空，報酬率和均線都是錯的。

---

## 給 AI agent 的規則

把以下內容放進專案根目錄的 `GEMINI.md`，Gemini CLI 會自動載入。這些是它猜不到、且會反覆猜錯的規則：

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
- 每個資料清理函式都要有對應的單元測試
- 維持扁平結構，不要主動新增資料夾層級
- 例外：`twse.ts` 超過 400 行時，才按 dataset 拆到 `datasets/`（見 README 結構章節）
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
```

**必須提交到 Git，也必須 COPY 進 Docker。** 雲端不會 install，但 Docker build 會。

（放 `.npmrc` 無效，pnpm 11 起該檔只讀 auth 設定。）

### Node 版本要固定 22

`uWebSockets.js` 是 native module，綁 Node ABI，build 和 runtime 版本不同會壞。

```json
"engines": { "node": ">=22 <23" }
```

`@types/node` 也要對應到 `^22`。

---

## 環境變數

```dotenv
# runtime 用（host 帶 -pooler）
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require&pgbouncer=true"

# migration 用（不帶 -pooler）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require"

TASK_SECRET="本機開發用的密鑰"
PORT=3000
TZ=UTC
```

**為什麼兩條**：Cloud Run 會開多個 instance，各自持有連線池，很容易超出 Neon 上限，所以 runtime 走 pooled。但 pooled 走 PgBouncer，DDL 行為受限，所以 migration 要走 direct。

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

> Prisma 對 PgBouncer 的參數在不同版本間有變動，請對照你使用版本的官方文件。

---

## 資料庫

```bash
pnpm prisma generate                      # 改完 schema 就要跑
pnpm prisma migrate dev --name init       # 本機
pnpm prisma migrate deploy                # 部署時
```

**不要用 `prisma db push`**——不產生 migration 檔，無法追蹤也無法回溯。

**不要在容器啟動時跑 migration**——Cloud Run 多 instance 會互相競爭。

### schema 核心

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
model DailyPrice {
  symbol      String
  tradeDate   DateTime @db.Date
  open        Decimal? @db.Decimal(10, 4)
  high        Decimal? @db.Decimal(10, 4)
  low         Decimal? @db.Decimal(10, 4)
  close       Decimal? @db.Decimal(10, 4)
  volume      BigInt?
  turnover    BigInt?
  monthlyAvg  Decimal? @db.Decimal(10, 4)

  @@id([symbol, tradeDate])
  @@map("daily_price")
}

// BWIBBU_ALL（缺值模式不同，所以分開存）
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
pnpm run build
pnpm run start
pnpm test

pnpm run backfill   # 歷史回填，只在本機跑（見最後一節）
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

### `GET /healthz`

回 200，不驗證。**不要連 DB**，否則 Neon 冷啟動會讓健康檢查失敗。

### `POST /api/ingest`

```jsonc
{ "date": "2026-08-15" }   // 省略 = 今天（Asia/Taipei）
```

一次處理三個 dataset。回傳每個的結果：

```jsonc
{
  "tradeDate": "2026-08-15",
  "results": [
    { "dataset": "STOCK_DAY_ALL",     "rows": 1373, "ok": true },
    { "dataset": "BWIBBU_ALL",        "rows": 1201, "ok": true },
    { "dataset": "STOCK_DAY_AVG_ALL", "rows": 1373, "ok": true }
  ]
}
```

**某一個失敗不要讓其他兩個回滾**，各自獨立記錄，補漏時才能只補失敗的。

`date` 參數是刻意保留的，沒有它就無法補抓漏掉的日期。

本機測試：

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "X-Task-Secret: 你的密鑰"
```

---

## 端點驗證（必要）

沒驗證的話任何人都能無限觸發，結果是你的 IP 被證交所封鎖、Neon 寫入配額耗盡。

**本機**：比對 `X-Task-Secret` 標頭。用 `crypto.timingSafeEqual`，不要用 `===`。

**GCP**：用 Cloud Run 內建的 IAM 驗證，程式不用自己驗 token。

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
# git: uWebSockets.js 走 GitHub 安裝
# openssl: Prisma engine 需要
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# pnpm-workspace.yaml 少了會安裝失敗
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

1. **用 `node:22-slim`，不要 Alpine** — uWS 的預編譯 binary 和 Prisma engine 都對 musl libc 不友善
2. **build 和 runtime 同一個 base image** — native module 綁 ABI，直接複製 `node_modules` 的前提是環境相同
3. **`prisma generate` 要在 build 階段** — 產物在 `node_modules/.prisma`，隨 `node_modules` 一起複製

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

`backfill.ts` 在這裡排除，是刻意讓回填的程式碼進不了 production image。

---

## 部署

程式碼裡必須：

```ts
// src/index.ts
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0")
```

只綁 localhost 的話 Cloud Run 判定容器沒起來，部署會失敗。

```bash
# 密鑰進 Secret Manager，不要放 image 或明文 env
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

`--min-instances=1`：Neon 入門方案會 autosuspend，冷啟動要數百 ms 到數秒。常駐一個 instance 可以消除，月費約幾美金。

`--max-instances=3`：這是同步服務，不需要高併發，限制擴展避免壓垮 Neon。

### 排程

```bash
gcloud scheduler jobs create http twse-daily \
  --location=asia-east1 \
  --schedule="30 14 * * 1-5" \
  --time-zone="Asia/Taipei" \
  --uri="https://twse-sync-xxx.run.app/api/ingest" \
  --http-method=POST \
  --oidc-service-account-email="twse-scheduler@PROJECT_ID.iam.gserviceaccount.com"
```

`1-5` 只排除週末，**國定假日和颱風假還是會觸發**。程式要自己判斷非交易日（回傳空資料時記為 skipped，不是錯誤）。

### 補漏

排程可能漏觸發、服務可能失敗、證交所可能延遲發布。每日任務應該先檢查最近幾個交易日有沒有缺，缺了一起補。

**沒有這個機制，資料會靜默遺失，而且補不回來。**

---

## 資料清理規則

| 原始值 | 處理 |
|---|---|
| `"1150731"` | 民國年 → `2026-07-31`（前三位 + 1911） |
| `"1,234,567"` | 去掉逗號再轉數字 |
| `"--"` / `""` | `null` |
| `"+"` / `"-"` / `"X"` | 特殊註記，不是數值 |

每個 dataset 的髒法不一樣，要分別驗證。

**這是最需要測試的地方**——出錯不會拋異常，只會靜默寫入錯誤資料，你要等到看盤畫面出現離譜數字才會發現。

估值資料額外注意：虧損公司沒有本益比、沒發股利的殖利率是 `0.00`（跟 null 不同）、ETF 可能整組欄位是空的。

---

## 歷史資料回填

OpenAPI 沒有歷史，要用 `www.twse.com.tw` 的舊版 API。可回溯到 2010-01-04。

本機執行：

```bash
pnpm run backfill
```

**首選（按日期取全市場）：**

```
https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20250817&type=ALLBUT0999
```

一年約 245 次請求。

**備用（按個股取單月）：**

```
https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20250801&stockNo=2330
```

只用來補單一個股的缺漏——按個股跑一年要 12,000 次請求，是上面的 50 倍。

### 注意事項

- **請求間隔 3~5 秒**，官網 API 沒公開上限但會封 IP。一年約 15~20 分鐘
- **在本機跑，不要放 Cloud Run** — 出口 IP 共用，被封會影響其他服務
- **`MI_INDEX` 的回應結構歷年改過** — 早期是 `data1`~`data9`（編號還會浮動），近年是 `tables` 陣列。**不要 hardcode 索引**，要按 table 的 `title` 找「每日收盤行情」，否則跨年份會靜默錯位
- 實作前先手動抓 2010、2018、2025 各一天比對結構

---

## 待辦

- [ ] 資料清理的單元測試
- [ ] 交易日曆（國定假日）
- [ ] 補漏機制
- [ ] 排程失敗告警
- [ ] 除權息資料（不然報酬率是錯的）
- [ ] 歷史回填

---

MIT