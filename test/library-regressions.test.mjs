import 'reflect-metadata';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleBooksService } from '../dist/providers/google-books/google-books.service.js';
import { BooksService } from '../dist/books/books.service.js';
import { LoansService } from '../dist/loans/loans.service.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const config = { getOrThrow: () => 'https://example.invalid/books', get: () => undefined };

test('a quota error stops subsequent Google calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 429 }); };
  const provider = new GoogleBooksService(config);
  await assert.rejects(provider.findById('first'));
  await assert.rejects(provider.findById('second'));
  assert.equal(calls, 1);
});

test('concurrent identical lookups share one request without caching successful results', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ id: 'volume', volumeInfo: { title: 'Book' } })); };
  const provider = new GoogleBooksService(config);
  await Promise.all([provider.findById('volume'), provider.findById('volume')]);
  assert.equal(calls, 1);
  await provider.findById('volume');
  assert.equal(calls, 2);
});

test('a stored book remains available without a Google request', async () => {
  const provider = { findById: () => { throw new Error('Unexpected Google request'); } };
  const books = {
    findByProviderId: async () => ({ title: 'Saved book', author: 'Author', description: null, cover_url: null }),
    availability: async () => ({ borrower_id: null, reservation_user_id: null, has_reservation: false }),
  };
  const detail = await new BooksService(provider, books).detail('volume', 'owner');
  assert.equal(detail.title, 'Saved book');
  assert.equal(detail.availability.canBorrow, true);
});

test('loan detail scopes the lookup to the signed-in owner and handles missing loans', async () => {
  const calls = [];
  const loans = { markOverdueForUser: async () => {}, findDetail: async (...args) => { calls.push(args); return null; } };
  const service = new LoansService(null, loans, null, null, null, null);
  await assert.rejects(service.detail('owner', 'loan-id'), /Loan not found/);
  assert.deepEqual(calls, [['owner', 'loan-id']]);
});
