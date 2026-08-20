import { apiClient } from '../../adapters/twse/client';
import { getTaipeiTodayISO } from '../../adapters/twse/parse';
import { DatasetResult } from '../../shared/types';
import { handleDatasetIngestion } from '../../shared/ingest-helper';
import { CompanyProfileRow, normalizeCompanyProfile, upsertCompanyProfiles } from '../companyProfile';

/**
 * 公開發行公司基本資料（t187ap03_P）。跟上市公司基本資料（t187ap03_L, ../companyProfile）
 * 欄位結構完全一樣，但公司代號完全不重疊——公開發行不代表有在證交所掛牌交易，例如未單獨
 * 上市的金控子公司。兩邊都寫進同一張 company_profile（主鍵 symbol），互不覆蓋，
 * 純粹是同一份資料的兩個來源，所以直接沿用 companyProfile 的正規化/upsert 邏輯。
 */
async function getCompanyProfilePublic(): Promise<CompanyProfileRow[]> {
  try {
    const response = await apiClient.get<CompanyProfileRow[]>('/opendata/t187ap03_P');
    return response.data;
  } catch (error) {
    console.error('Error fetching COMPANY_PROFILE_PUBLIC (t187ap03_P) from TWSE OpenAPI:', error);
    throw new Error('Failed to fetch data from TWSE OpenAPI.');
  }
}

/**
 * 對應 TWSE OpenAPI /opendata/t187ap03_P：抓取、存 raw、正規化、upsert company_profile。
 * @param {string} [date] - 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。
 */
export async function ingestCompanyProfilePublic(date?: string): Promise<DatasetResult> {
  return handleDatasetIngestion({
    dataset: 'COMPANY_PROFILE_PUBLIC',
    fetcher: getCompanyProfilePublic,
    normalizer: normalizeCompanyProfile,
    upserter: upsertCompanyProfiles,
    dateExtractor: (row) => row.出表日期,
    requestedDate: date ?? getTaipeiTodayISO(),
  });
}
