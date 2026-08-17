import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  console.log('Database connected successfully.');
}

export default prisma;