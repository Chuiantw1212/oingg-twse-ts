import { ingestBwibbuAll } from '../bwibbuAll';
import { ingestStockDayAll } from '../stockDayAll';
import { ingestStockDayAvgAll } from '../stockDayAvgAll';
import { ingestBalanceSheetCi } from '../balanceSheetCi';
import { getTaipeiTodayISO } from '../../shared/twse-parse';
import { DatasetResult } from '../../shared/types';

/**
 * Orchestrates the ingestion of all TWSE datasets.
 * @param date The specific date to ingest data for. Defaults to today.
 */
export async function ingestTwseData(date?: string) {
  const tradeDate = date || getTaipeiTodayISO();
  console.log(`[ingest] Starting ingestion for all datasets for date: ${tradeDate}`);

  const results: DatasetResult[] = await Promise.all([
    ingestBwibbuAll(tradeDate),
    ingestStockDayAll(tradeDate),
    ingestStockDayAvgAll(tradeDate),
    ingestBalanceSheetCi(), // This dataset is not date-specific
  ]);

  console.log(`[ingest] Finished ingestion for all datasets for date: ${tradeDate}`);
  return { tradeDate, results };
}