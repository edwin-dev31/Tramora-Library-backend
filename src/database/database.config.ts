import { z } from 'zod';
import type { ConfigService } from '@nestjs/config';

const poolMaxSchema = z.coerce.number().int().min(1).max(20).default(10);

export interface DatabaseConfig {
  connectionString: string;
  poolMax: number;
  ssl: { rejectUnauthorized: boolean };
}

export const loadDatabaseConfig = (
  config: ConfigService,
): DatabaseConfig => ({
  connectionString: config.getOrThrow<string>('DATABASE_URL'),
  poolMax: poolMaxSchema.parse(config.get('DATABASE_POOL_MAX')),
  ssl: { rejectUnauthorized: false },
});
