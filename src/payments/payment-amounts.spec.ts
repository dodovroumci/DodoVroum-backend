import { PaymentOption } from '@prisma/client';
import { computePaymentAmounts, DEPOSIT_PERCENTAGE, MIN_AMOUNT_XOF } from './payment-amounts';

describe('computePaymentAmounts — règle serveur des montants', () => {
  it('règle métier : acompte 30 %, minimum 200 XOF', () => {
    expect(DEPOSIT_PERCENTAGE).toBe(0.3);
    expect(MIN_AMOUNT_XOF).toBe(200);
  });

  it('acompte = 30 % du totalPrice (arrondi supérieur)', () => {
    expect(computePaymentAmounts(100000, PaymentOption.DOWN_PAYMENT).amount).toBe(30000);
    expect(computePaymentAmounts(50001, PaymentOption.DOWN_PAYMENT).amount).toBe(15001);
  });

  it('paiement complet = totalPrice', () => {
    expect(computePaymentAmounts(100000, PaymentOption.FULL_PAYMENT)).toEqual({
      amount: 100000,
      baseAmount: 100000,
      fees: 0,
    });
  });

  it('minimum 200 XOF conservé (acompte et paiement complet)', () => {
    expect(computePaymentAmounts(500, PaymentOption.DOWN_PAYMENT).amount).toBe(200);
    expect(computePaymentAmounts(150, PaymentOption.FULL_PAYMENT)).toEqual({ amount: 200, baseAmount: 150, fees: 50 });
  });
});
