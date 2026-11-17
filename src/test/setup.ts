import './setup-common';

// Setup des tests unitaires uniquement (configuration "jest" de package.json).
// Les tests unitaires simulent Prisma et n'ont jamais accès à une base : URL valide mais injoignable
// (TLD réservé .invalid, RFC 6761). Aucune base de test n'est enregistrée, donc TestUtils refuse tout accès.
process.env.DATABASE_URL = 'mysql://unit-tests:unused@unit-tests.invalid:3306/no_database_for_unit_tests';
