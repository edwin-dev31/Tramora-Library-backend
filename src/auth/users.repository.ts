import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

@Injectable()
export class UsersRepository extends BaseRepository<UserRecord> {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database, 'users', ['id', 'name', 'email', 'password_hash']);
  }

  createAccount(
    name: string,
    email: string,
    passwordHash: string,
    executor?: RepositoryExecutor,
  ) {
    return this.create({ name, email, password_hash: passwordHash }, executor);
  }

  async findCredentials(
    email: string,
    executor?: RepositoryExecutor,
  ): Promise<Pick<UserRecord, 'id' | 'password_hash'> | null> {
    const result = await this.executor(executor).query<
      Pick<UserRecord, 'id' | 'password_hash'>
    >('SELECT "id", "password_hash" FROM "users" WHERE "email" = $1', [email]);
    return result.rows[0] ?? null;
  }

  async findPublicById(id: string, executor?: RepositoryExecutor) {
    const result = await this.executor(executor).query<
      Omit<UserRecord, 'password_hash'>
    >('SELECT "id", "name", "email" FROM "users" WHERE "id" = $1', [id]);
    return result.rows[0] ?? null;
  }
}
