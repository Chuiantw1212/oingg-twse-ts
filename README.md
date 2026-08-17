# TWSE 資料同步微服務

以 TypeScript、ultimate-express、Prisma、Neon Serverless Postgres 建構的資料同步微服務。接收外部排程器的觸發，向台灣證券交易所抓取盤後資料，正規化後存入 Neon。

---

## ⚠️ 先讀這一段：資料來源的關鍵限制

**`openapi.twse.com.tw` 只提供最新一個交易日的快照，不提供歷史查詢。**

實測加上 `?date=20240102` 參數，回傳內容與不加參數完全相同（response body 的 md5 一致），也就是說該參數不被採用。

推論出三個必須遵守的規則：

1. **漏抓一天，該日資料就永久遺失**——OpenAPI 沒有任何補救方式
2. **歷史資料必須另外從 `www.twse.com.tw` 的舊版 API 取得**（見「歷史資料回填」章節）
3. **必須保留原始回應**（raw landing table），parser 寫錯時才能重新衍生，而不需要回頭求證交所

排程失敗必須告警，不能靜默忽略。

---

## 專案架構

```
┌──────────────────┐
│ Cloud Scheduler  │  每個交易日 14:30 (Asia/Taipei)
│  (OIDC 驗證)     │
└────────┬─────────┘
         │ POST /api/tasks/ingest
         ▼
┌──────────────────────────────────────────┐
│  Cloud Run Service (ultimate-express)    │
│                                          │
│  ┌────────────┐      ┌────────────────┐  │
│  │ twse/      │─────▶│ normalizer     │  │
│  │ client     │      │ 民國年/字串數字 │  │
│  └─────┬──────┘      └───────┬────────┘  │
│        │                     │           │
└────────┼─────────────────────┼───────────┘
         │                     │
         ▼                     ▼
┌──────────────────┐   ┌──────────────────────────┐
│  TWSE OpenAPI    │   │      Neon Postgres       │
│ openapi.twse.    │   │                          │
│    com.tw        │   │  twse_raw    ← 原始 JSON │
└──────────────────┘   │  daily_price ← 正規化    │
                       └──────────────────────────┘

┌──────────────────┐
│ Cloud Run Job    │  一次性歷史回填（本機或 Job 執行）
│  backfill        │  來源：www.twse.com.tw MI_INDEX
└──────────────────┘
```

**為什麼要 `twse_raw`**：正規化表是 derived data。當你發現某個欄位理解錯誤、或想多存一個欄位時，可以從 raw 重跑，不必重新抓（也抓不到）。

**為什麼回填要獨立成 Job**：一年約 245 個交易日、每次請求間隔 3~5 秒，總計 15~20 分鐘，會超過 Cloud Run Service 的 request timeout。

---

## 專案結構

