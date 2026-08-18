import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestBalanceSheetCi } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/balance-sheet-ci:
 *   post:
 *     summary: 觸發資產負債表 (BALANCE_SHEET_CI) 抓取與儲存
 *     description: 對應 TWSE OpenAPI 的資產負債表資料。此端點允許指定年份和季度來抓取特定期間的資料。
 *     security:
 *       - TaskSecret: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year:
 *                 type: string
 *                 description: "指定要抓取的年份，格式為 YYYY。如果未提供，將由後端邏輯決定預設值 (例如，今年)。"
 *                 example: "2023"
 *               quarter:
 *                 type: string
 *                 description: "指定要抓取的季度 (1-4)。如果未提供，將由後端邏輯決定預設值 (例如，上一季)。"
 *                 example: "4"
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/balance-sheet-ci', requireTaskSecret, async (req: Request, res: Response) => {
  const { year, quarter } = req.body || {};
  console.log(`[ingest] Triggered for BALANCE_SHEET_CI for year: ${year || 'default'}, quarter: ${quarter || 'default'}...`);
  const result = await ingestBalanceSheetCi({ year, quarter });
  console.log(`[ingest] Finished BALANCE_SHEET_CI. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;