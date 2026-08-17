import { Request, Response } from 'ultimate-express';
import { fetchBwibbuAllData } from '../services/report.service';

export async function fetchBwibbuAll(req: Request, res: Response): Promise<void> {
  try {
    const data = await fetchBwibbuAllData();
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof Error) {
      res.status(502).json({ message: 'Bad Gateway: Failed to fetch data from upstream API.', error: error.message });
    } else {
      res.status(500).json({ message: 'An unknown internal error occurred.' });
    }
  }
}