import { defineConfig } from '@prisma/driver-adapter-utils';

export default defineConfig({
  datasources: [
    {
      name: 'db',
      provider: 'postgresql',
      url: {
        envValue: 'DATABASE_URL',
      },
      directUrl: {
        envValue: 'DIRECT_URL',
      },
    },
  ],
});
