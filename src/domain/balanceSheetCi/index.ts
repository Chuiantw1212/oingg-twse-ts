import { BalanceSheetCiRecord } from './types';

/**
 * 抓取並儲存最新一期的資產負債表 (BALANCE_SHEET_CI) 資料。
 * Fetches data from the TWSE OpenAPI and prepares it for storage.
 *
 * @returns An object representing the result of the operation.
 */
export const ingestBalanceSheetCi = async () => {
  const API_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap07_X_ci';
  console.log(`Executing ingestBalanceSheetCi for the latest snapshot from ${API_URL}...`);

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch data from TWSE API. Status: ${response.status} ${response.statusText}`);
    }

    const data: BalanceSheetCiRecord[] = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('TWSE API response is not an array as expected.');
    }

    // TODO: Implement the actual database saving logic here.
    // For example: await db.saveBalanceSheetRecords(data);
    console.log(`Successfully fetched ${data.length} records. (DB save is a TODO)`);

    return { dataset: 'BALANCE_SHEET_CI', rows: data.length, ok: true, message: `Successfully ingested ${data.length} records.` };
  } catch (error) {
    console.error('An error occurred during ingestBalanceSheetCi:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { dataset: 'BALANCE_SHEET_CI', rows: 0, ok: false, message };
  }
};