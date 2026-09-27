import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'sql',
);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to backend-library/.env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const run = async (sql, values = []) => {
  await client.query('BEGIN');
  try {
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const up = async () => {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
    .sort();
  let applied = 0;
  for (const file of files) {
    const exists = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [
      file,
    ]);
    if (exists.rowCount) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await run(sql);
    await run('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    console.log(`applied  ${file}`);
    applied += 1;
  }
  console.log(applied ? `${applied} migration(s) applied` : 'already up to date');
};

const revert = async () => {
  const { rows } = await client.query(
    'SELECT name FROM _migrations ORDER BY name DESC LIMIT 1',
  );
  if (!rows.length) {
    console.log('nothing to revert');
    return;
  }
  const file = rows[0].name;
  const downFile = file.replace(/\.sql$/, '.down.sql');
  let sql;
  try {
    sql = await readFile(path.join(migrationsDir, downFile), 'utf8');
  } catch {
    console.error(`Missing down migration: ${downFile}`);
    process.exitCode = 1;
    return;
  }
  await run(sql);
  await run('DELETE FROM _migrations WHERE name = $1', [file]);
  console.log(`reverted ${file}`);
};

const main = async () => {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const command = process.argv[2] ?? 'up';
    if (command === 'up') await up();
    else if (command === 'revert') await revert();
    else {
      console.error(`Unknown command "${command}". Use "up" or "revert".`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
