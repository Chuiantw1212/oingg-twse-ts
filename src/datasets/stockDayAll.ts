import { apiClient } from '../twse-client.js';
import { rocDateToISO, parseTwseNumber, parseTwseBigInt, getTaipeiTodayISO } from '../twse-parse.js';
import prisma, { saveRawResponse, deleteRawResponse } from '../db.js';
import { DatasetResult } from '../types.js';

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
  const operations = rows.map((row) =>
    prisma.dailyPrice.upsert({
      where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
      create: {
        symbol: row.symbol,
        tradeDate: row.tradeDate,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        turnover: row.turnover,
        transaction: row.transaction,
      },
      update: {
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        turnover: row.turnover,
        transaction: row.transaction,
      },
    })
  );
  await prisma.$transaction(operations);
  return operations.length;
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_ALL：抓取、存 raw、正規化、upsert daily_price。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestStockDayAll(date?: string): Promise<DatasetResult> {
  const requestedDate = date ?? getTaipeiTodayISO();
  try {
    const rawRows = await getStockDayAll();

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return { dataset: 'STOCK_DAY_ALL', rows: 0, ok: true };
    }

    // openapi.twse.com.tw 忽略 ?date=，一律回傳「今天」的資料（見 README 最重要的限制），
    // 所以實際 tradeDate 要從回應本身取得，不能信任呼叫端傳入的 date。
    const actualTradeDate = rocDateToISO(rawRows[0].Date);
    const actualTradeDateISO = actualTradeDate.toISOString().slice(0, 10);
    if (actualTradeDateISO !== requestedDate) {
      console.warn(
        `[ingest] STOCK_DAY_ALL: requested ${requestedDate} but TWSE OpenAPI only serves today's data (got ${actualTradeDateISO}); historical dates cannot be re-fetched from this endpoint.`
      );
    }

    await saveRawResponse('STOCK_DAY_ALL', actualTradeDate, rawRows);

    const normalized = normalizeStockDayAll(rawRows);
    const rowCount = await upsertDailyPrices(normalized);

    await deleteRawResponse('STOCK_DAY_ALL', actualTradeDate);
    console.log(`[ingest] STOCK_DAY_ALL: Successfully processed and deleted raw data for ${actualTradeDateISO}.`);

    return { dataset: 'STOCK_DAY_ALL', rows: rowCount, ok: true };
  } catch (error) {
    console.error('[ingest] STOCK_DAY_ALL failed:', error);
    return { dataset: 'STOCK_DAY_ALL', rows: 0, ok: false, error: (error as Error).message };
  }
}
