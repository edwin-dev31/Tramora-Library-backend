import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { loadDatabaseConfig } from './database.config.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'sql',
);

const UP_SUFFIX = '.sql';
const DOWN_SUFFIX = '.down.sql';

interface MigrationRow {
  name: string;
}

const withTransaction = async <T>(
  client: Client,
  work: () => Promise<T>,
): Promise<T> => {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const ensureMigrationsTable = async (client: Client): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

const listUpMigrations = async (): Promise<string[]> => {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith(UP_SUFFIX) && !file.endsWith(DOWN_SUFFIX))
    .sort();
};

const listAppliedMigrations = async (client: Client): Promise<Set<string>> => {
  const { rows } = await client.query<MigrationRow>(
    'SELECT name FROM _migrations',
  );
  return new Set(rows.map((row) => row.name));
};

const readMigration = async (file: string): Promise<string> =>
  readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

export const migrateUp = async (client: Client): Promise<string[]> => {
  const files = await listUpMigrations();
  const applied = await listAppliedMigrations(client);
  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readMigration(file);
    await withTransaction(client, async () => {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    });
    executed.push(file);
  }

  return executed;
};

export const migrateRevert = async (client: Client): Promise<string | null> => {
  const { rows } = await client.query<MigrationRow>(
    'SELECT name FROM _migrations ORDER BY applied_at DESC, name DESC LIMIT 1',
  );
  if (!rows.length) return null;

  const file = rows[0].name;
  const downFile = file.replace(/\.sql$/, DOWN_SUFFIX);
  const sql = await readMigration(downFile);

  await withTransaction(client, async () => {
    await client.query(sql);
    await client.query('DELETE FROM _migrations WHERE name = $1', [file]);
  });

  return file;
};

export const withMigrationClient = async <T>(
  work: (client: Client) => Promise<T>,
): Promise<T> => {
  const database = loadDatabaseConfig();
  const client = new Client({
    connectionString: database.connectionString,
    ssl: database.ssl,
  });

  await client.connect();
  try {
    await ensureMigrationsTable(client);
    return await work(client);
  } finally {
    await client.end();
  }
};
