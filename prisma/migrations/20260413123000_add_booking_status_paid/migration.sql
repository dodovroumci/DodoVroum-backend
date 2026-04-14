-- Statut intermédiaire après paiement en ligne (GeniusPay)
ALTER TABLE `bookings` MODIFY COLUMN `status` ENUM(
    'PENDING',
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
