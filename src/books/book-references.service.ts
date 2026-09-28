import { Inject, Injectable } from '@nestjs/common';
import { BooksProvider } from './providers/books.provider.js';
import type { Book } from './models/book.model.js';
import { BooksRepository } from './books.repository.js';

export interface BookReference {
  providerId: string;
  metadata: Book | null;
}

@Injectable()
export class BookReferencesService {
  constructor(
    @Inject(BooksRepository) private readonly books: BooksRepository,
    @Inject(BooksProvider) private readonly provider: BooksProvider,
  ) {}

  // Fetch remote metadata before opening a transaction. This never saves a book.
  async prepare(providerId: string): Promise<BookReference> {
    const existing = await this.books.findByProviderId(providerId);
    return {
      providerId,
      metadata: existing ? null : await this.provider.findById(providerId),
    };
  }

  // Called only inside the transaction that creates a loan, reservation or wishlist entry.
  async save(
    client: import('pg').PoolClient,
    reference: BookReference,
  ): Promise<string> {
    
    if (reference.metadata)
      return this.books.createReference(
        reference.providerId,
        reference.metadata,
        client,
      );
    const existing = await this.books.findByProviderId(
      reference.providerId,
      client,
    );
    if (!existing)
      throw new Error(`Book reference not found: ${reference.providerId}`);
    await this.books.lockById(existing.id, client);

    return existing.id;
  }
}
