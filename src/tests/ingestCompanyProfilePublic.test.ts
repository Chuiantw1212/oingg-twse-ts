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
import { ingestCompanyProfilePublic } from '../domains/companyProfilePublic';

// A public-disclosure (P) company that is not itself a listed ticker — 6-digit code,
// unlike the 4-digit codes used by listed (L) companies. Confirmed against live data
// that P and L codes never overlap.
const publicOnlyRow = {
  出表日期: '1150819',
  公司代號: '000104',
  公司名稱: '臺銀綜合證券股份有限公司',
  公司簡稱: '臺銀證券',
  外國企業註冊地國: '－ ',
  產業別: 'XX',
  住址: '臺北市重慶南路1段58號4~9樓',
  營利事業統一編號: '28428390',
  董事長: '李樹森',
  總經理: '張正康',
  發言人: '梁文奎',
  發言人職稱: '副總經理',
  代理發言人: '會計部連宏銘經理',
  總機電話: '(02)2388-2188',
  成立日期: '20080102',
  上市日期: '20131021',
  普通股每股面額: '新台幣                 10.0000元',
  實收資本額: '3000000000',
  私募股數: '0',
  特別股: '0',
  編制財務報表類型: '2',
  股票過戶機構: '',
  過戶電話: '',
  過戶地址: '',
  簽證會計師事務所: '安侯建業聯合會計師事務所',
  簽證會計師1: '陳奕任',
  簽證會計師2: '蕭雅文',
  英文簡稱: 'BankTaiwan Sec.',
  英文通訊地址: '4~9F., No.58, Sec. 1, Chongching S. Rd., Jhongjheng DistrictTaipei City 100, Taiwan (R.O.C.)',
  傳真機號碼: '(02)2371-7121',
  電子郵件信箱: 'sec00301@twfhcsec.com.tw',
  網址: 'http://www.twfhcsec.com.tw',
  已發行普通股數或TDR原股發行股數: '0',
};

describe('ingestCompanyProfilePublic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches from t187ap03_P and upserts into the shared company_profile table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [publicOnlyRow] });

    const result = await ingestCompanyProfilePublic();

    expect(apiClient.get).toHaveBeenCalledWith('/opendata/t187ap03_P');
    // Distinct dataset name from the listed-company ingest so twse_raw bookkeeping
    // for the two sources never collides on the same (dataset, tradeDate) key.
    expect(saveRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE_PUBLIC', expect.any(Date), [publicOnlyRow]);
    expect(db.companyProfile.upsert).toHaveBeenCalledOnce();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { timeout: 30000 });
    expect(deleteRawResponse).toHaveBeenCalledWith('COMPANY_PROFILE_PUBLIC', expect.any(Date));
    expect(result).toEqual({ dataset: 'COMPANY_PROFILE_PUBLIC', rows: 1, ok: true });
  });

  it('normalizes empty transfer-agency fields (common for non-listed public companies) to empty strings, not a crash', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [publicOnlyRow] });

    await ingestCompanyProfilePublic();

    const upsertArg = vi.mocked(db.companyProfile.upsert).mock.calls[0][0] as any;
    expect(upsertArg.create.symbol).toBe('000104');
    expect(upsertArg.create.stockTransferAgency).toBe('');
  });

  it('returns an error result without touching the database if the fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const result = await ingestCompanyProfilePublic();

    expect(saveRawResponse).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.dataset).toBe('COMPANY_PROFILE_PUBLIC');
  });
});
