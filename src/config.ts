import dotenv from 'dotenv';
import { timingSafeEqual } from 'crypto';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const config = {
  port: process.env.PORT || '3000',
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  taskSecret: process.env.TASK_SECRET,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // Function to safely compare task secrets
  compareTaskSecret: (inputSecret: string): boolean => timingSafeEqual(Buffer.from(inputSecret), Buffer.from(config.taskSecret || '')),
};