```
oingg-twse-ts/
├── prisma/
│   ├── schema.prisma          # 資料庫模型
│   └── migrations/            # migration 歷史（必須提交到 Git）
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   └── task.route.ts
│   │   ├── controllers/
│   │   │   └── task.controller.ts
│   │   └── middleware/
│   │       └── auth.ts        # OIDC / shared secret 驗證
│   ├── twse/                  # 資料來源層（不依賴 api/）
│   │   ├── openapi.client.ts  # openapi.twse.com.tw
│   │   ├── legacy.client.ts   # www.twse.com.tw（回填用，含 rate limit）
│   │   ├── normalizer.ts      # 民國年、千分位、"--" → null
│   │   └── datasets/
│   │       └── stockDayAll.ts
│   ├── db/
│   │   ├── client.ts          # Prisma client singleton
│   │   └── repository.ts      # upsert 邏輯
│   ├── jobs/
│   │   ├── ingest.ts          # 每日增量（可獨立執行）
│   │   └── backfill.ts        # 歷史回填進入點
│   ├── config/
│   │   └── index.ts           # 環境變數驗證（啟動時 fail fast）
│   ├── server.ts              # Cloud Run Service 進入點
│   └── index.ts               # 本地開發進入點
├── tests/
│   └── normalizer.test.ts     # 最需要測試的部分
├── .env.example
├── .dockerignore
├── Dockerfile
├── package.json
├── pnpm-workspace.yaml        # ⚠️ 必要，見「安裝」章節
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

`twse/` 與 `db/` 不放在 `api/` 底下，因為 `jobs/` 也要用同一份邏輯——業務邏輯不屬於 API 層。

---

## 先決條件

| 項目 | 版本 | 說明 |
|---|---|---|
| Node.js | **22.x**（固定） | `uWebSockets.js` 是 native module，綁 Node ABI，build 與 runtime 版本必須一致 |
| pnpm | >= 10.26 | 較舊版本沒有 `blockExoticSubdeps` 設定 |
| Neon | 專案已建立 | 需要 pooled 與 direct 兩組連線字串 |

`package.json` 應包含：

```json
"engines": { "node": ">=22 <23" }
```

---

## 安裝

```bash
git clone https://github.com/Chuiantw1212/oingg-twse-ts.git
cd oingg-twse-ts
pnpm install
```

### ⚠️ `pnpm-workspace.yaml` 是必要檔案

`ultimate-express` 依賴 `uWebSockets.js`，後者透過 GitHub 安裝。pnpm 的 `blockExoticSubdeps`（10.26 起加入，11.0 起預設 `true`）會禁止間接依賴使用非 registry 來源，導致安裝失敗：

```
[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "uWebSockets.js"
(resolved via git-repository) is not allowed in subdependencies
```

專案根目錄的 `pnpm-workspace.yaml` 解除此限制：

```yaml
blockExoticSubdeps: false
```

**此檔案必須提交到 Git，並且必須 COPY 進 Docker build context。** 雖然部署時雲端不會執行 `pnpm install`，但 Docker build 階段會，缺少此檔案 image 就建不起來。

（`.npmrc` 在 pnpm 11 起只讀 auth 與 registry 設定，此項設定放 `.npmrc` 無效。）

---

## 環境變數

```bash
cp .env.example .env
```

```dotenv
# Neon pooled 連線（runtime 使用）
# host 需帶 -pooler 後綴
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require&pgbouncer=true"

# Neon direct 連線（Prisma migrate 使用）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require"

# 觸發端點的共用密鑰（本地開發用；GCP 上改用 OIDC）
TASK_SECRET="change-me"

PORT=3000
TZ=UTC
```

### 為什麼需要兩條連線字串

Cloud Run 會水平擴展，每個 instance 各自持有連線池。20 個 instance × 池大小 10 = 200 條連線，會超出 Neon 限制。因此 runtime 必須走 pooled 連線（PgBouncer），並把每個 instance 的池開小。

但 PgBouncer 是 transaction mode，DDL 與 prepared statement 行為受限，所以 migration 必須走 direct 連線。

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

> Prisma 對 PgBouncer 的支援細節在不同版本間有變動（`pgbouncer=true` 參數、`directUrl` 的行為）。上線前請對照你所使用版本的官方文件確認。

### 時區

容器 `TZ` 設為 `UTC`，資料庫欄位用 `timestamptz`。**交易日的判定必須明確用 `Asia/Taipei` 計算**，不可依賴系統時區——收盤後（台北時間 14:30 後）跑的排程，若用 UTC 判斷會標到前一天。

---

## 資料庫設定

```bash
# 產生 Prisma Client（每次改 schema 後都要跑）
pnpm prisma generate

# 本地開發：建立 migration 並套用
pnpm prisma migrate dev --name init

# 部署環境：只套用既有 migration
pnpm prisma migrate deploy
```

**不要使用 `prisma db push`**（原文件建議的做法）。它不產生 migration 檔案，無法追蹤 schema 歷史、無法回溯、也無法在 CI 中重現。僅適合丟棄式的本地實驗。

**不要在容器啟動時跑 migration。** Cloud Run 會同時啟動多個 instance，彼此競爭會導致 migration 狀態損壞。應在 CI/CD 的獨立步驟，或以單獨的 Cloud Run Job 執行。

### 建議的核心 schema

```prisma
// 原始回應落地表
model TwseRaw {
  id        BigInt   @id @default(autoincrement())
  source    String   // 'openapi' | 'mi_index' | 'stock_day'
  dataset   String   // 'STOCK_DAY_ALL'
  tradeDate DateTime @db.Date
  fetchedAt DateTime @default(now())
  payload   Json

  @@unique([source, dataset, tradeDate])
  @@map("twse_raw")
}

// 正規化後的日行情
model DailyPrice {
  symbol    String
  tradeDate DateTime @db.Date
  open      Decimal? @db.Decimal(10, 4)
  high      Decimal? @db.Decimal(10, 4)
  low       Decimal? @db.Decimal(10, 4)
  close     Decimal? @db.Decimal(10, 4)
  volume    BigInt?
  turnover  BigInt?
  updatedAt DateTime @updatedAt

  @@id([symbol, tradeDate])
  @@map("daily_price")
}
```

價格一律用 `Decimal`／`NUMERIC`，**不要用 `Float`**。`(symbol, tradeDate)` 複合主鍵讓 upsert 天然具備幂等性，重複觸發與補漏重跑都安全。

---

## 執行

```bash
pnpm run dev      # tsx watch，存檔自動重啟
pnpm run build
pnpm run start

pnpm test         # normalizer 測試
```

---

## API 端點

### `GET /healthz`

回傳 `200 OK`。供 Cloud Run 判斷容器就緒，不需驗證。**不要在此端點連 DB**，否則 Neon 冷啟動會讓健康檢查失敗。

### `POST /api/tasks/ingest`

觸發資料抓取。**需要驗證**（見下節）。

```jsonc
{
  "dataset": "STOCK_DAY_ALL",  // 必填
  "date": "2026-08-15"          // 選填，省略 = 今日（Asia/Taipei）
}
```

回應：

```jsonc
{
  "dataset": "STOCK_DAY_ALL",
  "tradeDate": "2026-08-15",
  "rowsUpserted": 1373,
  "skipped": false        // true 表示非交易日或該日已有資料
}
```

`date` 參數是刻意設計的：沒有它就無法補抓漏掉的日期、無法重跑特定 dataset。搭配 upsert，重複呼叫同一組參數是安全的。

本地測試：

```bash
curl -X POST http://localhost:3000/api/tasks/ingest \
  -H "Content-Type: application/json" \
  -H "X-Task-Secret: change-me" \
  -d '{"dataset":"STOCK_DAY_ALL"}'
```

---

## 端點驗證（必要，非選配）

觸發端點若對外公開，任何人都能無限次呼叫，導致：

- 你的出口 IP 被證交所封鎖
- Neon 寫入配額被耗盡
- Cloud Run 帳單異常

### GCP 上：Cloud Scheduler OIDC

```bash
# 1. 建立呼叫用的 service account
gcloud iam service-accounts create twse-scheduler

# 2. 只授權它呼叫此服務
gcloud run services add-iam-policy-binding twse-sync \
  --member="serviceAccount:twse-scheduler@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=asia-east1

# 3. 部署時關閉未驗證存取
gcloud run deploy twse-sync --no-allow-unauthenticated ...
```

Cloud Run 會在請求進入應用程式前完成驗證，你的程式碼不需自行驗 token。

### 本地開發：shared secret

比對 `X-Task-Secret` 標頭與 `TASK_SECRET` 環境變數。比對時使用時間恆定比較（`crypto.timingSafeEqual`），不要用 `===`。

---

## Docker

### Dockerfile

```dockerfile
# ---- build ----
FROM node:22-slim AS build

# uWebSockets.js 透過 GitHub 安裝，pnpm 需要 git
# openssl 為 Prisma engine 所需
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# pnpm-workspace.yaml 必須存在，否則 blockExoticSubdeps 會擋下安裝
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# 移除 devDependencies，保留 native binary 與 Prisma engine
RUN pnpm prune --prod

# ---- runtime ----
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=UTC

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

USER node
CMD ["node", "dist/server.js"]
```

### 三個必須遵守的約束

1. **base image 用 `node:22-slim`（Debian），不要用 Alpine。** `uWebSockets.js` 提供預編譯的 `.node` binary，musl libc 環境容易對不上；Prisma engine 對 libssl 版本也有要求。
2. **build stage 與 runtime stage 必須同一個 base image。** native module 綁 Node ABI，直接複製 `node_modules` 的前提是兩者環境相同。
3. **`prisma generate` 必須在 build 階段執行。** 產生的 client 在 `node_modules/.prisma`，會隨 `node_modules` 一起複製到 runtime。

### `.dockerignore`

```
node_modules
dist
.env
.env.*
!.env.example
.git
tests
*.md
```

---

## 部署到 Cloud Run

### 服務端程式碼要求

```ts
const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => { /* ... */ });
```

必須綁 `process.env.PORT` 與 `0.0.0.0`。只綁 `localhost` 的話 Cloud Run 判定容器未就緒，部署會失敗。

### 連線字串放 Secret Manager

```bash
echo -n "postgresql://..." | gcloud secrets create twse-database-url --data-file=-
```

**不要**把 `DATABASE_URL` 寫進 Dockerfile、image、或明文環境變數。

### 部署

```bash
# Artifact Registry
gcloud artifacts repositories create twse --repository-format=docker --location=asia-east1

