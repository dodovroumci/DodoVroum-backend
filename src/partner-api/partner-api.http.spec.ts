import {
  Global,
  INestApplication,
  Logger,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { hashPartnerApiKey } from './partner-api-key.guard';
import { PartnerApiModule } from './partner-api.module';

/**
 * Sécurité des API publique et partenaire à travers HTTP (pipeline Nest complet :
 * préfixe, CORS, gardes, validation, filtres, quotas), sur une base simulée en
 * mémoire. Aucune connexion à MySQL. Configuration d'application reprise de main.ts.
 */

const newKey = () => `dvp_${randomBytes(32).toString('base64url')}`;
const KEY = newKey();
const OTHER_PARTNER_KEY = newKey();

// ─── Base simulée ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const PRIVATE_MARKERS = [
  '0700000001',
  'proprio@',
  '7 rue Secrète',
  '5.987654',
  'Note privée',
  'Commentaire nominatif',
];

const residence = (id: string, overrides: Row = {}): Row => ({
  id,
  title: `Résidence ${id}`,
  description: 'Contact direct : 0700000001, proprio@example.com',
  address: '7 rue Secrète',
  city: 'Assinie',
  country: "Côte d'Ivoire",
  pricePerDay: 45000,
  capacity: 6,
  bedrooms: 3,
  nombrePieces: 5,
  bathrooms: 2,
  amenities: JSON.stringify(['WiFi', 'Piscine']),
  images: JSON.stringify([
    'https://dodovroum.com/storage/residences/villa.jpg',
    'https://tracker.example/p.gif',
  ]),
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  deletedAt: null,
  isVerified: false,
  latitude: 5.987654,
  longitude: -3.1,
  ownerId: 'owner-1',
  typeResidence: 'Villa',
  moderationStatus: 'ACTIVE',
  ...overrides,
});

const RESIDENCES: Row[] = [
  residence('res-ok'),
  residence('res-booked'),
  residence('res-blocked'),
  residence('res-inactive', { isActive: false }),
  residence('res-hidden', { moderationStatus: 'HIDDEN' }),
  residence('res-suspended', { moderationStatus: 'SUSPENDED' }),
  residence('res-deleted', { deletedAt: new Date('2026-02-01') }),
  residence('res-no-owner', { ownerId: null }),
];

/** Sous-ensemble du moteur de requêtes Prisma utilisé par l'API (égalité, not, select). */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'AND')
      return (condition as Row[]).every((part) => matches(row, part));
    if (
      [
        'OR',
        'bookings',
        'offers',
        'blockedDates',
        'city',
        'title',
        'typeResidence',
      ].includes(field)
    )
      return true;
    if (
      condition &&
      typeof condition === 'object' &&
      'not' in (condition as Row)
    ) {
      return row[field] !== (condition as Row).not;
    }
    if (condition && typeof condition === 'object') return true; // bornes (gte/lte) : non simulées
    return row[field] === condition;
  });
}

function project(row: Row, select?: Row): Row {
  if (!select) return { ...row }; // sans select, la ligne complète fuirait : le test le détecterait
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, row[key]]),
  );
}

