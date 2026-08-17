import { PrismaClient, Prisma } from '@prisma/client';
import { NormalizedDailyPrice } from './twse';

const prisma = new PrismaClient();

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  console.log('Database connected successfully.');
}

/**
 * 存下 TWSE 原始回應，正規化失敗時才有機會重跑（見 README「⚠️ 最重要的限制」）。
 */
export async function saveRawResponse(dataset: string, tradeDate: Date, payload: unknown): Promise<void> {
  await prisma.twseRaw.upsert({
    where: { dataset_tradeDate: { dataset, tradeDate } },
    create: { dataset, tradeDate, payload: payload as Prisma.InputJsonValue },
    update: { payload: payload as Prisma.InputJsonValue, fetchedAt: new Date() },
  });
}

/**
 * upsert daily_price。只寫入 close/monthlyAvg，不動 open/high/low/volume/turnover，
 * 這樣才能跟 STOCK_DAY_ALL 寫入的欄位共存於同一列（symbol, tradeDate）。
 */
export async function upsertDailyPrices(rows: NormalizedDailyPrice[]): Promise<number> {
  const operations = rows.map((row) =>
    prisma.dailyPrice.upsert({
      where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
      create: {
        symbol: row.symbol,
        tradeDate: row.tradeDate,
        close: row.close,
        monthlyAvg: row.monthlyAvg,
      },
      update: {
        close: row.close,
        monthlyAvg: row.monthlyAvg,
      },
    })
  );
  await prisma.$transaction(operations);
  return operations.length;
}

export default prisma;