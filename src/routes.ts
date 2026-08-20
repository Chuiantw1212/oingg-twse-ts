import { Router } from 'ultimate-express';
import healthzRouter from './domains/system/route';
import ingestBwibbuAllRouter from './domains/bwibbuAll/route';
import ingestStockDayAllRouter from './domains/stockDayAll/route';
// TODO: stockDayAvgAll domain not implemented yet (index.ts/route.ts empty)
// import ingestStockDayAvgAllRouter from './domains/stockDayAvgAll/route';
import ingestCompanyProfileRouter from './domains/companyProfile/route';
import rootRouter from './domains/system/root';

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);
router.use(healthzRouter);

// --- API Routes ---
const apiRouter = Router();
apiRouter.use(ingestBwibbuAllRouter);
apiRouter.use(ingestStockDayAllRouter);
// apiRouter.use(ingestStockDayAvgAllRouter);
apiRouter.use(ingestCompanyProfileRouter);

router.use('/api/ingest', apiRouter);

export default router;