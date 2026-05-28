/**
 * Centralized Prisma select objects.
 * Use these everywhere a related User, Residence, or Vehicle is embedded in a response.
 * Never use `owner: true` or `user: true` bare includes in production queries.
 */

/** Owner shown on public listing / detail pages (residence, vehicle). */
export const safeOwnerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  phone: true,
} as const;

/** Review author on public endpoints. */
export const safePublicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

/** User embedded in booking responses (authenticated). */
export const safeBookingUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatar: true,
} as const;

/**
 * User embedded in admin responses (KYC review, payment admin, etc.).
 * Excludes all security-critical fields: password, refreshTokenHash,
 * resetPasswordToken, resetPasswordExpires.
 */
export const safeAdminUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  isVerified: true,
  avatar: true,
  createdAt: true,
  updatedAt: true,
  identityType: true,
  identityNumber: true,
  identityPhotoFront: true,
  identityPhotoBack: true,
  identityPhotoExtra: true,
} as const;

/** Residence embedded in bookings, favorites, offers. */
export const safeResidenceSelect = {
  id: true,
  title: true,
  address: true,
  city: true,
  country: true,
  pricePerDay: true,
  images: true,
  typeResidence: true,
  isVerified: true,
  isActive: true,
  latitude: true,
  longitude: true,
  ownerId: true,
  owner: { select: safeOwnerSelect },
} as const;

/** Vehicle embedded in bookings, favorites, offers. */
export const safeVehicleSelect = {
  id: true,
  brand: true,
  model: true,
  title: true,
  type: true,
  pricePerDay: true,
  images: true,
  year: true,
  color: true,
  transmission: true,
  fuelType: true,
  capacity: true,
  isVerified: true,
  isActive: true,
  ownerId: true,
  owner: { select: safeOwnerSelect },
} as const;

/** Offer embedded in favorites. */
export const safeOfferSelect = {
  id: true,
  title: true,
  description: true,
  price: true,
  isActive: true,
} as const;
