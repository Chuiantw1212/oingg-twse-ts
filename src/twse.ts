import axios from 'axios';

const TWSE_API_BASE_URL = 'https://openapi.twse.com.tw/v1';

const apiClient = axios.create({
  baseURL: TWSE_API_BASE_URL,
  headers: {
    Accept: 'application/json',
  },
  timeout: 10000, // 10 秒超時
});

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
// - 日期是民國年字串："1150731" → 2026-07-31（前三位 + 1911）
// - 所有 JSON 欄位都是字串，包含數字。必須明確轉型
// - "1,234,567" 要去掉逗號；"--" 和 "" 要轉成 null
// - 價格一律用 Prisma Decimal / Postgres NUMERIC，禁止 Float
// - 交易日判定必須用 Asia/Taipei 計算，禁止用 new Date() 直接取當地時間

export async function fetchAndCleanBwibbuAll(): Promise<any[]> {
  const rawData = await getBwibbuAll();
  // TODO: Implement actual data cleaning here
  return rawData; // For now, return raw data
}