import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../adapters/twse/client', () => ({
  apiClient: { get: vi.fn() },
}));

vi.mock('../adapters/db/index', () => ({
  db: {
    companyProfile: { upsert: vi.fn().mockReturnValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  saveRawResponse: vi.fn().mockResolvedValue(undefined),
  deleteRawResponse: vi.fn().mockResolvedValue(undefined),
}));

import { apiClient } from '../adapters/twse/client';
import { db, saveRawResponse, deleteRawResponse } from '../adapters/db/index';
import { ingestCompanyProfile, normalizeCompanyProfile } from '../domains/companyProfile';

const baseRow = {
  出表日期: '1150819',
  公司代號: '1101',
  公司名稱: '臺灣水泥股份有限公司',
  公司簡稱: '台泥',
  外國企業註冊地國: '－ ',
  產業別: '01',
  住址: '台北市中山北路2段113號',
  營利事業統一編號: '11913502',
  董事長: '張安平',
  總經理: '程耀輝',
  發言人: '葉毓君',
  發言人職稱: '永續長',
  代理發言人: '賴家柔',
  總機電話: '(02)2531-7099',
  成立日期: '19501229',
  上市日期: '19620209',
  普通股每股面額: '新台幣                 10.0000元',
  實收資本額: '77231817420',
  私募股數: '0',
  特別股: '200000000',
  編制財務報表類型: '1',
  股票過戶機構: '中國信託商業銀行代理部',
  過戶電話: '66365566',
  過戶地址: '台北市重慶南路一段83號5樓',
  簽證會計師事務所: '勤業眾信聯合會計師事務所',
  簽證會計師1: '翁雅玲',
  簽證會計師2: '邵志明',
  英文簡稱: 'TCC',
  英文通訊地址: 'No.113, Sec.2, Zhongshan N. Rd.,Taipei City 104,Taiwan (R.O.C.)',
  傳真機號碼: '(02)2531-6529',
  電子郵件信箱: 'finance@taiwancement.com',
  網址: 'https://www.tccgroupholdings.com/tw/',
  已發行普通股數或TDR原股發行股數: '7523181742',
};

describe('ingestCompanyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, normalizes, and upserts in one transaction per batch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [baseRow] });

    const result = await ingestCompanyProfile();

    expect(apiClient.get).toHaveBeenCalledWith('/opendata/t187ap03_L');
    expect(saveRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE', expect.any(Date), [baseRow]);
    expect(db.companyProfile.upsert).toHaveBeenCalledOnce();
    // Regression guard: batch upserts must not use Prisma's 5s default $transaction
    // timeout — Neon's pooled connection latency blows past it (see NEON.md).
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE', expect.any(Date));
    expect(result).toEqual({ dataset: 'COMPANY_PROFILE', rows: 1, ok: true });
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestCompanyProfile();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('COMPANY_PROFILE');
  });

  it('extracts par value regardless of currency prefix, ignoring no-par / not-applicable text', () => {
    const [ntd] = normalizeCompanyProfile([baseRow]);
    expect(ntd.parValue).toBe('10.0000');

    const [usd] = normalizeCompanyProfile([{ ...baseRow, 普通股每股面額: '美金0.05元' }]);
    expect(usd.parValue).toBe('0.05');

    const [noPar] = normalizeCompanyProfile([{ ...baseRow, 普通股每股面額: '無面額' }]);
    expect(noPar.parValue).toBeNull();

    const [notApplicable] = normalizeCompanyProfile([{ ...baseRow, 普通股每股面額: '不適用' }]);
    expect(notApplicable.parValue).toBeNull();
  });

  it('parses established/listed dates as Gregorian (not ROC) and report date as ROC', () => {
    const [row] = normalizeCompanyProfile([baseRow]);
    expect(row.reportDate.toISOString().slice(0, 10)).toBe('2026-08-19');
    expect(row.establishedDate?.toISOString().slice(0, 10)).toBe('1950-12-29');
    expect(row.listedDate?.toISOString().slice(0, 10)).toBe('1962-02-09');
  });

  it('normalizes domestic placeholder and missing optional fields to null', () => {
    const [row] = normalizeCompanyProfile([
      { ...baseRow, 外國企業註冊地國: '－ ', 已發行普通股數或TDR原股發行股數: '' },
    ]);
    expect(row.foreignRegistrationCountry).toBeNull();
    expect(row.issuedShares).toBeNull();

    const [foreign] = normalizeCompanyProfile([
      { ...baseRow, 外國企業註冊地國: 'KY 開曼群島                    ' },
    ]);
    expect(foreign.foreignRegistrationCountry).toBe('KY 開曼群島');
  });
});
