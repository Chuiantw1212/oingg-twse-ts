import { Router, Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '../../shared/middleware';
import { ingestBwibbuAll } from './index';

const router = Router();

/**
 * @swagger
 * /api/ingest/bwibbu-all:
 *   post:
 *     summary: 觸發 BWIBBU_ALL 抓取
 *     description: 對應 TWSE OpenAPI /exchangeReport/BWIBBU_ALL，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
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
 *                 dataset: { type: string, example: "BWIBBU_ALL" }
 *                 rows: { type: number, example: 1201 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
router.post('/bwibbu-all', requireTaskSecret, async (req: Request, res: Response) => {
  console.log('[ingest] Triggered for BWIBBU_ALL...');
  const result = await ingestBwibbuAll();
  console.log(`[ingest] Finished BWIBBU_ALL. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

export default router;