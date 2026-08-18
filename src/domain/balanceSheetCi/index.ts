import { apiClient } from '../../adapters/twse/client';
import { rocDateToISO, parseTwseNumber, parseTwseBigInt } from '../../adapters/twse/parse';
import prisma from '../../adapters/db';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

// From https://openapi.twse.com.tw/v1/opendata/t187ap07_X_ci
export interface BalanceSheetCiRow {
  '出表日期': string;
  '年度': string;
  '季別': string;
  '公司代號': string;
  '公司名稱': string;
  '流動資產': string;
  '非流動資產': string;
  '資產總計': string;
  '流動負債': string;
  '非流動負債': string;
  '負債總計': string;
  '股本': string;
  '權益─具證券性質之虛擬通貨': string;
  '資本公積': string;
  '保留盈餘': string;
  '其他權益': string;
  '庫藏股票': string;
  '歸屬於母公司業主之權益合計': string;
  '共同控制下前手權益': string;
  '合併前非屬共同控制股權': string;
  '非控制權益': string;
  '權益總計': string;
  '待註銷股本股數（單位：股）': string;
  '預收股款（權益項下）之約當發行股數（單位：股）': string;
  '母公司暨子公司所持有之母公司庫藏股股數（單位：股）': string;
  '每股參考淨值': string;
}

export interface NormalizedBalanceSheet {
  symbol: string;
  year: number;
  quarter: number;
  reportDate: Date;
  currentAssets: bigint | null;
  nonCurrentAssets: bigint | null;
  totalAssets: bigint | null;
  currentLiabilities: bigint | null;
  nonCurrentLiabilities: bigint | null;
  totalLiabilities: bigint | null;
  capitalStock: bigint | null;
  equityVirtualCurrency: bigint | null;
  capitalSurplus: bigint | null;
  retainedEarnings: bigint | null;
  otherEquity: bigint | null;
  treasuryStock: bigint | null;
  equityToParent: bigint | null;
  commonControlPredecessorEquity: bigint | null;
  nonCommonControlPredecessorEquity: bigint | null;
  nonControllingInterest: bigint | null;
  totalEquity: bigint | null;
  sharesAwaitingCancellation: bigint | null;
  equivalentSharesFromPrepayments: bigint | null;
  treasurySharesHeldBySubs: bigint | null;
  bookValuePerShare: string | null;
}

async function getBalanceSheetCi(): Promise<BalanceSheetCiRow[]> {
  const dataset = 't187ap07_X_ci';
  try {
    const response = await apiClient.get<BalanceSheetCiRow[]>(`/opendata/${dataset}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${dataset} from TWSE OpenAPI:`, error);
    throw new Error(`Failed to fetch data from TWSE OpenAPI for ${dataset}.`);
  }
}

export function normalizeBalanceSheetCi(rows: BalanceSheetCiRow[]): NormalizedBalanceSheet[] {
  return rows.map((row) => ({
    symbol: row['公司代號'],
    year: Number(row['年度']),
    quarter: Number(row['季別']),
    reportDate: rocDateToISO(row['出表日期']),
    currentAssets: parseTwseBigInt(row['流動資產']),
    nonCurrentAssets: parseTwseBigInt(row['非流動資產']),
    totalAssets: parseTwseBigInt(row['資產總計']),
    currentLiabilities: parseTwseBigInt(row['流動負債']),
    nonCurrentLiabilities: parseTwseBigInt(row['非流動負債']),
    totalLiabilities: parseTwseBigInt(row['負債總計']),
    capitalStock: parseTwseBigInt(row['股本']),
    equityVirtualCurrency: parseTwseBigInt(row['權益─具證券性質之虛擬通貨']),
    capitalSurplus: parseTwseBigInt(row['資本公積']),
    retainedEarnings: parseTwseBigInt(row['保留盈餘']),
    otherEquity: parseTwseBigInt(row['其他權益']),
    treasuryStock: parseTwseBigInt(row['庫藏股票']),
    equityToParent: parseTwseBigInt(row['歸屬於母公司業主之權益合計']),
    commonControlPredecessorEquity: parseTwseBigInt(row['共同控制下前手權益']),
    nonCommonControlPredecessorEquity: parseTwseBigInt(row['合併前非屬共同控制股權']),
    nonControllingInterest: parseTwseBigInt(row['非控制權益']),
    totalEquity: parseTwseBigInt(row['權益總計']),
    sharesAwaitingCancellation: parseTwseBigInt(row['待註銷股本股數（單位：股）']),
    equivalentSharesFromPrepayments: parseTwseBigInt(row['預收股款（權益項下）之約當發行股數（單位：股）']),
    treasurySharesHeldBySubs: parseTwseBigInt(row['母公司暨子公司所持有之母公司庫藏股股數（單位：股）']),
    bookValuePerShare: parseTwseNumber(row['每股參考淨值']),
  }));
}

async function upsertBalanceSheets(rows: NormalizedBalanceSheet[]): Promise<number> {
  const dataset = 'BALANCE_SHEET_CI';
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] ${dataset}: Starting to upsert ${rows.length} balance sheet records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) =>
      (prisma as any).quarterlyBalanceSheet?.upsert?.({
        where: { symbol_year_quarter: { symbol: row.symbol, year: row.year, quarter: row.quarter } },
        create: row,
        update: row,
      }) ?? Promise.reject(new Error('Prisma model quarterlyBalanceSheet is not available.'))
    );
    await prisma.$transaction(operations);
    totalUpserted += batch.length;
    console.log(`[ingest] ${dataset}: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

export async function ingestBalanceSheetCi(): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'BALANCE_SHEET_CI',
    rawDatasetName: 't187ap07_X_ci', // The name used for the raw data endpoint and storage
    fetcher: getBalanceSheetCi,
    normalizer: normalizeBalanceSheetCi,
    upserter: upsertBalanceSheets,
    dateExtractor: (row) => row['出表日期'],
  });
}