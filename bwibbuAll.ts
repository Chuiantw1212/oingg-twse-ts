import { apiClient } from '../twse-client';
import { rocDateToISO, parseTwseNumber, getTaipeiTodayISO } from '../twse-parse';
import prisma, { saveRawResponse, deleteRawResponse } from '../db';
import { DatasetResult } from '../types';

// Based on TWSE OpenAPI spec for /exchangeReport/BWIBBU_ALL
export interface BwibbuAllRow {
  Date: string;
  Code: string;
  Name: string;
  PEratio: string;
  DividendYield: string;
  PBratio: string;
}

export interface NormalizedDailyValuation {
  symbol: string;
  tradeDate: Date;
  peRatio: string | null;
  pbRatio: string | null;
  dividendYield: string | null;
}

/**
 * 獲取「上市個股日本益比、殖利率及股價淨值比」
 */
async function getBwibbuAll(): Promise<BwibbuAllRow[]> {
  try {
    const response = await apiClient.get<BwibbuAllRow[]>('/exchangeReport/BWIBBU_ALL');
    return response.data;
  } catch (error) {
    console.error('Error fetching BWIBBU_ALL from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

export function normalizeBwibbuAll(rows: BwibbuAllRow[]): NormalizedDailyValuation[] {
  return rows.map((row) => ({
    symbol: row.Code,
    tradeDate: rocDateToISO(row.Date),
    peRatio: parseTwseNumber(row.PEratio),
    pbRatio: parseTwseNumber(row.PBratio),
    dividendYield: parseTwseNumber(row.DividendYield),
  }));
}

async function upsertDailyValuations(rows: NormalizedDailyValuation[]): Promise<number> {
  const operations = rows.map((row) =>
    prisma.dailyValuation.upsert({
      where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
      create: {
        symbol: row.symbol,
        tradeDate: row.tradeDate,
        peRatio: row.peRatio,
        pbRatio: row.pbRatio,
        dividendYield: row.dividendYield,
      },
      update: {
        peRatio: row.peRatio,
        pbRatio: row.pbRatio,
        dividendYield: row.dividendYield,
      },
    })
  );
  await prisma.$transaction(operations);
  return operations.length;
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/BWIBBU_ALL：抓取、存 raw、正規化、upsert daily_valuation。
 * @param {string} [date] - TWSE API 不支援，此參數無效但保留以求介面一致。
 */
export async function ingestBwibbuAll(date?: string): Promise<DatasetResult> {
  const dataset = 'BWIBBU_ALL';
  const requestedDate = date ?? getTaipeiTodayISO();
  try {
    const rawRows = await getBwibbuAll();

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return { dataset, rows: 0, ok: true };
    }

    const actualTradeDate = rocDateToISO(rawRows[0].Date);
    const actualTradeDateISO = actualTradeDate.toISOString().slice(0, 10);
    if (date && actualTradeDateISO !== requestedDate) {
      console.warn(
        `[ingest] ${dataset}: requested ${requestedDate} but TWSE OpenAPI only serves today's data (got ${actualTradeDateISO}); historical dates cannot be re-fetched from this endpoint.`
      );
    }

    await saveRawResponse(dataset, actualTradeDate, rawRows);
    const normalized = normalizeBwibbuAll(rawRows);
    const rowCount = await upsertDailyValuations(normalized);
    await deleteRawResponse(dataset, actualTradeDate);

    console.log(`[ingest] ${dataset}: Successfully processed and deleted raw data for ${actualTradeDateISO}.`);
    return { dataset, rows: rowCount, ok: true };
  } catch (error) {
    console.error(`[ingest] ${dataset} failed:`, error);
    return { dataset, rows: 0, ok: false, error: (error as Error).message };
  }
}