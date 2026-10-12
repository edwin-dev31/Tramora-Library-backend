import 'reflect-metadata';
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleBooksService } from '../dist/providers/google-books/google-books.service.js';
import { OpenLibraryService } from '../dist/providers/open-library/open-library.service.js';
import { OpenLibraryMapper } from '../dist/providers/open-library/open-library.mapper.js';
import { FallbackBooksProvider } from '../dist/books/providers/fallback-books.provider.js';
import { providerIdSchema } from '../dist/books/dto/book-reference.dto.js';
import { BooksRepository } from '../dist/books/books.repository.js';
import { BookReferencesService } from '../dist/books/book-references.service.js';
import { BooksService } from '../dist/books/books.service.js';
import { LoansRepository } from '../dist/loans/loans.repository.js';
import { WishlistRepository } from '../dist/wishlist/wishlist.repository.js';
import { ReservationsRepository } from '../dist/reservations/reservations.repository.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});

const search = { query: 'Dune', field: 'title', limit: 10, offset: 20 };
const config = new ConfigService({
  GOOGLE_BOOKS_API_URL: 'https://google.test/volumes',
  GOOGLE_BOOKS_KEY: 'google-only-key',
  OPEN_LIBRARY_API_URL: 'https://openlibrary.test',
  OPEN_LIBRARY_USER_AGENT: 'LibraryTest/1.0 (test@example.org)',
});
const authenticatedConfig = new ConfigService({
  OPEN_LIBRARY_API_URL: 'https://openlibrary.test',
  OPEN_LIBRARY_ACCESS_KEY: 'access-test',
  OPEN_LIBRARY_SECRET_KEY: 'secret-test',
  OPEN_LIBRARY_USER_AGENT: 'LibraryTest/1.0 (test@example.org)',
});
const googleBook = { id: 'google-volume', volumeInfo: { title: 'Dune' } };
const olDoc = {
  key: '/works/OL893415W',
  title: 'Dune',
  author_name: ['Frank Herbert'],
  first_publish_year: 1965,
  cover_i: 12345,
};
const olPage = { numFound: 50, docs: [olDoc] };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
const createProvider = () =>
  new FallbackBooksProvider(
    new GoogleBooksService(config),
    new OpenLibraryService(config),
  );
const errorCode = (code) => (error) => error.getResponse().code === code;

test('successful Google search stays primary and preserves its IDs and pagination', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    return json({ totalItems: 50, items: [googleBook] });
  };
  const result = await createProvider().search(search);
  assert.equal(result.items[0].id, 'google-volume');
  assert.deepEqual(result.pagination, { total: 50, limit: 10, offset: 20 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, 'google.test');
  assert.equal(calls[0].searchParams.get('key'), 'google-only-key');
});

test('empty Google results, including out-of-range pages, do not trigger fallback', async () => {
  for (const totalItems of [0, 50]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return json({ totalItems });
    };
    const result = await createProvider().search(search);
    assert.deepEqual(result.items, []);
    assert.equal(calls, 1);
  }
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`Google HTTP ${status} switches to Open Library with the same search`, async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(new URL(url));
      if (url.host === 'google.test') return json({}, status);
      assert.equal(url.searchParams.has('key'), false);
      assert.equal(
        options.headers['User-Agent'],
        'LibraryTest/1.0 (test@example.org)',
      );
      assert.equal(options.signal.aborted, false);
      return json(olPage);
    };
    const result = await createProvider().search(search);
    assert.deepEqual(
      calls.map((url) => url.host),
      ['google.test', 'openlibrary.test'],
    );
    assert.equal(calls[1].searchParams.get('title'), 'Dune');
    assert.equal(calls[1].searchParams.get('limit'), '10');
    assert.equal(calls[1].searchParams.get('offset'), '20');
    assert.deepEqual(result.items[0], {
      id: 'openlibrary:OL893415W',
      title: 'Dune',
      authors: ['Frank Herbert'],
      publishedDate: '1965',
      description: null,
      coverUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
    });
    assert.deepEqual(result.pagination, { total: 50, limit: 10, offset: 20 });
  });
}

