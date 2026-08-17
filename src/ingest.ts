import { fetchAndCleanBwibbuAll } from './twse';
import prisma from './db';

/**
 * 執行資料抓取、清理並儲存到資料庫的主流程。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料。
 * @returns {Promise<any>} 處理結果。
 */
export async function ingestTwseData(date?: string): Promise<any> {
  console.log(`Starting data ingestion for date: ${date || 'today'}`);

  // TODO: Implement the full ingestion flow as per README.md
  // 1. Fetch STOCK_DAY_ALL
  // 2. Fetch BWIBBU_ALL
  // 3. Fetch STOCK_DAY_AVG_ALL
  // 4. Save raw data to twse_raw table
  // 5. Normalize data
  // 6. Upsert to daily_price and daily_valuation tables

  const bwibbuData = await fetchAndCleanBwibbuAll();
  console.log(`Fetched BWIBBU_ALL data: ${bwibbuData.length} rows`);

  return { tradeDate: date || 'today', results: [{ dataset: 'BWIBBU_ALL', rows: bwibbuData.length, ok: true }] };
}