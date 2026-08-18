-- CreateTable
CREATE TABLE "twse_raw" (
    "id" BIGSERIAL NOT NULL,
    "dataset" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "twse_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_price" (
    "symbol" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "open" DECIMAL(10,4),
    "high" DECIMAL(10,4),
    "low" DECIMAL(10,4),
    "close" DECIMAL(10,4),
    "volume" BIGINT,
    "turnover" BIGINT,
    "transaction" BIGINT,
    "monthlyAvg" DECIMAL(10,4),

    CONSTRAINT "daily_price_pkey" PRIMARY KEY ("symbol","tradeDate")
);

-- CreateTable
CREATE TABLE "daily_valuation" (
    "symbol" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "peRatio" DECIMAL(10,2),
    "pbRatio" DECIMAL(10,2),
    "dividendYield" DECIMAL(10,2),

    CONSTRAINT "daily_valuation_pkey" PRIMARY KEY ("symbol","tradeDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "twse_raw_dataset_tradeDate_key" ON "twse_raw"("dataset", "tradeDate");
