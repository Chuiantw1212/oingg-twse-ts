import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestStockDayAll } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/stock-day-all:
 *   post:
 *     summary: 觸發 STOCK_DAY_ALL 抓取與儲存
 *     description: 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_ALL，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
 *     security:
 *       - TaskSecret: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。實際仍取決於 TWSE OpenAPI 只回傳今天的資料。
 *                 example: "2026-08-15"
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "STOCK_DAY_ALL" }
 *                 rows: { type: number, example: 1373 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/stock-day-all', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;

  const date = req.body?.date;
  console.log(`[ingest] Triggered for STOCK_DAY_ALL for date: ${date || 'today'}...`);
  const result = await ingestStockDayAll(date);
  console.log(`[ingest] Finished STOCK_DAY_ALL. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;