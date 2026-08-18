import { apiClient } from '../../shared/twse-client';
import { rocDateToISO, parseTwseNumber, getTaipeiTodayISO } from '../../shared/twse-parse';
import prisma from '../../shared/db';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

export interface StockDayAvgRow {
  Date: string;
  Code: string;
  Name: string;
  ClosingPrice: string;
  MonthlyAveragePrice: string;
}

export interface NormalizedDailyPrice {
  symbol: string;
  tradeDate: Date;
  close: string | null;
  monthlyAvg: string | null;
}

/**
 * 獲取「上市個股日收盤價及月平均價」
 * @returns {Promise<StockDayAvgRow[]>} 來自 TWSE API 的原始資料
 */
export async function getStockDayAvgAll(): Promise<StockDayAvgRow[]> {
  try {
    const response = await apiClient.get<StockDayAvgRow[]>('/exchangeReport/STOCK_DAY_AVG_ALL');
    return response.data;
  } catch (error) {
    console.error('Error fetching STOCK_DAY_AVG_ALL from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

export function normalizeStockDayAvgAll(rows: StockDayAvgRow[]): NormalizedDailyPrice[] {
  return rows.map((row) => ({
    symbol: row.Code,
    tradeDate: rocDateToISO(row.Date),
    close: parseTwseNumber(row.ClosingPrice),
    monthlyAvg: parseTwseNumber(row.MonthlyAveragePrice),
  }));
}

/**
 * upsert daily_price。只寫入 close/monthlyAvg，不動 open/high/low/volume/turnover，
 * 這樣才能跟 STOCK_DAY_ALL 寫入的欄位共存於同一列（symbol, tradeDate）。
 */
export async function upsertDailyPrices(rows: NormalizedDailyPrice[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] STOCK_DAY_AVG_ALL: Starting to upsert ${rows.length} price records...`);

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
    console.log(`[ingest] STOCK_DAY_AVG_ALL: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_AVG_ALL：抓取、存 raw、正規化、upsert daily_price。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestStockDayAvgAll(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'STOCK_DAY_AVG_ALL',
    fetcher: getStockDayAvgAll,
    normalizer: normalizeStockDayAvgAll,
    upserter: upsertDailyPrices,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}