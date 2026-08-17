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