# build & push
docker build -t asia-east1-docker.pkg.dev/PROJECT_ID/twse/sync:latest .
docker push asia-east1-docker.pkg.dev/PROJECT_ID/twse/sync:latest

# deploy
gcloud run deploy twse-sync \
  --image=asia-east1-docker.pkg.dev/PROJECT_ID/twse/sync:latest \
  --region=asia-east1 \
  --no-allow-unauthenticated \
  --set-secrets=DATABASE_URL=twse-database-url:latest,DIRECT_URL=twse-direct-url:latest \
  --set-env-vars=TZ=UTC \
  --min-instances=1 \
  --max-instances=3 \
  --memory=512Mi
```

**`--min-instances=1`**：Neon 免費／入門方案會 autosuspend，冷啟動需數百 ms 到數秒。常駐一個 instance 可消除此延遲，成本約每月數美金。

**`--max-instances=3`**：限制連線數上限。這是資料同步服務，不需要高併發，過度擴展只會壓垮 Neon。

### 排程

```bash
gcloud scheduler jobs create http twse-daily-ingest \
  --location=asia-east1 \
  --schedule="30 14 * * 1-5" \
  --time-zone="Asia/Taipei" \
  --uri="https://twse-sync-xxx.run.app/api/tasks/ingest" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"dataset":"STOCK_DAY_ALL"}' \
  --oidc-service-account-email="twse-scheduler@PROJECT_ID.iam.gserviceaccount.com"
