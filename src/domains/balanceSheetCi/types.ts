/**
 * Represents a single record from the TWSE Balance Sheet API (t187ap07_X_ci).
 * All values from the API are returned as strings.
 */
export interface BalanceSheetCiRecord {
  出表日期: string;
  年度: string;
  季別: string;
  公司代號: string;
  公司名稱: string;
  流動資產: string;
  非流動資產: string;
  資產總計: string;
  流動負債: string;
  非流動負債: string;
  負債總計: string;
  股本: string;
  '權益─具證券性質之虛擬通貨': string;
  資本公積: string;
  保留盈餘: string;
  其他權益: string;
  庫藏股票: string;
  歸屬於母公司業主之權益合計: string;
  共同控制下前手權益: string;
  合併前非屬共同控制股權: string;
  非控制權益: string;
  權益總計: string;
  '待註銷股本股數（單位：股）': string;
  '預收股款（權益項下）之約當發行股數（單位：股）': string;
  '母公司暨子公司所持有之母公司庫藏股股數（單位：股）': string;
  每股參考淨值: string;
}