import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestBalanceSheetCi } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/balance-sheet-ci:
 *   post:
 *     summary: 觸發資產負債表 (BALANCE_SHEET_CI) 抓取與儲存
 *     description: 對應 TWSE OpenAPI 的資產負債表資料，此 API 會抓取最新一期的資料快照。
 *     security:
 *       - TaskSecret: []
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/balance-sheet-ci', requireTaskSecret, async (req: Request, res: Response) => {
  console.log(`[ingest] Triggered for BALANCE_SHEET_CI (latest snapshot)...`);
  const result = await ingestBalanceSheetCi();
  console.log(`[ingest] Finished BALANCE_SHEET_CI. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;