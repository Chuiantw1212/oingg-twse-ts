import { apiClient } from '../../adapters/twse/client';
import { rocDateToISO, gregorianDateToISO, parseTwseBigInt, getTaipeiTodayISO } from '../../adapters/twse/parse';
import { db as prisma } from '../../adapters/db/index';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';

// Based on TWSE OpenAPI spec for /opendata/t187ap03_L
export interface CompanyProfileRow {
  出表日期: string;
  公司代號: string;
  公司名稱: string;
  公司簡稱: string;
  外國企業註冊地國: string;
  產業別: string;
  住址: string;
  營利事業統一編號: string;
  董事長: string;
  總經理: string;
  發言人: string;
  發言人職稱: string;
  代理發言人: string;
  總機電話: string;
  成立日期: string;
  上市日期: string;
  普通股每股面額: string;
  實收資本額: string;
  私募股數: string;
  特別股: string;
  編制財務報表類型: string;
  股票過戶機構: string;
  過戶電話: string;
  過戶地址: string;
  簽證會計師事務所: string;
  簽證會計師1: string;
  簽證會計師2: string;
  英文簡稱: string;
  英文通訊地址: string;
  傳真機號碼: string;
  電子郵件信箱: string;
  網址: string;
  已發行普通股數或TDR原股發行股數: string;
}

export interface NormalizedCompanyProfile {
  symbol: string;
  reportDate: Date;
  name: string;
  shortName: string;
  foreignRegistrationCountry: string | null;
  industry: string;
  address: string;
  taxId: string;
  chairman: string;
  generalManager: string;
  spokesperson: string;
  spokespersonTitle: string;
  deputySpokesperson: string | null;
  phone: string;
  establishedDate: Date | null;
  listedDate: Date | null;
  parValue: string | null;
  paidInCapital: bigint | null;
  privatePlacementShares: bigint | null;
  preferredStockShares: bigint | null;
  financialReportType: string;
  stockTransferAgency: string;
  transferAgencyPhone: string;
  transferAgencyAddress: string;
  auditingFirm: string;
  auditor1: string;
  auditor2: string | null;
  englishShortName: string;
  englishAddress: string;
  faxNumber: string | null;
  email: string | null;
  website: string | null;
  issuedShares: bigint | null;
}

/**
 * 必填文字欄位：trim，缺值時回傳空字串（schema 裡這些欄位是 NOT NULL）。
 */
function requiredText(value: string | null | undefined): string {
  return value ? value.trim() : '';
}

/**
 * 選填文字欄位：trim 後把空字串跟「－」這類佔位符號轉成 null（例如本國公司的「外國企業註冊地國」）。
 */
function nullableText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^[－\-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 「普通股每股面額」格式是「新台幣          10.0000元」/「美金0.05元」/「無面額」/「不適用」，
 * 不管幣別前綴（也不管少數記錄編碼壞掉的情況），只取數字部分；抓不到數字就回傳 null。
 */
function parseParValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  return match ? match[0] : null;
}

/**
 * 獲取「上市公司基本資料」
 */
async function getCompanyProfile(): Promise<CompanyProfileRow[]> {
  try {
    const response = await apiClient.get<CompanyProfileRow[]>('/opendata/t187ap03_L');
    return response.data;
  } catch (error) {
    console.error('Error fetching COMPANY_PROFILE (t187ap03_L) from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

/**
 * 快照式資料，不是時間序列——重抓就整列覆蓋，不像 daily_price/quarterly_balance_sheet 那樣按日期/季別累積。
 */
export function normalizeCompanyProfile(rows: CompanyProfileRow[]): NormalizedCompanyProfile[] {
  return rows.map((row) => ({
    symbol: row.公司代號,
    reportDate: rocDateToISO(row.出表日期),
    name: requiredText(row.公司名稱),
    shortName: requiredText(row.公司簡稱),
    foreignRegistrationCountry: nullableText(row.外國企業註冊地國),
    industry: requiredText(row.產業別),
    address: requiredText(row.住址),
    taxId: requiredText(row.營利事業統一編號),
    chairman: requiredText(row.董事長),
    generalManager: requiredText(row.總經理),
    spokesperson: requiredText(row.發言人),
    spokespersonTitle: requiredText(row.發言人職稱),
    deputySpokesperson: nullableText(row.代理發言人),
    phone: requiredText(row.總機電話),
    // 成立日期/上市日期是西元年 8 碼，跟出表日期（民國年）不同格式，見 gregorianDateToISO 註解。
    establishedDate: gregorianDateToISO(row.成立日期),
    listedDate: gregorianDateToISO(row.上市日期),
    parValue: parseParValue(row.普通股每股面額),
    paidInCapital: parseTwseBigInt(row.實收資本額),
    privatePlacementShares: parseTwseBigInt(row.私募股數),
    preferredStockShares: parseTwseBigInt(row.特別股),
    financialReportType: requiredText(row.編制財務報表類型),
    stockTransferAgency: requiredText(row.股票過戶機構),
    transferAgencyPhone: requiredText(row.過戶電話),
    transferAgencyAddress: requiredText(row.過戶地址),
    auditingFirm: requiredText(row.簽證會計師事務所),
    auditor1: requiredText(row['簽證會計師1']),
    auditor2: nullableText(row['簽證會計師2']),
    englishShortName: requiredText(row.英文簡稱),
    englishAddress: requiredText(row.英文通訊地址),
    faxNumber: nullableText(row.傳真機號碼),
    email: nullableText(row.電子郵件信箱),
    website: nullableText(row.網址),
    issuedShares: parseTwseBigInt(row.已發行普通股數或TDR原股發行股數),
  }));
}

/**
 * upsert company_profile。單一 symbol 為主鍵（不是時間序列），重抓就整列覆蓋成最新狀態。
 */
export async function upsertCompanyProfiles(rows: NormalizedCompanyProfile[]): Promise<number> {
  const batchSize = 100;
  let totalUpserted = 0;
  console.log(`[ingest] COMPANY_PROFILE: Starting to upsert ${rows.length} company profile records...`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const operations = batch.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { symbol, ...updateData } = row;
      return prisma.companyProfile.upsert({
        where: { symbol: row.symbol },
        create: row,
        update: updateData,
      });
    });
    // Neon pooled connections can be slow enough (cold start, latency) that 100 sequential
    // upserts blow past Prisma's default 5s transaction timeout — see NEON.md.
    await prisma.$transaction(operations, { timeout: 30000 });
    totalUpserted += batch.length;
    console.log(`[ingest] COMPANY_PROFILE: Upserted ${totalUpserted}/${rows.length} records.`);
  }
  return totalUpserted;
}

/**
 * 對應 TWSE OpenAPI /opendata/t187ap03_L：抓取、存 raw、正規化、upsert company_profile。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestCompanyProfile(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'COMPANY_PROFILE',
    fetcher: getCompanyProfile,
    normalizer: normalizeCompanyProfile,
    upserter: upsertCompanyProfiles,
    dateExtractor: (row) => row.出表日期,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
