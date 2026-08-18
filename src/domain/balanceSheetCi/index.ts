import { BalanceSheetCiRecord } from './types';
import { Prisma } from '@prisma/client';
import { db } from '../../adapters/db';
import { parseBigIntInThousands, parseNumeric, parseRocDate } from '../../shared/parsers';

/**
 * Custom error class to carry a suggested HTTP status code for API responses.
 */
class IngestError extends Error {
  constructor(public message: string, public status: number = 500) {
    super(message);
    this.name = 'IngestError';
  }
}

/**
 * 抓取並儲存最新一期的資產負債表 (BALANCE_SHEET_CI) 資料。
 * This function now performs an ETL (Extract, Transform, Load) process directly
 * into the final `quarterly_balance_sheet` table, with progress logging.
 *
 * @returns An object representing the result of the operation.
 */
export const ingestBalanceSheetCi = async () => {
  const API_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap07_X_ci';
  console.log(`Executing ingestBalanceSheetCi for the latest snapshot from ${API_URL}...`);

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '(Could not read error body)');
      // When an upstream service fails, 502 Bad Gateway is more appropriate than 500.
      throw new IngestError(
        `Failed to fetch data from TWSE API. Status: ${response.status} ${response.statusText}. Body: ${errorBody.slice(0, 500)}`,
        502
      );
    }

    const rawData: BalanceSheetCiRecord[] = await response.json();

    if (!Array.isArray(rawData)) {
      // This is a data format violation from the upstream service, which is also a "Bad Gateway" situation.
      throw new IngestError('TWSE API response is not an array as expected.', 502);
    }

    // Log the first record to verify the format before processing
    if (rawData.length > 0) {
      console.log('--- First record from API for format check ---');
      console.log(rawData[0]);
      console.log('--------------------------------------------');
    }

    console.log(`Successfully fetched ${rawData.length} records. Starting batch UPSERT into 'quarterly_balance_sheet'...`);

    const batchSize = 100;
    let totalInsertedCount = 0;

    for (let i = 0; i < rawData.length; i += batchSize) {
      const batch = rawData.slice(i, i + batchSize);

      // Transform data for the current batch
      const transformedBatch = batch
        .map(record => ({
          symbol: record.公司代號,
          year: parseInt(record.年度, 10),
          quarter: parseInt(record.季別, 10),
          reportDate: parseRocDate(record.出表日期),
          currentAssets: parseBigIntInThousands(record.流動資產),
          nonCurrentAssets: parseBigIntInThousands(record.非流動資產),
          totalAssets: parseBigIntInThousands(record.資產總計),
          currentLiabilities: parseBigIntInThousands(record.流動負債),
          nonCurrentLiabilities: parseBigIntInThousands(record.非流動負債),
          totalLiabilities: parseBigIntInThousands(record.負債總計),
          capitalStock: parseBigIntInThousands(record.股本),
          equityVirtualCurrency: parseBigIntInThousands(record['權益─具證券性質之虛擬通貨']),
          capitalSurplus: parseBigIntInThousands(record.資本公積),
          retainedEarnings: parseBigIntInThousands(record.保留盈餘),
          otherEquity: parseBigIntInThousands(record.其他權益),
          treasuryStock: parseBigIntInThousands(record.庫藏股票),
          equityToParent: parseBigIntInThousands(record.歸屬於母公司業主之權益合計),
          commonControlPredecessorEquity: parseBigIntInThousands(record.共同控制下前手權益),
          nonCommonControlPredecessorEquity: parseBigIntInThousands(record.合併前非屬共同控制股權),
          nonControllingInterest: parseBigIntInThousands(record.非控制權益),
          totalEquity: parseBigIntInThousands(record.權益總計),
          sharesAwaitingCancellation: parseBigIntInThousands(record['待註銷股本股數（單位：股）']),
          equivalentSharesFromPrepayments: parseBigIntInThousands(record['預收股款（權益項下）之約當發行股數（單位：股）']),
          treasurySharesHeldBySubs: parseBigIntInThousands(record['母公司暨子公司所持有之母公司庫藏股股數（單位：股）']),
          bookValuePerShare: parseNumeric(record.每股參考淨值),
        }))
        .filter(r => r.symbol && !isNaN(r.year) && !isNaN(r.quarter) && r.reportDate); // Also filter out records where reportDate could not be parsed.

      if (transformedBatch.length === 0) {
        console.log(`[Progress] Skipped empty or invalid batch at index ${i}.`);
        continue;
      }

      // --- UPSERT Logic using Raw SQL for batch operation ---
      // This implements a true "INSERT or UPDATE" functionality, which is more robust than "INSERT IGNORE".
      const columns = [
        "symbol", "year", "quarter", "report_date", "current_assets", "non_current_assets",
        "total_assets", "current_liabilities", "non_current_liabilities", "total_liabilities",
        "capital_stock", "equity_virtual_currency", "capital_surplus", "retained_earnings",
        "other_equity", "treasury_stock", "equity_to_parent", "common_control_predecessor_equity",
        "non_common_control_predecessor_equity", "non_controlling_interest", "total_equity",
        "shares_awaiting_cancellation", "equivalent_shares_from_prepayments",
        "treasury_shares_held_by_subs", "book_value_per_share"
      ];

      const valueTuples = transformedBatch.map(r =>
        Prisma.sql`(${Prisma.join([
          r.symbol, r.year, r.quarter, r.reportDate, r.currentAssets, r.nonCurrentAssets,
          r.totalAssets, r.currentLiabilities, r.nonCurrentLiabilities, r.totalLiabilities,
          r.capitalStock, r.equityVirtualCurrency, r.capitalSurplus, r.retainedEarnings,
          r.otherEquity, r.treasuryStock, r.equityToParent, r.commonControlPredecessorEquity,
          r.nonCommonControlPredecessorEquity, r.nonControllingInterest, r.totalEquity,
          r.sharesAwaitingCancellation, r.equivalentSharesFromPrepayments,
          r.treasurySharesHeldBySubs, r.bookValuePerShare
        ])})`
      );

      const upsertQuery = Prisma.sql`
        INSERT INTO quarterly_balance_sheet (${Prisma.join(columns.map(c => Prisma.raw(`"${c}"`)))})
        VALUES ${Prisma.join(valueTuples)}
        ON CONFLICT (symbol, "year", "quarter") DO UPDATE SET
          report_date = EXCLUDED.report_date,
          current_assets = EXCLUDED.current_assets,
          non_current_assets = EXCLUDED.non_current_assets,
          total_assets = EXCLUDED.total_assets,
          current_liabilities = EXCLUDED.current_liabilities,
          non_current_liabilities = EXCLUDED.non_current_liabilities,
          total_liabilities = EXCLUDED.total_liabilities,
          capital_stock = EXCLUDED.capital_stock,
          equity_virtual_currency = EXCLUDED.equity_virtual_currency,
          capital_surplus = EXCLUDED.capital_surplus,
          retained_earnings = EXCLUDED.retained_earnings,
          other_equity = EXCLUDED.other_equity,
          treasury_stock = EXCLUDED.treasury_stock,
          equity_to_parent = EXCLUDED.equity_to_parent,
          common_control_predecessor_equity = EXCLUDED.common_control_predecessor_equity,
          non_common_control_predecessor_equity = EXCLUDED.non_common_control_predecessor_equity,
          non_controlling_interest = EXCLUDED.non_controlling_interest,
          total_equity = EXCLUDED.total_equity,
          shares_awaiting_cancellation = EXCLUDED.shares_awaiting_cancellation,
          equivalent_shares_from_prepayments = EXCLUDED.equivalent_shares_from_prepayments,
          treasury_shares_held_by_subs = EXCLUDED.treasury_shares_held_by_subs,
          book_value_per_share = EXCLUDED.book_value_per_share,
          updated_at = NOW()
      `;

      const affectedRows = await db.$executeRaw(upsertQuery);
      totalInsertedCount += affectedRows;
      console.log(`[Progress] Processed ${Math.min(i + batchSize, rawData.length)} / ${rawData.length} records. Rows affected in this batch: ${affectedRows}.`);
    }

    console.log(`Batch UPSERT complete. Total rows affected: ${totalInsertedCount}.`);

    return {
      dataset: 'BALANCE_SHEET_CI',
      rows: totalInsertedCount,
      ok: true,
      message: `Successfully processed ${rawData.length} records. Affected ${totalInsertedCount} rows in quarterly_balance_sheet.`,
    };
  } catch (error) {
    console.error('An error occurred during ingestBalanceSheetCi:', error);
    // If it's our custom error, we can use the status it carries.
    if (error instanceof IngestError) {
      return { dataset: 'BALANCE_SHEET_CI', rows: 0, ok: false, message: error.message, status: error.status };
    }
    // For all other errors, it's a genuine internal server error.
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { dataset: 'BALANCE_SHEET_CI', rows: 0, ok: false, message, status: 500 };
  }
};