for (const failure of [
  'network',
  'TimeoutError',
  'AbortError',
  'invalid-json',
  'invalid-shape',
]) {
  test(`Google ${failure} triggers fallback`, async () => {
    globalThis.fetch = async (url) => {
      if (url.host === 'openlibrary.test') return json(olPage);
      if (failure === 'invalid-json') return new Response('broken JSON');
      if (failure === 'invalid-shape')
        return json({ items: [{ wrong: true }] });
      throw Object.assign(new Error('upstream failure'), { name: failure });
    };
    assert.equal(
      (await createProvider().search(search)).items[0].id,
      'openlibrary:OL893415W',
    );
  });
}

test('Google cooldown skips failed calls and Google is retried after recovery', async () => {
  let now = 1_000_000;
  mock.method(Date, 'now', () => now);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url.host);
    return url.host === 'openlibrary.test'
      ? json(olPage)
      : now === 1_000_000
        ? json({}, 429)
        : json({ totalItems: 1, items: [googleBook] });
  };
  const provider = createProvider();
  await provider.search(search);
  await provider.search(search);
  assert.deepEqual(calls, ['google.test', 'openlibrary.test']);
  now += 15 * 60_000 + 1;
  assert.equal((await provider.search(search)).items[0].id, 'google-volume');
  assert.equal(calls.at(-1), 'google.test');
});

test('both providers unavailable return a controlled error and respect cooldowns', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return json({}, 503);
  };
  const provider = createProvider();
  await assert.rejects(
    provider.search(search),
    errorCode('BOOK_PROVIDERS_UNAVAILABLE'),
  );
  await assert.rejects(
    provider.search(search),
    errorCode('BOOK_PROVIDERS_UNAVAILABLE'),
  );
  assert.equal(calls, 2);
});

test('validation and programming errors are not hidden by fallback', async () => {
  for (const failure of [new BadRequestException(), new Error('bug')]) {
    const provider = new FallbackBooksProvider(
      {
        search: async () => {
          throw failure;
        },
      },
      {
        search: async () => assert.fail('Unexpected fallback'),
      },
    );
    await assert.rejects(provider.search(search), (error) => error === failure);
  }
});

test('Google book IDs are never sent to Open Library on a detail failure', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url.host);
    return json({}, 503);
  };
  await assert.rejects(createProvider().findById('google-volume'));
  assert.deepEqual(calls, ['google.test']);
});

test('Open Library detail remains routed to Open Library when Google is healthy', async () => {
  let now = 1_000_000;
  mock.method(Date, 'now', () => now);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    now += 1_001;
    return url.pathname.startsWith('/works/')
      ? json({
          key: olDoc.key,
          title: 'Dune',
          covers: [-1, 6789],
          description: { value: 'A desert planet.' },
          first_publish_date: '1965',
        })
      : json(olPage);
  };
  const detail = await createProvider().findById('openlibrary:OL893415W');
  assert.equal(detail.id, 'openlibrary:OL893415W');
  assert.deepEqual(detail.authors, ['Frank Herbert']);
  assert.equal(detail.description, 'A desert planet.');
  assert.equal(
    detail.coverUrl,
    'https://covers.openlibrary.org/b/id/6789-M.jpg',
  );
  assert.deepEqual(
    calls.map((url) => url.host),
    ['openlibrary.test', 'openlibrary.test'],
  );
  assert.equal(calls[1].searchParams.get('q'), 'key:/works/OL893415W');
});

test('optional detail enrichment can fail without losing the authoritative work', async () => {
  let now = 1_000_000;
  mock.method(Date, 'now', () => now);
  globalThis.fetch = async (url) => {
    now += 1_001;
    return url.pathname.startsWith('/works/')
      ? json({
          key: olDoc.key,
          title: 'Dune',
          description: 'Plain description',
        })
      : json({}, 503);
  };
  const detail = await new OpenLibraryService(config).findById(
    'openlibrary:OL893415W',
  );
  assert.equal(detail.title, 'Dune');
  assert.equal(detail.description, 'Plain description');
  assert.deepEqual(detail.authors, []);
});

