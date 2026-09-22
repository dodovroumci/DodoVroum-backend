import { ValidationPipe, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { CreateResidenceDto } from './create-residence.dto';
import { UpdateResidenceDto } from './update-residence.dto';

/**
 * Reproduit la configuration du ValidationPipe global (main.ts).
 * `nombrePieces` est optionnel côté API (les clients existants n'envoient pas
 * encore le champ) mais, s'il est fourni, doit être un entier >= 1.
 */
function buildPipe() {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
}

const createMeta: ArgumentMetadata = { type: 'body', metatype: CreateResidenceDto, data: '' };
const updateMeta: ArgumentMetadata = { type: 'body', metatype: UpdateResidenceDto, data: '' };

const validPayload = {
  title: 'Villa test',
  address: '1 rue test',
  city: 'Abidjan',
  pricePerDay: 100,
  capacity: 4,
  bedrooms: 2,
  bathrooms: 1,
  images: [],
};

describe('Residence DTO — nombrePieces', () => {
  it.each([1, 2, 3])('accepte nombrePieces = %i à la création, distinct de bedrooms', async (n) => {
    const dto = await buildPipe().transform({ ...validPayload, nombrePieces: n }, createMeta);
    expect(dto.nombrePieces).toBe(n);
    expect(dto.bedrooms).toBe(2);
  });

  it('accepte une création sans nombrePieces (compatibilité des clients existants)', async () => {
    const dto = await buildPipe().transform({ ...validPayload }, createMeta);
    expect(dto.nombrePieces).toBeUndefined();
  });

  it.each([0, -1, 2.5, 'abc'])('rejette nombrePieces = %p', async (value) => {
    await expect(
      buildPipe().transform({ ...validPayload, nombrePieces: value }, createMeta),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte nombrePieces seul à la modification', async () => {
    const dto = await buildPipe().transform({ nombrePieces: 4 }, updateMeta);
    expect(dto.nombrePieces).toBe(4);
  });

  it('rejette nombrePieces = 0 à la modification', async () => {
    await expect(buildPipe().transform({ nombrePieces: 0 }, updateMeta)).rejects.toThrow(
      BadRequestException,
    );
  });
});
