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
 * 民國年日期字串轉為 UTC 午夜的 Date（前三碼 + 1911）。
 * 用 Date.UTC 建構，避免存進 Postgres @db.Date 欄位時因時區被 Prisma 序列化成前一天。
 */
export function rocDateToISO(rocDate: string): Date {
  const year = Number(rocDate.slice(0, 3)) + 1911;
  const month = Number(rocDate.slice(3, 5));
  const day = Number(rocDate.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 清理 TWSE 回傳的數值字串："1,234.56" 去逗號；"--"、""、"+"、"-"、"X" 等特殊註記轉 null。
 */
export function parseTwseNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '--') return null;
  if (/^[+\-xX]$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null;
  return cleaned;
}

/**
 * 取得 Asia/Taipei 當地的今天日期（YYYY-MM-DD）。用 Intl 取得該時區的曆法日期，
 * 不能用 new Date() 直接取值，因為容器 TZ=UTC，本地時間不等於台北時間。
 */
export function getTaipeiTodayISO(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' });
  return formatter.format(new Date());
}

export function normalizeStockDayAvgAll(rows: StockDayAvgRow[]): NormalizedDailyPrice[] {
  return rows.map((row) => ({
    symbol: row.Code,
    tradeDate: rocDateToISO(row.Date),
    close: parseTwseNumber(row.ClosingPrice),
    monthlyAvg: parseTwseNumber(row.MonthlyAveragePrice),
  }));
}