test('missing Open Library work returns 404; mismatched work IDs are rejected', async () => {
  globalThis.fetch = async () => json({}, 404);
  await assert.rejects(
    new OpenLibraryService(config).findById('openlibrary:OL893415W'),
    NotFoundException,
  );
  globalThis.fetch = async () =>
    json({ key: '/works/OL999W', title: 'Wrong work' });
  await assert.rejects(
    new OpenLibraryService(config).findById('openlibrary:OL893415W'),
    errorCode('BOOK_PROVIDER_UNAVAILABLE'),
  );
});

test('Open Library caches successful responses and coalesces concurrent requests', async () => {
  let now = 1_000_000;
  let calls = 0;
  mock.method(Date, 'now', () => now);
  globalThis.fetch = async () => {
    calls++;
    return json(olPage);
  };
  const provider = new OpenLibraryService(config);
  await Promise.all([provider.search(search), provider.search(search)]);
  await provider.search(search);
  assert.equal(calls, 1);
  now += 5 * 60_000 + 1;
  await provider.search(search);
  assert.equal(calls, 2);
});

test('Open Library spaces distinct upstream calls at least one second apart', async () => {
  const times = [];
  globalThis.fetch = async () => {
    times.push(performance.now());
    return json(olPage);
  };
  const provider = new OpenLibraryService(config);
  await Promise.all([
    provider.search(search),
    provider.search({ ...search, offset: 30 }),
  ]);
  assert.equal(times.length, 2);
  assert.ok(
    times[1] - times[0] >= 990,
    `Calls were only ${times[1] - times[0]}ms apart`,
  );
});

test('Open Library authenticates with access and secret keys and reuses the session cookie', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (calls.length === 1) {
      assert.equal(new URL(url).pathname, '/account/login.json');
      assert.equal(options.method, 'POST');
      assert.equal(
        options.body,
        JSON.stringify({ access: 'access-test', secret: 'secret-test' }),
      );
      return new Response('{}', {
        status: 200,
        headers: {
          'set-cookie': 'session=authenticated-value; Path=/; HttpOnly',
        },
      });
    }
    assert.equal(options.headers.Cookie, 'session=authenticated-value');
    return json(olPage);
  };
  const provider = new OpenLibraryService(authenticatedConfig);
  await provider.search(search);
  await provider.search({ ...search, offset: 10 });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url.pathname, '/search.json');
  assert.equal(calls[2].options.headers.Cookie, 'session=authenticated-value');
});

test('Open Library requires access and secret together', async () => {
  const partial = new ConfigService({
    OPEN_LIBRARY_ACCESS_KEY: 'access-only',
    OPEN_LIBRARY_API_URL: 'https://openlibrary.test',
  });
  const provider = new OpenLibraryService(partial);
  await assert.rejects(
    provider.search(search),
    errorCode('BOOK_PROVIDER_CONFIG_INVALID'),
  );
});

for (const failure of ['TimeoutError', 'network', 'invalid-shape']) {
  test(`Open Library normalizes ${failure} errors`, async () => {
    globalThis.fetch = async () => {
      if (failure === 'invalid-shape') return json({ docs: [] });
      throw Object.assign(new Error('failed'), { name: failure });
    };
    await assert.rejects(
      new OpenLibraryService(config).search(search),
      errorCode(
        failure === 'TimeoutError'
          ? 'BOOK_PROVIDER_TIMEOUT'
          : 'BOOK_PROVIDER_UNAVAILABLE',
      ),
    );
  });
}

