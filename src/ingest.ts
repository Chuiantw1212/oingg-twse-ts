import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../middleware';
import { ingestTwseData } from '../ingest';

const router = Router();

/**
 * @swagger
 * /api/ingest:
 *   post:
 *     summary: 觸發 TWSE 資料抓取與儲存
 *     description: 接收外部排程器請求，抓取指定日期（或今天）的 TWSE 資料並儲存到 Neon DB。
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
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料。
 *                 example: "2026-08-15"
 *     responses:
 *       200:
 *         description: 資料抓取與儲存任務已觸發。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tradeDate:
 *                   type: string
 *                   format: date
 *                   example: "2026-08-15"
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       dataset: { type: string, example: "BWIBBU_ALL" }
 *                       rows: { type: number, example: 1201 }
 *                       ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 *       500:
 *         description: 內部伺服器錯誤。
 */
router.post('/api/ingest', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;

  const { date } = req.body ?? {};
  console.log(`[ingest] Triggered for all datasets for date: ${date || 'today'}...`);
  try {
    const result = await ingestTwseData(date);
    console.log(`[ingest] Finished all datasets for date: ${date || 'today'}.`);
    res.status(200).json(result);
  } catch (error) {
    console.error('Ingestion failed:', error);
    res.status(500).json({ message: 'Failed to ingest data', error: (error as Error).message });
  }
});

export default router;