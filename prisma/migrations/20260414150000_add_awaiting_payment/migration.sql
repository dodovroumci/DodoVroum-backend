-- Ordre ENUM aligné sur schema.prisma : AWAITING_PAYMENT en premier (équivalent métier inchangé)
ALTER TABLE `bookings` MODIFY `status` ENUM(
    'AWAITING_PAYMENT',
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
) NOT NULL DEFAULT 'AWAITING_PAYMENT';