```

`1-5` 只是排除週末，**國定假日與颱風假仍會觸發**。程式需自行判斷是否為交易日（回傳空資料或日期與預期不符時，記為 `skipped` 而非錯誤）。

### 補漏機制

Cloud Scheduler 可能漏觸發、Cloud Run 可能失敗、證交所可能延遲發布。因此每日任務應先檢查最近 N 個交易日是否有缺漏，缺則一併補抓。**缺少此機制會導致資料靜默遺失，而 OpenAPI 無法補救。**

### 長時間任務用 Cloud Run Jobs

Cloud Run Service 有 request timeout（預設 5 分鐘，最長 60 分鐘）。歷史回填耗時 15~20 分鐘以上，應以 Cloud Run Job 執行：

```bash
gcloud run jobs create twse-backfill \
  --image=asia-east1-docker.pkg.dev/PROJECT_ID/twse/sync:latest \
  --command=node --args=dist/jobs/backfill.js \
  --task-timeout=3600 \
  --set-secrets=DATABASE_URL=twse-database-url:latest
```

同一個 image、不同 entrypoint。

> 若改以「立即回 202，背景繼續處理」的方式，注意 Cloud Run 在回應送出後會限制 CPU 配額，背景工作可能被凍結。需搭配 `--no-cpu-throttling` 才可靠。

---

## 歷史資料回填

`openapi.twse.com.tw` 無法查歷史，需改用 `www.twse.com.tw` 的舊版 API。歷史資料可回溯至民國 99 年 1 月 4 日（2010-01-04）。

### 首選：MI_INDEX（按日期取全市場）

```
https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20250817&type=ALLBUT0999
```

`type=ALLBUT0999` 為全部證券（不含權證、牛熊證）。

### 備用：STOCK_DAY（按個股取單月）

```
https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20250801&stockNo=2330
```

一次僅回傳單一個股的一個月資料。`date` 參數中只有 `yyyyMM` 生效，`dd` 為必填但不影響結果。

### 請求數量比較

| 做法 | 回填一年所需請求數 |
|---|---|
| MI_INDEX 按交易日 | 約 245 |
| STOCK_DAY 按個股 × 月 | 1000 檔 × 12 月 ≈ 12,000 |

回填用 MI_INDEX，`STOCK_DAY` 僅用於補單一個股的缺漏。

### 爬取規範

證交所官網 API 未公開速率上限，但連續高頻請求會被封鎖 IP。

- 請求間隔 **3~5 秒**（一年約 245 天 → 15~20 分鐘）
- 設定正常的 `User-Agent`
- 失敗需 exponential backoff 重試
- 記錄尚未成功的日期以供續跑

**回填建議在本機執行，不要放 Cloud Run。** Cloud Run 出口 IP 為共用，被封鎖會影響其他服務，也可能受他人行為波及。回填為一次性作業，本機跑完直接寫入 Neon 即可。

### ⚠️ MI_INDEX 回應結構歷年變更

早期版本使用 `data1`~`data9` 這類編號欄位，且編號會隨當日區塊數浮動；近年改為 `tables` 陣列。

**不要 hardcode 陣列索引。** 應依 table 的 `title` 尋找「每日收盤行情」區塊，否則跨年份抓取會靜默錯位。實作前建議手動抓取 2010、2018、2025 各一日比對結構。

---

## 資料處理注意事項

### 民國年

```
"1150731" → 2026-07-31
```

前三位為民國年，加 1911。作為數字比較會得到錯誤結果。

### 所有欄位皆為字串

包含價格與成交量。未轉型直接運算會變成字串串接（`"100" + "200" === "100200"`）。

### 需要清理的值

| 原始值 | 處理 |
|---|---|
| `"1,234,567"` | 移除千分位逗號 |
| `"--"` | `null` |
| `""` | `null` |
| `"X"`、`"+"`、`"-"` | 特殊註記，非數值 |

這些規則在不同 dataset 間不一致，**每個 dataset 需獨立驗證**。normalizer 是最需要單元測試的部分——出錯時不會拋出異常，只會靜默寫入錯誤資料。

### 價格未還原除權息

證交所提供的是未調整價格。直接用於計算報酬率或長期均線，會在除權息日看到假跳空。

若需還原，得另外抓取除權息計算結果表（`TWT49U`）自行調整。判斷依據：僅顯示歷史價格 → 不需要；計算技術指標或績效回測 → 必須。

### 上櫃股票

`www.tpex.org.tw` 是完全獨立的 API，欄位命名與格式與證交所不同。本專案目前僅涵蓋上市（TWSE）。

---

## 待辦

- [ ] normalizer 單元測試（民國年、千分位、null 值）
- [ ] 交易日曆（國定假日、颱風假）
- [ ] 補漏機制（檢查最近 N 個交易日）
- [ ] 排程失敗告警（Cloud Monitoring）
- [ ] 結構化 JSON 日誌（供 Cloud Logging 解析）
- [ ] 歷史回填 script（MI_INDEX）
- [ ] 除權息還原（視需求）
- [ ] 上櫃資料（TPEx）

---

## 授權

MIT