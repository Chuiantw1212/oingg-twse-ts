import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../adapters/twse/client', () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock('../adapters/db/index', () => ({
  db: {
    dailyPrice: { upsert: vi.fn().mockReturnValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  saveRawResponse: vi.fn().mockResolvedValue(undefined),
  deleteRawResponse: vi.fn().mockResolvedValue(undefined),
}));

import { apiClient } from '../adapters/twse/client';
import { db, saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { ingestStockDayAll, normalizeStockDayAll } from '../domains/stockDayAll';

const mockApiData = [
  {
    Date: '1150819',
    Code: '2330',
    Name: '台積電',
    TradeVolume: '20,123,456',
    TradeValue: '25,987,654,321',
    OpeningPrice: '1,290.00',
    HighestPrice: '1,305.00',
    LowestPrice: '1,285.00',
    ClosingPrice: '1,300.00',
    Change: '10.00',
    Transaction: '45,678',
  },
];

describe('ingestStockDayAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, normalizes, and upserts in one transaction per batch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockApiData });

    const result = await ingestStockDayAll();

    expect(apiClient.get).toHaveBeenCalledWith('/exchangeReport/STOCK_DAY_ALL');
    expect(saveRawResponse).toHaveBeenCalledWith('STOCK_DAY_ALL', expect.any(Date), mockApiData);
    expect(db.dailyPrice.upsert).toHaveBeenCalledOnce();
    // Regression guard: batch upserts must not use Prisma's 5s default $transaction
    // timeout — Neon's pooled connection latency blows past it (see NEON.md).
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('STOCK_DAY_ALL', expect.any(Date));
    expect(result).toEqual({ dataset: 'STOCK_DAY_ALL', rows: 1, ok: true });
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestStockDayAll();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('STOCK_DAY_ALL');
  });

  it('normalizes TWSE strings into typed rows, treating placeholder marks as null', () => {
    const [row] = normalizeStockDayAll([
      { ...mockApiData[0], OpeningPrice: '--', TradeVolume: 'X' },
    ]);

    expect(row.symbol).toBe('2330');
    expect(row.tradeDate.toISOString().slice(0, 10)).toBe('2026-08-19');
    expect(row.open).toBeNull();
    expect(row.volume).toBeNull();
    expect(row.close).toBe('1300.00');
  });
});
