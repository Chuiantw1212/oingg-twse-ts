import { getBwibbuAll } from '../../twse/openapi.client';

/**
 * 從 TWSE 客戶端獲取 BWIBBU_ALL 報表資料。
 *
 * 這個服務層作為控制器和外部 API 客戶端之間的中介，
 * 未來可以在此處處理資料轉換、快取或組合多個資料來源的邏輯。
 * @returns {Promise<any>} 來自 TWSE OpenAPI 的資料。
 */
export async function fetchBwibbuAllData(): Promise<any> {
  const data = await getBwibbuAll();
  return data;
}