const fakePrisma = {
  failNext: false,
  residence: {
    findFirst: jest.fn(
      async ({ where, select }: { where: Row; select?: Row }) => {
        if (fakePrisma.failNext) {
          fakePrisma.failNext = false;
          throw Object.assign(
            new Error('Connexion MySQL perdue : SELECT * FROM residences'),
            { code: 'P1001' },
          );
        }
        const row = RESIDENCES.find((candidate) => matches(candidate, where));
        return row ? project(row, select) : null;
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        select,
        skip,
        take,
      }: {
        where: Row;
        select?: Row;
        skip: number;
        take: number;
      }) =>
        RESIDENCES.filter((row) => matches(row, where))
          .slice(skip, skip + take)
          .map((row) => project(row, select)),
    ),
    count: jest.fn(
      async ({ where }: { where: Row }) =>
        RESIDENCES.filter((row) => matches(row, where)).length,
    ),
  },
  booking: {
    findFirst: jest.fn(
      async ({ where }: { where: { OR: Array<{ residenceId?: string }> } }) =>
        where.OR[0].residenceId === 'res-booked'
          ? { id: 'booking-secret', userId: 'client-1' }
          : null,
    ),
  },
  blockedDate: {
    findFirst: jest.fn(async ({ where }: { where: Row }) =>
      where.residenceId === 'res-blocked'
        ? {
            id: 'block-secret',
            reason: 'Note privée',
            bookingId: 'booking-secret',
          }
        : null,
    ),
  },
  review: {
    groupBy: jest.fn(async () => [
      {
        residenceId: 'res-ok',
        _avg: { rating: 4.5 },
        _count: { _all: 2 },
        comment: 'Commentaire nominatif',
      },
    ]),
  },
};

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: fakePrisma }],
  exports: [PrismaService],
})
class FakePrismaModule {}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            PARTNER_API_KEYS: `gptdebabi:${hashPartnerApiKey(KEY)},autre:${hashPartnerApiKey(OTHER_PARTNER_KEY)}`,
          }),
        ],
      }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
      FakePrismaModule,
      PartnerApiModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  // Même configuration que main.ts
  app.enableCors({
    origin: [
      'https://dodovroum.com',
      'https://www.dodovroum.com',
      'http://localhost:5173',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}

// ─── Assertions communes ───────────────────────────────────────────────────

const SUMMARY_KEYS = [
  'bathrooms',
  'bedrooms',
  'capacity',
  'city',
  'country',
  'coverImageUrl',
  'id',
  'nombrePieces',
  'pricePerNight',
  'rating',
  'title',
  'typeResidence',
  'url',
];
const DETAIL_KEYS = [...SUMMARY_KEYS, 'amenities', 'images'].sort();
const FORBIDDEN_KEYS = [
  'address',
  'latitude',
  'longitude',
  'ownerId',
  'owner',
  'description',
  'isActive',
  'isVerified',
  'moderationStatus',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'reviews',
  'bookings',
  'blockedDates',
  'reason',
  'bookingId',
  'userId',
  'comment',
];

/** Parcourt toute la réponse : aucune clé interdite, aucune valeur privée. */
function expectNoPrivateData(body: unknown): void {
  const text = JSON.stringify(body);
  for (const marker of [
    ...PRIVATE_MARKERS,
    'tracker.example',
    'booking-secret',
    'block-secret',
    'client-1',
  ]) {
    expect(text).not.toContain(marker);
  }
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        expect(FORBIDDEN_KEYS).not.toContain(key);
        visit(child);
      }
    }
  };
  visit(body);
}

function expectError(body: Record<string, any>, code: string): void {
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).sort()).toEqual([
    'code',
    'message',
    'requestId',
  ]);
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(body)).not.toMatch(
    /stack|prisma|SELECT|P1001|\/api\//i,
  );
}

const NOT_ELIGIBLE = [
  'res-inactive',
  'res-hidden',
  'res-suspended',
  'res-deleted',
  'res-no-owner',
  'res-unknown',
];

