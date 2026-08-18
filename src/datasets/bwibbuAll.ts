import { apiClient } from '../twse-client';
import { DatasetResult } from '../types';

/**
 * 獲取「上市個股日本益比、殖利率及股價淨值比」
 * @returns {Promise<any>} 來自 TWSE API 的資料
 */
export async function getBwibbuAll(): Promise<any> {
  try {
    const response = await apiClient.get('/exchangeReport/BWIBBU_ALL');
    return response.data;
  } catch (error) {
    console.error('Error fetching BWIBBU_ALL from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

// TODO: Add data cleaning functions here as per README.md
// - 日期是民國年字串："1150731" → 2026-07-31（前三位 + 1911，見 ../twse-parse 的 rocDateToISO）
// - 所有 JSON 欄位都是字串，包含數字。必須明確轉型
// - "1,234,567" 要去掉逗號；"--" 和 "" 要轉成 null（見 ../twse-parse 的 parseTwseNumber）
// - 價格一律用 Prisma Decimal / Postgres NUMERIC，禁止 Float
// - 交易日判定必須用 Asia/Taipei 計算，禁止用 new Date() 直接取當地時間

export async function fetchAndCleanBwibbuAll(): Promise<any[]> {
  const rawData = await getBwibbuAll();
  // TODO: Implement actual data cleaning here
  return rawData; // For now, return raw data
}

/**
 * 對應 TWSE OpenAPI /exchangeReport/BWIBBU_ALL。
 * TODO: 目前只抓資料，還沒存 twse_raw、沒正規化、沒 upsert daily_valuation。
 */
export async function ingestBwibbuAll(): Promise<DatasetResult> {
  try {
    const bwibbuData = await fetchAndCleanBwibbuAll();
    return { dataset: 'BWIBBU_ALL', rows: bwibbuData.length, ok: true };
  } catch (error) {
    console.error('[ingest] BWIBBU_ALL failed:', error);
    return { dataset: 'BWIBBU_ALL', rows: 0, ok: false, error: (error as Error).message };
  }
}
