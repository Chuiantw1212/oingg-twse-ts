import { MopsCashFlowStatementRecord } from './types';

interface IngestParams {
  companyId: string;
  year: string;
  season: string;
}

/**
 * 抓取並處理指定公司和期間的現金流量表 (t164sb05)。
 * @param params 包含公司代號、年份和季度的參數
 * @returns 一個表示操作結果的物件
 */
export const ingestMopsCashFlowStatement = async (params: IngestParams) => {
  const API_URL = 'https://mops.twse.com.tw/mops/api/t164sb05';
  const { companyId, year, season } = params;

  const payload = {
    companyId,
    dataType: '2', // '2' for consolidated, '1' for individual
    season,
    year,
    subsidiaryCompanyId: '',
  };

  console.log(`Executing ingestMopsCashFlowStatement with payload:`, payload);

  // TODO: Implement fetch, transform, and load logic here.
  return {
    dataset: 'MOPS_CASH_FLOW_STATEMENT_T164SB05',
    ok: true,
    message: 'Mock response: Ingestion logic not implemented yet.',
    status: 200,
  };
};