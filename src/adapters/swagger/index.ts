import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';

// 在 CommonJS / Node runtime 中，__dirname 會自動存在，避免 import.meta 在目前 tsconfig 下不被允許。

// apis 用 __dirname 而非固定 'src'，這樣 dev（tsx 跑 src/*.ts）跟 build 後（node 跑 dist/*.js）都找得到同一批 JSDoc 註解。
// glob 用的路徑一定要是正斜線——Windows 上 path.join 出來的反斜線路徑，swagger-jsdoc 的 glob matcher 完全比對不到，spec 會是空的。
const toGlob = (...segments: string[]) => path.join(...segments).replace(/\\/g, '/');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TWSE 資料同步微服務 API',
      version: '1.0.0',
      description: '每日從台灣證券交易所抓取盤後資料，存入 Neon Postgres。',
    },
    components: {
      securitySchemes: {
        TaskSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Task-Secret',
        },
      },
    },
  },
  apis: [
    toGlob(__dirname, '..', '..', 'domains', '**', 'route.ts'),
    toGlob(__dirname, '..', '..', 'routes', '*.ts'),
  ],
});

export { swaggerUi, swaggerSpec };