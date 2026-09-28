import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { loadDatabaseConfig } from './database.config.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    const database = loadDatabaseConfig();
    this.pool = new Pool({
      connectionString: database.connectionString,
      max: database.poolMax,
      ssl: database.ssl,
    });
    this.pool.on('error', (error: Error) => {
      this.logger.error(`Idle client error: ${error.message}`);
    });
  }

  query<Row extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
