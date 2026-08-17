import { fetchAndCleanBwibbuAll, getStockDayAvgAll, normalizeStockDayAvgAll, rocDateToISO, getTaipeiTodayISO } from './twse';
import { saveRawResponse, upsertDailyPrices } from './db';

interface DatasetResult {
  dataset: string;
  rows: number;
  ok: boolean;
  error?: string;
}

async function ingestStockDayAvgAll(requestedDate: string): Promise<DatasetResult> {
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

async function ingestBwibbuAll(): Promise<DatasetResult> {
  try {
    const bwibbuData = await fetchAndCleanBwibbuAll();
    return { dataset: 'BWIBBU_ALL', rows: bwibbuData.length, ok: true };
  } catch (error) {
    console.error('[ingest] BWIBBU_ALL failed:', error);
    return { dataset: 'BWIBBU_ALL', rows: 0, ok: false, error: (error as Error).message };
  }
}

/**
 * 執行資料抓取、清理並儲存到資料庫的主流程。
 * 每個 dataset 各自獨立記錄結果，某一個失敗不影響其他的（見 README「每天抓哪些」）。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料。
 */
export async function ingestTwseData(date?: string): Promise<{ tradeDate: string; results: DatasetResult[] }> {
  const requestedDate = date ?? getTaipeiTodayISO();
  console.log(`Starting data ingestion for date: ${requestedDate}`);

  const results = await Promise.all([ingestStockDayAvgAll(requestedDate), ingestBwibbuAll()]);

  return { tradeDate: requestedDate, results };
}