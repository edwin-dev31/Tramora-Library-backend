import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

export type QueryExecutor = {
  query<Row extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
};

export type RepositoryExecutor = QueryExecutor | PoolClient;

export interface ListOptions {
  where?: string;
  values?: unknown[];
  orderBy?: string;
  limit?: number;
  offset?: number;
}

const identifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

/**
 * Small data-access base for tables with UUID primary keys.
 * Table and column names are supplied only by repository code, never by HTTP input.
 */
export abstract class BaseRepository<
  Row extends QueryResultRow & { id: string },
> {
  protected constructor(
    protected readonly database: QueryExecutor,
    private readonly table: string,
    private readonly columns: readonly string[],
  ) {}

  protected executor(executor?: RepositoryExecutor): QueryExecutor {
    return executor ?? this.database;
  }

  protected selectColumns(): string {
    return this.columns.map(identifier).join(', ');
  }

  async findById(
    id: string,
    executor?: RepositoryExecutor,
  ): Promise<Row | null> {
    const result = await this.executor(executor).query<Row>(
      `SELECT ${this.selectColumns()} FROM ${identifier(this.table)} WHERE "id" = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async list(
    options: ListOptions = {},
    executor?: RepositoryExecutor,
  ): Promise<Row[]> {
    const where = options.where ? ` WHERE ${options.where}` : '';
    const orderBy = options.orderBy ? ` ORDER BY ${options.orderBy}` : '';
    const pagination =
      options.limit === undefined
        ? ''
        : ` LIMIT $${(options.values?.length ?? 0) + 1} OFFSET $${(options.values?.length ?? 0) + 2}`;
    const values = [...(options.values ?? [])];
    if (options.limit !== undefined)
      values.push(options.limit, options.offset ?? 0);
    const result = await this.executor(executor).query<Row>(
      `SELECT ${this.selectColumns()} FROM ${identifier(this.table)}${where}${orderBy}${pagination}`,
      values,
    );
    return result.rows;
  }

  async create(
    input: Partial<Omit<Row, 'id'>>,
    executor?: RepositoryExecutor,
  ): Promise<Row> {
    const fields = Object.keys(input).filter((field) => field !== 'id');
    if (
      !fields.length ||
      fields.some((field) => !this.columns.includes(field))
    ) {
      throw new Error(`Invalid fields for ${this.table} create.`);
    }
    const values: unknown[] = fields.map(
      (field) => input[field as keyof typeof input],
    );
    const result = await this.executor(executor).query<Row>(
      `INSERT INTO ${identifier(this.table)} (${fields.map(identifier).join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING ${this.selectColumns()}`,
      values,
    );
    return result.rows[0];
  }

  async updateById(
    id: string,
    input: Partial<Omit<Row, 'id'>>,
    executor?: RepositoryExecutor,
  ): Promise<Row | null> {
    const fields = Object.keys(input).filter((field) => field !== 'id');
    if (
      !fields.length ||
      fields.some((field) => !this.columns.includes(field))
    ) {
      throw new Error(`Invalid fields for ${this.table} update.`);
    }
    const values: unknown[] = fields.map(
      (field) => input[field as keyof typeof input],
    );
    values.push(id);
    const result = await this.executor(executor).query<Row>(
      `UPDATE ${identifier(this.table)} SET ${fields.map((field, index) => `${identifier(field)} = $${index + 1}`).join(', ')} WHERE "id" = $${values.length} RETURNING ${this.selectColumns()}`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async deleteById(
    id: string,
    executor?: RepositoryExecutor,
  ): Promise<Row | null> {
    const result = await this.executor(executor).query<Row>(
      `DELETE FROM ${identifier(this.table)} WHERE "id" = $1 RETURNING ${this.selectColumns()}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
