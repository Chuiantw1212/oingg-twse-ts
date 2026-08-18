import { Request, Response } from 'ultimate-express';
import { config } from './config';

/**
 * 本機開發用的 X-Task-Secret 驗證，失敗時已經回應 401。GCP 上改用 Cloud Run IAM，見 README「端點驗證」。
 * @returns {boolean} 是否通過驗證，false 時呼叫端應直接 return，不要再往下處理。
 */
export function requireTaskSecret(req: Request, res: Response): boolean {
  if (!config.isProduction && config.taskSecret && !config.compareTaskSecret(req.headers['x-task-secret'] as string)) {
    res.status(401).json({ message: 'Unauthorized: Invalid X-Task-Secret' });
    return false;
  }
  return true;
}