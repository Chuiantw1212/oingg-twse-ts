import { Router } from 'ultimate-express';
import healthzRouter from './domain/system/route';
import ingestBwibbuAllRouter from './domain/bwibbuAll/route';
import ingestStockDayAllRouter from './domain/stockDayAll/route';
import ingestStockDayAvgAllRouter from './domain/stockDayAvgAll/route';
import ingestBalanceSheetCiRouter from './domain/balanceSheetCi/route';
import rootRouter from './domain/system/root';

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);
router.use(healthzRouter);

// --- API Routes ---
const apiRouter = Router();
apiRouter.use(ingestBwibbuAllRouter);
apiRouter.use(ingestStockDayAllRouter);
apiRouter.use(ingestStockDayAvgAllRouter);
apiRouter.use(ingestBalanceSheetCiRouter);

router.use('/api/ingest', apiRouter);

export default router;