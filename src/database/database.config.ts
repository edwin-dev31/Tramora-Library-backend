import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required and must be a valid connection string'),
  DATABASE_POOL_MAX: z.coerce
    .number({ error: 'DATABASE_POOL_MAX must be a number' })
    .int()
    .min(1)
    .max(20)
    .default(10),
});

export interface DatabaseConfig {
  connectionString: string;
  poolMax: number;
  ssl: { rejectUnauthorized: boolean };
}

export const loadDatabaseConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig => {
  const parsed = databaseEnvSchema.parse(env);
  return {
    connectionString: parsed.DATABASE_URL,
    poolMax: parsed.DATABASE_POOL_MAX,
    ssl: { rejectUnauthorized: false },
  };
};
