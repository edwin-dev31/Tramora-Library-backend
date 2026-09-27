import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config
      .get<string>(
        'CORS_ORIGINS',
        'http://localhost:5173,http://localhost:8080',
      )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
