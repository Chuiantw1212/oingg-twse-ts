import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestCompanyProfilePublic } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/company-profile-public:
 *   post:
 *     summary: 觸發公開發行公司基本資料 (COMPANY_PROFILE_PUBLIC) 抓取與儲存
 *     description: 對應 TWSE OpenAPI /opendata/t187ap03_P，寫入跟上市公司基本資料相同的 company_profile 表——兩邊公司代號不重疊，公開發行不代表有在證交所掛牌交易。跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
 *     security:
 *       - TaskSecret: []
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "COMPANY_PROFILE_PUBLIC" }
 *                 rows: { type: number, example: 299 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/company-profile-public', requireTaskSecret, async (req: Request, res: Response) => {
  console.log('[ingest] Triggered for COMPANY_PROFILE_PUBLIC...');
  const result = await ingestCompanyProfilePublic();
  console.log(`[ingest] Finished COMPANY_PROFILE_PUBLIC. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;