test('all search filters, both total formats and sparse Open Library records map correctly', () => {
  for (const field of [
    'all',
    'title',
    'author',
    'publisher',
    'subject',
    'isbn',
    'lccn',
    'oclc',
  ]) {
    const params = OpenLibraryMapper.toSearchParams({
      ...search,
      query: 'A & B',
      field,
    });
    assert.equal(params.get(field === 'all' ? 'q' : field), 'A & B');
    assert.equal(params.get('offset'), '20');
  }
  const page = OpenLibraryMapper.toPage(
    { num_found: 1, docs: [{ key: 'OL1W', cover_i: -1 }] },
    search,
  );
  assert.deepEqual(page.items[0], {
    id: 'openlibrary:OL1W',
    title: 'Untitled',
    authors: [],
    publishedDate: null,
    description: null,
    coverUrl: null,
  });
  assert.equal(page.pagination.total, 1);
});

test('public IDs accept legacy Google volumes and namespaced works, rejecting unsafe IDs', () => {
  for (const id of ['a_B-123', 'OL123W', 'openlibrary:OL123W']) {
    assert.equal(providerIdSchema.parse(id), id);
  }
  for (const id of [
    'openlibrary:OL123M',
    'openlibrary:abc',
    'openlibrary:../admin',
    '/works/OL1W',
    'other:OL1W',
  ]) {
    assert.equal(providerIdSchema.safeParse(id).success, false);
  }
});

test('references and availability are scoped to the provider while retaining raw database IDs', async () => {
  for (const [id, remoteId, provider] of [
    ['google-volume', 'google-volume', 'google_books'],
    ['openlibrary:OL893415W', 'OL893415W', 'open_library'],
  ]) {
    const calls = [];
    const db = {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [{ id: 'local-id' }] };
      },
    };
    const repo = new BooksRepository(db);
    await repo.findByProviderId(id);
    await repo.availability(id, 'owner');
    await repo.createReference(id, OpenLibraryMapper.toBook(olDoc), db);
    assert.deepEqual(calls[0].values, [remoteId, provider]);
    assert.deepEqual(calls[1].values, [remoteId, 'owner', provider]);
    assert.equal(calls[2].values[0], remoteId);
    assert.equal(calls[2].values[5], provider);
    assert.deepEqual(calls[3].values, [remoteId, provider]);
    assert.match(calls[3].sql, /FOR UPDATE/);
  }
});

test('all saved lists and loan detail reconstruct the public book ID', async () => {
  const queries = [];
  const db = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [] };
    },
  };
  const query = { limit: 10, offset: 0 };
  const loans = new LoansRepository(db);
  await loans.listForUser('owner', false, query);
  await loans.listReading('owner', 10, 0);
  await loans.findDetail('owner', 'loan');
  await new WishlistRepository(db).listForUser('owner', query);
  await new ReservationsRepository(db).listForUser('owner', false, query);
  assert.equal(queries.length, 5);
  for (const sql of queries) {
    assert.match(
      sql,
      /CASE WHEN b.provider = 'open_library' THEN 'openlibrary:' \|\| b.provider_id ELSE b.provider_id END/,
    );
  }
});

test('an Open Library result can be prepared for saving and served later without either API', async () => {
  const book = OpenLibraryMapper.toBook(olDoc);
  const books = {
    findByProviderId: async () => null,
    createReference: async (id, metadata) => {
      assert.equal(id, book.id);
      assert.deepEqual(metadata, book);
      return 'local-id';
    },
  };
  const provider = new FallbackBooksProvider(
    { findById: async () => assert.fail('Unexpected Google call') },
    {
      findById: async (id) => {
        assert.equal(id, book.id);
        return book;
      },
    },
  );
  const refs = new BookReferencesService(books, provider);
  assert.equal(await refs.save({}, await refs.prepare(book.id)), 'local-id');
  books.findByProviderId = async () => ({
    title: book.title,
    author: 'Frank Herbert',
    description: null,
    cover_url: book.coverUrl,
  });
  books.availability = async () => ({
    borrower_id: null,
    reservation_user_id: null,
    has_reservation: false,
  });
  const detail = await new BooksService(
    { findById: async () => assert.fail('Unexpected API call') },
    books,
  ).detail(book.id, 'owner');
  assert.equal(detail.id, book.id);
  assert.equal(detail.availability.canBorrow, true);
});