describe('API publique et partenaire des résidences (HTTP)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const partner = (path: string, key = KEY) =>
    http().get(`/api/partner/v1${path}`).set('X-API-Key', key);

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /api/public/v1/residences/:id (page web, sans clé)', () => {
    it('200 : fiche publique exacte, en-têtes de cache et d’identifiant de requête', async () => {
      const response = await http()
        .get('/api/public/v1/residences/res-ok')
        .expect(200);

      expect(Object.keys(response.body)).toEqual(['data']);
      expect(Object.keys(response.body.data).sort()).toEqual(DETAIL_KEYS);
      expect(response.body.data).toMatchObject({
        id: 'res-ok',
        pricePerNight: { amount: 45000, currency: 'XOF' },
        images: ['https://dodovroum.com/storage/residences/villa.jpg'],
        coverImageUrl: 'https://dodovroum.com/storage/residences/villa.jpg',
        amenities: ['WiFi', 'Piscine'],
        rating: { average: 4.5, count: 2 },
        url: 'https://dodovroum.com/r/res-ok',
      });
      expectNoPrivateData(response.body);
      expect(response.headers['cache-control']).toBe('public, max-age=60');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('CORS : la page https://dodovroum.com peut lire la réponse', async () => {
      const response = await http()
        .get('/api/public/v1/residences/res-ok')
        .set('Origin', 'https://dodovroum.com')
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(
        'https://dodovroum.com',
      );
    });

    it.each(NOT_ELIGIBLE)(
      '%s : 404 identique à une résidence inexistante',
      async (id) => {
        const response = await http()
          .get(`/api/public/v1/residences/${id}`)
          .expect(404);
        expectError(response.body, 'RESIDENCE_NOT_FOUND');
        expect(response.body.error.message).toBe('Résidence introuvable.');
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('identifiant mal formé : 404 sans lecture en base', async () => {
      fakePrisma.residence.findFirst.mockClear();
      await http()
        .get(`/api/public/v1/residences/${encodeURIComponent("x' OR '1'='1")}`)
        .expect(404);
      expect(fakePrisma.residence.findFirst).not.toHaveBeenCalled();
    });

    it('aucune liste publique (anti-aspiration)', async () => {
      await http().get('/api/public/v1/residences').expect(404);
    });

    it('aucun paramètre ne peut élargir la réponse (la route n’en lit aucun)', async () => {
      const plain = await http()
        .get('/api/public/v1/residences/res-ok')
        .expect(200);
      const tampered = await http()
        .get(
          '/api/public/v1/residences/res-ok?include=owner&select[address]=true&isActive=false',
        )
        .expect(200);
      expect(tampered.body).toEqual(plain.body);
      expectNoPrivateData(tampered.body);
    });

    it('erreur interne : 500 sans détail technique', async () => {
      fakePrisma.failNext = true;
      const response = await http()
        .get('/api/public/v1/residences/res-ok')
        .expect(500);
      expectError(response.body, 'INTERNAL_ERROR');
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('Authentification partenaire (X-API-Key)', () => {
    it.each([
      ['sans clé', (path: string) => http().get(`/api/partner/v1${path}`)],
      ['clé inconnue', (path: string) => partner(path, newKey())],
      ['clé mal formée', (path: string) => partner(path, 'gptdebabi')],
      [
        'clé en Bearer',
        (path: string) =>
          http()
            .get(`/api/partner/v1${path}`)
            .set('Authorization', `Bearer ${KEY}`),
      ],
    ])(
      '%s : 401 INVALID_API_KEY sur les trois routes',
      async (_label, send) => {
        for (const path of [
          '/residences',
          '/residences/res-ok',
          '/residences/res-ok/availability?checkIn=2099-01-01&checkOut=2099-01-02',
        ]) {
          const response = await send(path).expect(401);
          expectError(response.body, 'INVALID_API_KEY');
        }
      },
    );

    it('la clé partenaire n’est pas nécessaire (ni utilisée) par la route publique', async () => {
      await http().get('/api/public/v1/residences/res-ok').expect(200);
    });
  });

  describe('GET /api/partner/v1/residences', () => {
    it('200 : résidences éligibles seulement, résumés exacts, pagination', async () => {
      const response = await partner('/residences').expect(200);

      expect(Object.keys(response.body).sort()).toEqual(['data', 'pagination']);
      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual(
        ['res-ok', 'res-booked', 'res-blocked'],
      );
      for (const item of response.body.data)
        expect(Object.keys(item).sort()).toEqual(SUMMARY_KEYS);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
      expectNoPrivateData(response.body);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each([
      ['limit > 50', 'limit=51'],
      ['limit = 0', 'limit=0'],
      ['page = 0', 'page=0'],
      ['page > 1000', 'page=1001'],
      ['tri libre', 'sort=password'],
      ['sortBy (ancienne API)', 'sortBy=createdAt'],
      ['isActive (contournement)', 'isActive=false'],
      ['proprietaireId (contournement)', 'proprietaireId=owner-1'],
      ['owner_id (contournement)', 'owner_id=owner-1'],
      ['status (contournement)', 'status=HIDDEN'],
      ['prix négatif', 'minPrice=-1'],
      ['voyageurs non numériques', 'guests=abc'],
      ['ville trop courte', 'city=A'],
      ['date mal formée', 'checkIn=20-12-2026&checkOut=2026-12-23'],
      ['paramètre répété', 'city=Assinie&city=Abidjan'],
    ])('%s : 400 INVALID_PARAMETER', async (_label, query) => {
      const response = await partner(`/residences?${query}`).expect(400);
      expectError(response.body, 'INVALID_PARAMETER');
    });

    it('séjour dans le passé : 400 INVALID_DATE_RANGE', async () => {
      const response = await partner(
        '/residences?checkIn=2020-01-01&checkOut=2020-01-03',
      ).expect(400);
      expectError(response.body, 'INVALID_DATE_RANGE');
    });
  });

  describe('GET /api/partner/v1/residences/:id', () => {
    it('200 : même fiche que la route publique', async () => {
      const [partnerResponse, publicResponse] = await Promise.all([
        partner('/residences/res-ok').expect(200),
        http().get('/api/public/v1/residences/res-ok').expect(200),
      ]);
      expect(partnerResponse.body).toEqual(publicResponse.body);
      expectNoPrivateData(partnerResponse.body);
    });

    it.each(NOT_ELIGIBLE)('%s : 404 RESIDENCE_NOT_FOUND', async (id) => {
      const response = await partner(`/residences/${id}`).expect(404);
      expectError(response.body, 'RESIDENCE_NOT_FOUND');
    });
  });

  describe('GET /api/partner/v1/residences/:id/availability', () => {
    const stay = 'checkIn=2099-01-10&checkOut=2099-01-13';
    const AVAILABILITY_KEYS = [
      'available',
      'checkIn',
      'checkOut',
      'estimatedTotal',
      'nights',
      'pricePerNight',
      'residenceId',
      'url',
    ];

    it('libre : disponible, prix estimé', async () => {
      const response = await partner(
        `/residences/res-ok/availability?${stay}`,
      ).expect(200);
      expect(response.body).toEqual({
        data: {
          residenceId: 'res-ok',
          checkIn: '2099-01-10',
          checkOut: '2099-01-13',
          available: true,
          nights: 3,
          pricePerNight: { amount: 45000, currency: 'XOF' },
          estimatedTotal: { amount: 135000, currency: 'XOF' },
          url: 'https://dodovroum.com/r/res-ok',
        },
      });
    });

    it.each(['res-booked', 'res-blocked'])(
      '%s : indisponible, sans motif ni donnée de réservation',
      async (id) => {
        const response = await partner(
          `/residences/${id}/availability?${stay}`,
        ).expect(200);
        expect(Object.keys(response.body.data).sort()).toEqual(
          AVAILABILITY_KEYS,
        );
        expect(response.body.data.available).toBe(false);
        expectNoPrivateData(response.body);
      },
    );

    it.each(NOT_ELIGIBLE)('%s : 404 RESIDENCE_NOT_FOUND', async (id) => {
      const response = await partner(
        `/residences/${id}/availability?${stay}`,
      ).expect(404);
      expectError(response.body, 'RESIDENCE_NOT_FOUND');
    });

    it.each([
      ['dates absentes', '', 'INVALID_PARAMETER'],
      ['checkOut absent', 'checkIn=2099-01-10', 'INVALID_PARAMETER'],
      [
        'date impossible',
        'checkIn=2099-02-30&checkOut=2099-03-02',
        'INVALID_DATE_RANGE',
      ],
      [
        'départ avant arrivée',
        'checkIn=2099-01-13&checkOut=2099-01-10',
        'INVALID_DATE_RANGE',
      ],
      [
        'plus de 30 nuits',
        'checkIn=2099-01-01&checkOut=2099-02-01',
        'INVALID_DATE_RANGE',
      ],
    ])('%s : 400 %s', async (_label, query, code) => {
      const response = await partner(
        `/residences/res-ok/availability?${query}`,
      ).expect(400);
      expectError(response.body, code);
    });
  });

  describe('Lecture seule', () => {
    it.each(['post', 'put', 'patch', 'delete'] as const)(
      '%s : aucune route d’écriture',
      async (method) => {
        for (const path of [
          '/api/public/v1/residences/res-ok',
          '/api/partner/v1/residences',
          '/api/partner/v1/residences/res-ok',
        ]) {
          const response = await http()
            [method](path)
            .set('X-API-Key', KEY)
            .send({ title: 'pirate' });
          expect(response.status).toBe(404);
        }
      },
    );
  });

  describe('Journalisation', () => {
    it('ni la clé, ni la recherche libre, ni l’adresse IP dans les journaux', async () => {
      const spies = (['log', 'warn', 'error'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level),
      );
      try {
        await partner('/residences?q=Kouassi%20Jean&city=Assinie').expect(200);
        await http()
          .get('/api/partner/v1/residences')
          .set('X-API-Key', newKey())
          .expect(401);
        await new Promise((resolve) => setImmediate(resolve)); // journal écrit sur 'finish'

        const lines = spies.flatMap((spy) =>
          spy.mock.calls.map((call) => call.join(' ')),
        );
        expect(
          lines.some(
            (line) =>
              line.includes('partner=gptdebabi') && line.includes('status=200'),
          ),
        ).toBe(true);
        for (const line of lines) {
          expect(line).not.toContain(KEY);
          expect(line).not.toContain('dvp_');
          expect(line).not.toMatch(/Kouassi|Assinie|127\.0\.0\.1|::ffff/);
        }
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });
});

describe('Quotas (HTTP)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app?.close();
  });

  const exhaust = async (send: () => request.Test, limit: number) => {
    for (let i = 0; i < limit; i++)
      await send().expect((response) => expect(response.status).not.toBe(429));
    return send().expect(429);
  };

  it('route publique : 60 requêtes par minute et par IP, puis 429 RATE_LIMITED avec Retry-After', async () => {
    const response = await exhaust(
      () => http().get('/api/public/v1/residences/res-ok'),
      60,
    );
    expectError(response.body, 'RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('disponibilité : 20 requêtes par minute et par partenaire, sans pénaliser les autres partenaires', async () => {
    const path =
      '/api/partner/v1/residences/res-ok/availability?checkIn=2099-01-10&checkOut=2099-01-13';
    const response = await exhaust(
      () => http().get(path).set('X-API-Key', KEY),
      20,
    );
    expectError(response.body, 'RATE_LIMITED');

    await http().get(path).set('X-API-Key', OTHER_PARTNER_KEY).expect(200);
  });

  it('requêtes sans clé valide : refusées avant le quota du partenaire', async () => {
    for (let i = 0; i < 25; i++) {
      await http()
        .get('/api/partner/v1/residences')
        .set('X-API-Key', newKey())
        .expect(401);
    }
    const response = await http()
      .get('/api/partner/v1/residences')
      .set('X-API-Key', KEY)
      .expect(200);
    expect(response.headers['x-ratelimit-remaining']).toBe('59');
  });
});
