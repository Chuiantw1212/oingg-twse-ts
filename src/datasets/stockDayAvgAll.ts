import { apiClient } from '../twse-client';
import { rocDateToISO, parseTwseNumber, getTaipeiTodayISO } from '../twse-parse';
import prisma, { saveRawResponse } from '../db';
import { DatasetResult } from '../types';

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

/**
 * 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_AVG_ALL：抓取、存 raw、正規化、upsert daily_price。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestStockDayAvgAll(date?: string): Promise<DatasetResult> {
  const requestedDate = date ?? getTaipeiTodayISO();
  try {
    const rawRows = await getStockDayAvgAll();

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return { dataset: 'STOCK_DAY_AVG_ALL', rows: 0, ok: true };
    }

    // openapi.twse.com.tw 忽略 ?date=，一律回傳「今天」的資料（見 README 最重要的限制），
    // 所以實際 tradeDate 要從回應本身取得，不能信任呼叫端傳入的 date。
    const actualTradeDate = rocDateToISO(rawRows[0].Date);
    const actualTradeDateISO = actualTradeDate.toISOString().slice(0, 10);
    if (actualTradeDateISO !== requestedDate) {
      console.warn(
        `[ingest] STOCK_DAY_AVG_ALL: requested ${requestedDate} but TWSE OpenAPI only serves today's data (got ${actualTradeDateISO}); historical dates cannot be re-fetched from this endpoint.`
      );
    }

    await saveRawResponse('STOCK_DAY_AVG_ALL', actualTradeDate, rawRows);

    const normalized = normalizeStockDayAvgAll(rawRows);
    const rowCount = await upsertDailyPrices(normalized);

    return { dataset: 'STOCK_DAY_AVG_ALL', rows: rowCount, ok: true };
  } catch (error) {
    console.error('[ingest] STOCK_DAY_AVG_ALL failed:', error);
    return { dataset: 'STOCK_DAY_AVG_ALL', rows: 0, ok: false, error: (error as Error).message };
  }
}
