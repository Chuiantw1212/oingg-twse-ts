import { BalanceSheetCiRecord } from './types';
// Assuming a configured database client is available, similar to other parts of the app
import { Prisma } from '@prisma/client';
import { db } from '../../adapters/db';
import { parseBigIntInThousands, parseNumeric, parseRocDate } from '../../shared/parsers';

/**
 * 抓取並儲存最新一期的資產負債表 (BALANCE_SHEET_CI) 資料。
 * This function now performs an ETL (Extract, Transform, Load) process directly
 * into the final `balance_sheets` table, with progress logging.
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

    const rawData: BalanceSheetCiRecord[] = await response.json();

    if (!Array.isArray(rawData)) {
      throw new Error('TWSE API response is not an array as expected.');
    }

    console.log(`Successfully fetched ${rawData.length} records. Starting batch insert into 'balance_sheets'...`);

    const batchSize = 100;
    let totalInsertedCount = 0;

    for (let i = 0; i < rawData.length; i += batchSize) {
      const batch = rawData.slice(i, i + batchSize);

      // Transform data for the current batch
      const transformedBatch = batch
        .map(record => ({
          company_code: record.公司代號,
          year: parseInt(record.年度, 10),
          quarter: parseInt(record.季別, 10),
          company_name: record.公司名稱,
          report_date: parseRocDate(record.出表日期),
          current_assets: parseBigIntInThousands(record.流動資產),
          non_current_assets: parseBigIntInThousands(record.非流動資產),
          total_assets: parseBigIntInThousands(record.資產總計),
          current_liabilities: parseBigIntInThousands(record.流動負債),
          non_current_liabilities: parseBigIntInThousands(record.非流動負債),
          total_liabilities: parseBigIntInThousands(record.負債總計),
          share_capital: parseBigIntInThousands(record.股本),
          capital_reserves: parseBigIntInThousands(record.資本公積),
          retained_earnings: parseBigIntInThousands(record.保留盈餘),
          other_equity: parseBigIntInThousands(record.其他權益),
          treasury_stock: parseBigIntInThousands(record.庫藏股票),
          equity_attributable_to_owners: parseBigIntInThousands(record.歸屬於母公司業主之權益合計),
          non_controlling_interest: parseBigIntInThousands(record.非控制權益),
          total_equity: parseBigIntInThousands(record.權益總計),
          net_value_per_share: parseNumeric(record.每股參考淨值),
        }))
        .filter(r => r.company_code && !isNaN(r.year) && !isNaN(r.quarter)); // Filter out records with invalid primary key components

      if (transformedBatch.length === 0) {
        console.log(`[Progress] Skipped empty or invalid batch at index ${i}.`);
        continue;
      }

      // --- UPSERT Logic using Raw SQL for batch operation ---
      // This implements a true "INSERT or UPDATE" functionality, which is more robust than "INSERT IGNORE".
      const columns = [
        "company_code", "year", "quarter", "company_name", "report_date", "current_assets",
        "non_current_assets", "total_assets", "current_liabilities", "non_current_liabilities",
        "total_liabilities", "share_capital", "capital_reserves", "retained_earnings",
        "other_equity", "treasury_stock", "equity_attributable_to_owners",
        "non_controlling_interest", "total_equity", "net_value_per_share"
      ];

      const valueTuples = transformedBatch.map(r =>
        Prisma.sql`(${Prisma.join([
          r.company_code, r.year, r.quarter, r.company_name, r.report_date, r.current_assets,
          r.non_current_assets, r.total_assets, r.current_liabilities, r.non_current_liabilities,
          r.total_liabilities, r.share_capital, r.capital_reserves, r.retained_earnings,
          r.other_equity, r.treasury_stock, r.equity_attributable_to_owners,
          r.non_controlling_interest, r.total_equity, r.net_value_per_share
        ])})`
      );

      const upsertQuery = Prisma.sql`
        INSERT INTO balance_sheets (${Prisma.join(columns.map(c => Prisma.raw(`"${c}"`)))})
        VALUES ${Prisma.join(valueTuples)}
        ON CONFLICT (company_code, "year", "quarter") DO UPDATE SET
          company_name = EXCLUDED.company_name,
          report_date = EXCLUDED.report_date,
          current_assets = EXCLUDED.current_assets,
          non_current_assets = EXCLUDED.non_current_assets,
          total_assets = EXCLUDED.total_assets,
          current_liabilities = EXCLUDED.current_liabilities,
          non_current_liabilities = EXCLUDED.non_current_liabilities,
          total_liabilities = EXCLUDED.total_liabilities,
          share_capital = EXCLUDED.share_capital,
          capital_reserves = EXCLUDED.capital_reserves,
          retained_earnings = EXCLUDED.retained_earnings,
          other_equity = EXCLUDED.other_equity,
          treasury_stock = EXCLUDED.treasury_stock,
          equity_attributable_to_owners = EXCLUDED.equity_attributable_to_owners,
          non_controlling_interest = EXCLUDED.non_controlling_interest,
          total_equity = EXCLUDED.total_equity,
          net_value_per_share = EXCLUDED.net_value_per_share,
          updated_at = NOW()
      `;

      const affectedRows = await db.$executeRaw(upsertQuery);
      totalInsertedCount += affectedRows;
      console.log(`[Progress] Processed ${Math.min(i + batchSize, rawData.length)} / ${rawData.length} records. Rows affected in this batch: ${affectedRows}.`);
    }

    console.log(`Batch insertion complete. Total new records inserted: ${totalInsertedCount}.`);

    return {
      dataset: 'BALANCE_SHEET_CI',
      rows: totalInsertedCount,
      ok: true,
      message: `Successfully processed ${rawData.length} records. Affected ${totalInsertedCount} rows in balance_sheets.`,
    };
  } catch (error) {
    console.error('An error occurred during ingestBalanceSheetCi:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { dataset: 'BALANCE_SHEET_CI', rows: 0, ok: false, message };
  }
};