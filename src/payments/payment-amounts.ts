import { PaymentOption } from '@prisma/client';

/** Part du prix total réglée en ligne pour un acompte. */
export const DEPOSIT_PERCENTAGE = 0.3;
/** Montant minimal accepté par GeniusPay. */
export const MIN_AMOUNT_XOF = 200;

/**
 * Montant à encaisser pour une réservation, calculé uniquement côté serveur à
 * partir de son totalPrice (jamais d'un montant fourni par le client).
 * - DOWN_PAYMENT : 30 % du total (arrondi supérieur), minimum 200 XOF
 * - FULL_PAYMENT : total (arrondi supérieur), minimum 200 XOF
 */
export function computePaymentAmounts(totalPrice: number, option: PaymentOption) {
  const raw =
    option === PaymentOption.DOWN_PAYMENT
      ? Math.ceil(totalPrice * DEPOSIT_PERCENTAGE)
      : Math.ceil(totalPrice);
  const amount = Math.max(Math.round(raw), MIN_AMOUNT_XOF);
  const baseAmount = Math.ceil(totalPrice);
  const fees = Math.max(Math.round(amount - baseAmount), 0);
  return { amount, baseAmount, fees };
}
