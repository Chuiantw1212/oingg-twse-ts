import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  console.log('Database connected successfully.');
}

/**
 * 存下 TWSE 原始回應，正規化失敗時才有機會重跑（見 README「⚠️ 最重要的限制」）。
 * 跟任何一個 dataset 無關（每個 dataset 呼叫時自己帶 dataset 名稱），所以留在這裡而不是 datasets/ 底下。
 */
export async function saveRawResponse(dataset: string, tradeDate: Date, payload: unknown): Promise<void> {
  await prisma.twseRaw.upsert({
    where: { dataset_tradeDate: { dataset, tradeDate } },
    create: { dataset, tradeDate, payload: payload as Prisma.InputJsonValue },
    update: { payload: payload as Prisma.InputJsonValue, fetchedAt: new Date() },
  });
}

/**
 * 正規化、寫入成功後，刪除 `twse_raw` 裡的原始回應以節省空間。
 */
export async function deleteRawResponse(dataset: string, tradeDate: Date): Promise<void> {
  await prisma.twseRaw.delete({
    where: { dataset_tradeDate: { dataset, tradeDate } },
  });
}

export default prisma;
