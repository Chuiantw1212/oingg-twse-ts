import { Router } from 'ultimate-express';
import healthzRouter from './healthz';
import ingestBwibbuAllRouter from '../domain/bwibbuAll/route';
import ingestStockDayAllRouter from '../domain/stockDayAll/route';
import ingestStockDayAvgAllRouter from '../domain/stockDayAvgAll/route';
import ingestBalanceSheetCiRouter from '../domain/balanceSheetCi/route';
import ingestRouter from './ingest';
import rootRouter from './root';

const router = Router();

router.use(rootRouter);
router.use(healthzRouter);
router.use('/api/ingest', ingestRouter);
router.use('/api/ingest', ingestBwibbuAllRouter);
router.use('/api/ingest', ingestStockDayAllRouter);
router.use('/api/ingest', ingestStockDayAvgAllRouter);
router.use('/api/ingest', ingestBalanceSheetCiRouter);

export default router;