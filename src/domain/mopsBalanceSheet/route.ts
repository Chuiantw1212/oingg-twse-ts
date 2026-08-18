import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestMopsBalanceSheet } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/mops-balance-sheet:
 *   post:
 *     summary: 觸發資產負債表 (MOPS t164sb03) 抓取
 *     description: 從 MOPS API 抓取指定公司、年份、季度的資產負債表。
 *     security:
 *       - TaskSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: "公司代號"
 *                 example: "2330"
 *               year:
 *                 type: string
 *                 description: "民國年"
 *                 example: "112"
 *               season:
 *                 type: string
 *                 description: "季度 (1-4)"
 *                 example: "4"
 *     responses:
 *       200:
 *         description: 抓取成功。
 *       400:
 *         description: 請求參數錯誤。
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/mops-balance-sheet', requireTaskSecret, async (req: Request, res: Response) => {
  const { companyId, year, season } = req.body || {};
  if (!companyId || !year || !season) {
    return res.status(400).json({ message: 'Missing required parameters: companyId, year, season.' });
  }
  console.log(`[ingest] Triggered for MOPS Balance Sheet (t164sb03) for ${companyId} Q${season}, ${year}...`);
  const result = await ingestMopsBalanceSheet({ companyId, year, season });
  console.log(`[ingest] Finished MOPS Balance Sheet. ok: ${result.ok}`);
  res.status(result.ok ? 200 : (result.status || 500)).json(result);
});

export default router;