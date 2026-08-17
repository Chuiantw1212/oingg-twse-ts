import express, { Express, Request, Response } from 'ultimate-express';

const app: Express = express();
const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Ultimate Express with TypeScript!');
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});