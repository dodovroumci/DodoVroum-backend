import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Numérotation ivoirienne : 10 chiffres depuis la réforme de 2021, avec ou sans
 * indicatif (+225 / 00225) et avec ou sans le 0 initial. Volontairement permissif
 * sur les préfixes (01/05/07/25/27...) car l'ARTCI en ouvre régulièrement de
 * nouveaux — une whitelist stricte rejetterait de vrais numéros au fil du temps.
 */
const IVORIAN_PHONE_REGEX = /^(?:\+225|00225)?0?\d{10}$/;

export function IsIvorianPhone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isIvorianPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Le numéro de téléphone doit être un numéro ivoirien valide (ex. 0102030405 ou +2250102030405)',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          return typeof value === 'string' && IVORIAN_PHONE_REGEX.test(value.replace(/[\s-]/g, ''));
        },
      },
    });
  };
}
