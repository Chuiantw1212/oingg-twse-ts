import { PrismaClient, Prisma } from '@prisma/client';

const prismaClient = new PrismaClient();

// Export the client as a named export `db` for consistent usage across the app.
export const db = prismaClient;

export async function connectDb(): Promise<void> {
  await db.$connect();
  console.log('Database connected successfully.');
}

/**
 * 存下 TWSE 原始回應，正規化失敗時才有機會重跑（見 README「⚠️ 最重要的限制」）。
 * 跟任何一個 dataset 無關（每個 dataset 呼叫時自己帶 dataset 名稱），所以留在這裡而不是 datasets/ 底下。
 */
export async function saveRawResponse(dataset: string, tradeDate: Date, payload: unknown): Promise<void> {
  await db.twseRaw.upsert({
    where: { dataset_tradeDate: { dataset, tradeDate } },
    create: { dataset, tradeDate, payload: payload as Prisma.InputJsonValue },
    update: { payload: payload as Prisma.InputJsonValue, fetchedAt: new Date() },
  });
}

/**
 * 正規化、寫入成功後，刪除 `twse_raw` 裡的原始回應以節省空間。
 */
export async function deleteRawResponse(dataset: string, tradeDate: Date): Promise<void> {
  await db.twseRaw.deleteMany({
    where: { dataset, tradeDate },
  });
}