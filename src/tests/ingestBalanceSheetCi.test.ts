import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ingestBalanceSheetCi } from '../domain/balanceSheetCi';
import { db } from '../adapters/db';

// Mock the entire database adapter module
vi.mock('../adapters/db', () => ({
  db: {
    $executeRaw: vi.fn(),
  },
}));

// A sample successful API response with one record
const mockApiData = [
  {
    '出表日期': '1150818',
    '年度': '115',
    '季別': '2',
    '公司代號': '1111',
    '公司名稱': '欣欣水泥',
    '流動資產': '788777.00',
    '非流動資產': '835251.00',
    '資產總計': '1624028.00',
    '流動負債': '262891.00',
    '非流動負債': '1827.00',
    '負債總計': '264718.00',
    '股本': '930331.00',
    '權益─具證券性質之虛擬通貨': '0.00',
    '資本公積': '0.00',
    '保留盈餘': '401742.00',
    '其他權益': '27237.00',
    '庫藏股票': '0.00',
    '歸屬於母公司業主之權益合計': '1359310.00',
    '共同控制下前手權益': '0.00',
    '合併前非屬共同控制股權': '',
    '非控制權益': '0.00',
    '權益總計': '1359310.00',
    '待註銷股本股數（單位：股）': '',
    '預收股款（權益項下）之約當發行股數（單位：股）': '0.00',
    '母公司暨子公司所持有之母公司庫藏股股數（單位：股）': '0.00',
    '每股參考淨值': '14.61'
  }
];

describe('ingestBalanceSheetCi', () => {
  beforeEach(() => {
    // Mock the global fetch function before each test
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    // Clear all mocks to ensure test isolation
    vi.restoreAllMocks();
  });

  it('should fetch, transform, and execute a batch UPSERT query successfully', async () => {
    // Arrange: Setup mocks for a successful run
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockApiData,
    } as Response);

    vi.mocked(db.$executeRaw).mockResolvedValue(1); // Simulate 1 row affected

    // Act: Run the function
    const result = await ingestBalanceSheetCi();

    // Assert: Verify the outcomes
    expect(fetch).toHaveBeenCalledWith('https://openapi.twse.com.tw/v1/opendata/t187ap07_X_ci');
    expect(db.$executeRaw).toHaveBeenCalledOnce();

    // Check if the generated SQL is correct
    const executedSql = vi.mocked(db.$executeRaw).mock.calls[0][0] as any;
    expect(executedSql.sql).toContain('INSERT INTO quarterly_balance_sheet');
    expect(executedSql.sql).toContain('ON CONFLICT (symbol, "year", "quarter") DO UPDATE SET');
    expect(executedSql.values).toContain('1111'); // Check if symbol is in the parameters
    expect(executedSql.values).toContain(14.61); // Check if a numeric value is in the parameters

    expect(result.ok).toBe(true);
    expect(result.rows).toBe(1);
    expect(result.message).toContain('Successfully processed 1 records');
  });

  it('should return an error result if the fetch fails', async () => {
    // Arrange: Setup mocks for a failed fetch
    // Suppress console.error for this expected error test to keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockErrorText = 'Upstream server error body';
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => mockErrorText, // Add the missing text function to the mock
    } as Response);

    // Act: Run the function
    const result = await ingestBalanceSheetCi();

    // Assert: Verify that the database was not touched
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Failed to fetch data');
    expect(result.message).toContain(mockErrorText); // Verify the error message includes the body
    expect((result as any).status).toBe(502); // Verify the status code is correctly set to 502
  });
});