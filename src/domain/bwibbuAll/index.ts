import { apiClient } from '../../twse-client';
import { rocDateToISO, parseTwseNumber, getTaipeiTodayISO } from '../../twse-parse';
import prisma from '../../db';
import { DatasetResult } from '../../types';
import { handleDatasetIngestion } from '../../ingest-helper';

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
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] BWIBBU_ALL: Starting to upsert ${rows.length} valuation records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, tradeDate, ...updateData } = row;
      return prisma.dailyValuation.upsert({
        where: { symbol_tradeDate: { symbol: row.symbol, tradeDate: row.tradeDate } },
        create: row,
        update: updateData,
      });
    });
    await prisma.$transaction(operations);
    totalUpserted += batch.length;
    console.log(`[ingest] BWIBBU_ALL: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/BWIBBU_ALL：抓取、存 raw、正規化、upsert daily_valuation。
 * @param {string} [date] - TWSE API 不支援，此參數無效但保留以求介面一致。
 */
export async function ingestBwibbuAll(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'BWIBBU_ALL',
    fetcher: getBwibbuAll,
    normalizer: normalizeBwibbuAll,
    upserter: upsertDailyValuations,
    dateExtractor: (row) => row.Date,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}