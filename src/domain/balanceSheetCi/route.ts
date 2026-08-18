import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestBalanceSheetCi } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/balance-sheet-ci:
 *   post:
 *     summary: 觸發資產負債表 (一般業) 抓取
 *     description: 對應 TWSE OpenAPI /opendata/t187ap07_X_ci。
 *     security:
 *       - TaskSecret: []
 *     responses:
 *       200:
 *         description: 抓取成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "BALANCE_SHEET_CI" }
 *                 rows: { type: number, example: 2500 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/balance-sheet-ci', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;

  console.log('[ingest] Triggered for BALANCE_SHEET_CI...');
  const result = await ingestBalanceSheetCi();
  console.log(`[ingest] Finished BALANCE_SHEET_CI. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;