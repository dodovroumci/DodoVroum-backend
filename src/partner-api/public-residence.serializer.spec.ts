import {
  ELIGIBLE_RESIDENCE_WHERE,
  PUBLIC_RESIDENCE_SELECT,
  PublicResidenceRow,
  toPublicAmenities,
  toPublicImages,
  toPublicRating,
  toPublicResidenceDetail,
  toPublicResidenceSummary,
  toStorageImageUrl,
} from './public-residence.serializer';

const STORAGE = 'https://dodovroum.com/storage/residences';

/** Ligne telle que la base pourrait la renvoyer si la sélection était contournée. */
const fullRow = {
  id: 'clres000000000000000000001',
  title: 'Villa Test',
  typeResidence: 'Villa',
  city: 'Assinie',
  country: "Côte d'Ivoire",
  pricePerDay: 45000,
  capacity: 6,
  bedrooms: 3,
  bathrooms: 2,
  nombrePieces: 5,
  amenities: JSON.stringify(['WiFi', 'Piscine']),
  images: JSON.stringify([`${STORAGE}/a.jpg`, 'b.png']),
  // Champs privés : ne doivent jamais traverser le sérialiseur.
  description: 'Appelez le 0700000000',
  address: '12 rue privée',
  latitude: 5.123456,
  longitude: -3.654321,
  ownerId: 'owner-1',
  owner: { phone: '+2250700000000', email: 'proprio@example.com' },
  isActive: true,
  isVerified: false,
  moderationStatus: 'ACTIVE',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  reviews: [{ comment: 'texte', userId: 'u-1' }],
  bookings: [{ id: 'bk-1' }],
  blockedDates: [{ reason: 'privé', bookingId: 'bk-1' }],
} as unknown as PublicResidenceRow;

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

