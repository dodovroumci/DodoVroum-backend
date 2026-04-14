-- Distinction : en attente de paiement vs autres statuts
ALTER TABLE `bookings` MODIFY COLUMN `status` ENUM(
    'PENDING',
    'AWAITING_PAYMENT',
    'PAID',
    'CONFIRMED',
    'ONGOING',
    'CANCELLED',
    'COMPLETED',
    'CONFIRMEE',
    'CHECKIN_CLIENT',
    'CHECKIN_PROPRIO',
    'EN_COURS_SEJOUR',
    'TERMINEE'
) NOT NULL DEFAULT 'PENDING';
