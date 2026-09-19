import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;

/** Bootstrap provisional (T-04). T-16 lo reemplaza por `loadEnv` + logger + middlewares + filtro. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env['PORT'] ?? DEFAULT_PORT);
}

void bootstrap();