describe('Sérialiseur public des résidences', () => {
  describe('règles de lecture', () => {
    it('éligibilité : active, modération ACTIVE, non supprimée, propriétaire présent, actif et non supprimé (isVerified non exigé)', () => {
      expect(ELIGIBLE_RESIDENCE_WHERE).toEqual({
        isActive: true,
        moderationStatus: 'ACTIVE',
        deletedAt: null,
        ownerId: { not: null },
        owner: { isActive: true, deletedAt: null },
      });
    });

    it('sélection Prisma : liste blanche exacte', () => {
      expect(Object.keys(PUBLIC_RESIDENCE_SELECT).sort()).toEqual(
        [
          'amenities',
          'bathrooms',
          'bedrooms',
          'capacity',
          'city',
          'country',
          'id',
          'images',
          'nombrePieces',
          'pricePerDay',
          'title',
          'typeResidence',
        ].sort(),
      );
      for (const field of [
        'address',
        'latitude',
        'longitude',
        'ownerId',
        'owner',
        'description',
        'reviews',
      ]) {
        expect(PUBLIC_RESIDENCE_SELECT).not.toHaveProperty(field);
      }
    });
  });

  describe('résumé et fiche', () => {
    it('résumé : uniquement les champs publics, même si la ligne en contient d’autres', () => {
      const summary = toPublicResidenceSummary(fullRow, {
        average: 4.5,
        count: 2,
      });
      expect(Object.keys(summary).sort()).toEqual(SUMMARY_KEYS);
      expect(summary).toEqual({
        id: fullRow.id,
        title: 'Villa Test',
        typeResidence: 'Villa',
        city: 'Assinie',
        country: "Côte d'Ivoire",
        pricePerNight: { amount: 45000, currency: 'XOF' },
        capacity: 6,
        bedrooms: 3,
        bathrooms: 2,
        nombrePieces: 5,
        coverImageUrl: `${STORAGE}/a.jpg`,
        rating: { average: 4.5, count: 2 },
        url: `https://dodovroum.com/r/${fullRow.id}`,
      });
    });

    it('fiche : résumé + équipements + images, sans description', () => {
      const detail = toPublicResidenceDetail(fullRow);
      expect(Object.keys(detail).sort()).toEqual(
        [...SUMMARY_KEYS, 'amenities', 'images'].sort(),
      );
      expect(detail.amenities).toEqual(['WiFi', 'Piscine']);
      expect(detail.images).toEqual([`${STORAGE}/a.jpg`, `${STORAGE}/b.png`]);
      expect(detail.rating).toEqual({ average: null, count: 0 });
      expect(JSON.stringify(detail)).not.toMatch(
        /0700000000|12 rue|owner|5\.123456|privé|bk-1/,
      );
    });

    it('valeurs facultatives absentes → null, jamais undefined', () => {
      const detail = toPublicResidenceDetail({
        ...fullRow,
        typeResidence: '  ',
        nombrePieces: null,
        images: '[]',
      });
      expect(detail.typeResidence).toBeNull();
      expect(detail.nombrePieces).toBeNull();
      expect(detail.coverImageUrl).toBeNull();
      expect(detail.images).toEqual([]);
    });

    it('identifiant encodé dans l’URL canonique', () => {
      expect(toPublicResidenceSummary({ ...fullRow, id: 'a-b_c' }).url).toBe(
        'https://dodovroum.com/r/a-b_c',
      );
    });
  });

  describe('images', () => {
    it.each([
      [`${STORAGE}/photo.jpg`, `${STORAGE}/photo.jpg`],
      ['photo.webp', `${STORAGE}/photo.webp`],
      ['storage/residences/photo.PNG', `${STORAGE}/photo.PNG`],
    ])('accepte %s', (entry, expected) => {
      expect(toStorageImageUrl(entry)).toBe(expected);
    });

    it.each([
      [
        'http (non chiffré)',
        'http://dodovroum.com/storage/residences/photo.jpg',
      ],
      ['autre hôte', 'https://evil.example/storage/residences/photo.jpg'],
      [
        'sous-domaine',
        'https://www.dodovroum.com/storage/residences/photo.jpg',
      ],
      [
        'hôte usurpé',
        'https://dodovroum.com.evil.example/storage/residences/photo.jpg',
      ],
      [
        'identifiants',
        'https://user:pass@dodovroum.com/storage/residences/photo.jpg',
      ],
      ['port', 'https://dodovroum.com:8443/storage/residences/photo.jpg'],
      ['requête', 'https://dodovroum.com/storage/residences/photo.jpg?x=1'],
      ['autre dossier', 'https://dodovroum.com/uploads/photo.jpg'],
      ['sous-dossier', 'https://dodovroum.com/storage/residences/a/photo.jpg'],
      ['schéma relatif', '//evil.example/photo.jpg'],
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:image/png;base64,AAAA'],
      ['pas une image', 'document.pdf'],
      ['image de remplacement', 'default-residence.png'],
      ['remplacement en URL', `${STORAGE}/default-residence.png`],
      ['vide', '   '],
      ['non texte', 42],
    ])('refuse : %s', (_label, entry) => {
      expect(toStorageImageUrl(entry)).toBeNull();
    });

    it('colonne illisible, vide ou absente → []', () => {
      expect(toPublicImages('[invalide')).toEqual([]);
      expect(toPublicImages('')).toEqual([]);
      expect(toPublicImages(null)).toEqual([]);
      expect(toPublicImages('{"a":1}')).toEqual([]);
    });

    it('chaîne seule (format historique), doublons retirés, 20 au maximum', () => {
      expect(toPublicImages('seule.jpg')).toEqual([`${STORAGE}/seule.jpg`]);
      expect(
        toPublicImages(JSON.stringify(['a.jpg', `${STORAGE}/a.jpg`])),
      ).toEqual([`${STORAGE}/a.jpg`]);
      const many = Array.from({ length: 30 }, (_, i) => `p${i}.jpg`);
      expect(toPublicImages(JSON.stringify(many))).toHaveLength(20);
    });
  });

  describe('équipements', () => {
    it('tableau JSON nettoyé : espaces, doublons, valeurs non textuelles ou trop longues', () => {
      expect(
        toPublicAmenities(
          JSON.stringify(['  WiFi ', 'wifi', 'Piscine', 3, '', 'x'.repeat(61)]),
        ),
      ).toEqual(['WiFi', 'Piscine']);
    });

    it('colonne illisible → []', () => {
      expect(toPublicAmenities('[cassé')).toEqual([]);
      expect(toPublicAmenities(undefined)).toEqual([]);
    });
  });

  describe('note', () => {
    it('moyenne arrondie au dixième, aucune note → null', () => {
      expect(toPublicRating(4.333, 3)).toEqual({ average: 4.3, count: 3 });
      expect(toPublicRating(null, 0)).toEqual({ average: null, count: 0 });
      expect(toPublicRating(4, 0)).toEqual({ average: null, count: 0 });
    });
  });
});
