import axios from 'axios';

const TWSE_API_BASE_URL = 'https://openapi.twse.com.tw/v1';

export const apiClient = axios.create({
  baseURL: TWSE_API_BASE_URL,
  headers: {
    Accept: 'application/json',
  },
  timeout: 10000, // 10 秒超時
});
