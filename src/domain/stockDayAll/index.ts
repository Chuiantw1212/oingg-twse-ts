import { apiClient } from '../../twse-client';
import { rocDateToISO, parseTwseNumber, parseTwseBigInt, getTaipeiTodayISO } from '../../twse-parse';
import prisma from '../../db';
import { DatasetResult } from '../../types';
import { handleDatasetIngestion } from '../../ingest-helper';

export interface StockDayAllRow {
  Date: string;
  Code: string;
  Name: string;
  TradeVolume: string;
  TradeValue: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
  Transaction: string;
}

export interface NormalizedDailyPrice {
  symbol: string;
  tradeDate: Date;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: bigint | null;
  turnover: bigint | null;
  transaction: bigint | null;
}

/**
 * 獲取「上市個股日成交資訊」
 * @returns {Promise<StockDayAllRow[]>} 來自 TWSE API 的原始資料
 */
export async function getStockDayAll(): Promise<StockDayAllRow[]> {
  try {
    const response = await apiClient.get<StockDayAllRow[]>('/exchangeReport/STOCK_DAY_ALL');
    return response.data;
  } catch (error) {
    console.error('Error fetching STOCK_DAY_ALL from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

/**
 * Change（漲跌價差）刻意不存：能從前後兩天存好的 close 算出來，不屬於「抓不到就永久消失」的資料（見 README）。
 */
export function normalizeStockDayAll(rows: StockDayAllRow[]): NormalizedDailyPrice[] {
  return rows.map((row) => ({
    symbol: row.Code,
    tradeDate: rocDateToISO(row.Date),
    open: parseTwseNumber(row.OpeningPrice),
    high: parseTwseNumber(row.HighestPrice),
    low: parseTwseNumber(row.LowestPrice),
    close: parseTwseNumber(row.ClosingPrice),
    volume: parseTwseBigInt(row.TradeVolume),
    turnover: parseTwseBigInt(row.TradeValue),
    transaction: parseTwseBigInt(row.Transaction),
  }));
}

/**
 * upsert daily_price。只寫入 open/high/low/close/volume/turnover/transaction，不動 monthlyAvg，
 * 這樣才能跟 STOCK_DAY_AVG_ALL 寫入的欄位共存於同一列（symbol, tradeDate）。
 */
export async function upsertDailyPrices(rows: NormalizedDailyPrice[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] STOCK_DAY_ALL: Starting to upsert ${rows.length} price records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, tradeDate, ...updateData } = row;
      return prisma.dailyPrice.upsert({
        where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
        create: row,
        update: updateData,
      });
    });
    await prisma.$transaction(operations);
    totalUpserted += batch.length;
    console.log(`[ingest] STOCK_DAY_ALL: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_ALL：抓取、存 raw、正規化、upsert daily_price。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestStockDayAll(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'STOCK_DAY_ALL',
    fetcher: getStockDayAll,
    normalizer: normalizeStockDayAll,
    upserter: upsertDailyPrices,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}