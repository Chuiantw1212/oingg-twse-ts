import { ingestBwibbuAll } from './datasets/bwibbuAll';
import { ingestStockDayAvgAll } from './datasets/stockDayAvgAll';
import { ingestStockDayAll } from './datasets/stockDayAll';
import { getTaipeiTodayISO } from './twse-parse';
import { DatasetResult } from './types';

/**
 * 執行資料抓取、清理並儲存到資料庫的主流程。
 * 每個 dataset 各自獨立記錄結果，某一個失敗不影響其他的（見 README「每天抓哪些」）。
 * dataset 本身的細節（fetch/normalize/upsert）都在 datasets/ 底下各自的檔案，這裡只負責組合。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料。
 */
export async function ingestTwseData(date?: string): Promise<{ tradeDate: string; results: DatasetResult[] }> {
  const requestedDate = date ?? getTaipeiTodayISO();
  console.log(`Starting data ingestion for date: ${requestedDate}`);

  const results = await Promise.all([ingestStockDayAll(requestedDate), ingestStockDayAvgAll(requestedDate), ingestBwibbuAll()]);

  return { tradeDate: requestedDate, results };
}
