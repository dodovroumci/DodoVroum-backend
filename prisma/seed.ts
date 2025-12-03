import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Début du seeding...');

  // ============================================
  // CRÉATION DES UTILISATEURS
  // ============================================
  console.log('👤 Création des utilisateurs...');

  // Créer un utilisateur admin
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dodovroum.com' },
    update: {},
    create: {
      email: 'admin@dodovroum.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'DodoVroum',
      role: 'ADMIN',
    },
  });

  // Créer plusieurs utilisateurs clients
  const clientPassword = await bcrypt.hash('client123', 10);
  const clients = await Promise.all([
    prisma.user.upsert({
      where: { email: 'client@dodovroum.com' },
      update: {},
      create: {
        email: 'client@dodovroum.com',
        password: clientPassword,
        firstName: 'Jean',
        lastName: 'Dupont',
        phone: '+33123456789',
        role: 'CLIENT',
      },
    }),
    prisma.user.upsert({
      where: { email: 'marie.martin@example.com' },
      update: {},
      create: {
        email: 'marie.martin@example.com',
        password: clientPassword,
        firstName: 'Marie',
        lastName: 'Martin',
        phone: '+33123456790',
        role: 'CLIENT',
      },
    }),
    prisma.user.upsert({
      where: { email: 'pierre.durand@example.com' },
      update: {},
      create: {
        email: 'pierre.durand@example.com',
        password: clientPassword,
        firstName: 'Pierre',
        lastName: 'Durand',
        phone: '+33123456791',
        role: 'CLIENT',
      },
    }),
    prisma.user.upsert({
      where: { email: 'sophie.bernard@example.com' },
      update: {},
      create: {
        email: 'sophie.bernard@example.com',
        password: clientPassword,
        firstName: 'Sophie',
        lastName: 'Bernard',
        phone: '+33123456792',
        role: 'CLIENT',
      },
    }),
    prisma.user.upsert({
      where: { email: 'lucas.petit@example.com' },
      update: {},
      create: {
        email: 'lucas.petit@example.com',
        password: clientPassword,
        firstName: 'Lucas',
        lastName: 'Petit',
        phone: '+33123456793',
        role: 'CLIENT',
      },
    }),
  ]);

  // Créer des utilisateurs propriétaires
  const proprietairePassword = await bcrypt.hash('proprietaire123', 10);
  const proprietaires = await Promise.all([
    prisma.user.upsert({
      where: { email: 'proprietaire@dodovroum.com' },
      update: {},
      create: {
        email: 'proprietaire@dodovroum.com',
        password: proprietairePassword,
        firstName: 'Marie',
        lastName: 'Dubois',
        phone: '+33123456794',
        role: UserRole.PROPRIETAIRE,
      },
    }),
    prisma.user.upsert({
      where: { email: 'jean.martin@proprietaire.com' },
      update: {},
      create: {
        email: 'jean.martin@proprietaire.com',
        password: proprietairePassword,
        firstName: 'Jean',
        lastName: 'Martin',
        phone: '+33123456795',
        role: UserRole.PROPRIETAIRE,
      },
    }),
    prisma.user.upsert({
      where: { email: 'sophie.bernard@proprietaire.com' },
      update: {},
      create: {
        email: 'sophie.bernard@proprietaire.com',
        password: proprietairePassword,
        firstName: 'Sophie',
        lastName: 'Bernard',
        phone: '+33123456796',
        role: UserRole.PROPRIETAIRE,
      },
    }),
  ]);

  const client = clients[0];

  // ============================================
  // CRÉATION DES RÉSIDENCES
  // ============================================
  console.log('🏠 Création des résidences...');

  const residences = await Promise.all([
    prisma.residence.create({
      data: {
        title: 'Villa Moderne Cocody',
        description: 'Magnifique villa moderne avec vue sur mer, piscine privée et jardin paysager. Parfaite pour des vacances en famille.',
        address: 'Cocody, Riviera 2, Abidjan, Côte d\'Ivoire',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 55000.00,
        ownerId: proprietaires[0].id, // Assigner au premier propriétaire
        capacity: 6,
        bedrooms: 3,
        bathrooms: 2,
        typeResidence: 'Villa moderne',
        isVerified: true,
        latitude: 5.3600,
        longitude: -4.0083,
        amenities: ['Wi-Fi', 'Climatisation', 'Piscine', 'Jacuzzi', 'Netflix', 'Parking', 'Cuisine', 'Balcon'],
        images: [
          'https://cdn.dodovroum.com/residences/resi1.jpg',
          'https://cdn.dodovroum.com/residences/resi2.jpg',
          'https://cdn.dodovroum.com/residences/resi3.jpg',
          'https://cdn.dodovroum.com/residences/resi4.jpg',
          'https://cdn.dodovroum.com/residences/resi5.jpg',
        ],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Appartement moderne Plateau',
        description: 'Appartement moderne et confortable en plein cœur du Plateau, proche de tous les commerces.',
        address: '45 Boulevard de la République, Plateau, Abidjan',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 35000.00,
        ownerId: proprietaires[0].id, // Assigner au premier propriétaire
        capacity: 4,
        bedrooms: 2,
        bathrooms: 1,
        typeResidence: 'Appartement',
        isVerified: true,
        latitude: 5.3200,
        longitude: -4.0283,
        amenities: ['Wi-Fi', 'Climatisation', 'Ascenseur', 'Balcon', 'Netflix', 'Parking'],
        images: [
          'https://cdn.dodovroum.com/residences/apt1-1.jpg',
          'https://cdn.dodovroum.com/residences/apt1-2.jpg',
        ],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Studio cosy Yopougon',
        description: 'Studio moderne et bien équipé dans un quartier animé, parfait pour un séjour en solo ou en couple.',
        address: 'Yopougon, Abidjan, Côte d\'Ivoire',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 25000.00,
        ownerId: proprietaires[1].id, // Assigner au deuxième propriétaire
        capacity: 2,
        bedrooms: 1,
        bathrooms: 1,
        typeResidence: 'Studio',
        isVerified: false,
        latitude: 5.3400,
        longitude: -4.0183,
        amenities: ['Wi-Fi', 'Climatisation', 'Netflix', 'Cuisine'],
        images: ['https://cdn.dodovroum.com/residences/studio-1.jpg', 'https://cdn.dodovroum.com/residences/studio-2.jpg'],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Maison traditionnelle Grand-Bassam',
        description: 'Authentique maison coloniale avec charme d\'époque, proche de la plage. Idéale pour découvrir l\'histoire ivoirienne.',
        address: 'Grand-Bassam, Côte d\'Ivoire',
        city: 'Grand-Bassam',
        country: 'Côte d\'Ivoire',
        pricePerDay: 40000.00,
        ownerId: proprietaires[1].id, // Assigner au deuxième propriétaire
        capacity: 5,
        bedrooms: 2,
        bathrooms: 2,
        typeResidence: 'Maison traditionnelle',
        isVerified: true,
        latitude: 5.2000,
        longitude: -3.7333,
        amenities: ['Wi-Fi', 'Ventilateur', 'Jardin', 'Parking', 'Cuisine', 'Terrasse'],
        images: [
          'https://cdn.dodovroum.com/residences/bassam1.jpg',
          'https://cdn.dodovroum.com/residences/bassam2.jpg',
          'https://cdn.dodovroum.com/residences/bassam3.jpg',
        ],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Penthouse de luxe Marcory',
        description: 'Penthouse exceptionnel avec vue panoramique sur la lagune. Équipements haut de gamme et service premium.',
        address: 'Marcory, Abidjan, Côte d\'Ivoire',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 75000.00,
        ownerId: proprietaires[2].id, // Assigner au troisième propriétaire
        capacity: 8,
        bedrooms: 4,
        bathrooms: 3,
        typeResidence: 'Penthouse',
        isVerified: true,
        latitude: 5.2800,
        longitude: -4.0100,
        amenities: ['Wi-Fi', 'Climatisation', 'Piscine', 'Spa', 'Netflix', 'Parking privé', 'Cuisine équipée', 'Terrasse', 'Vue panoramique'],
        images: [
          'https://cdn.dodovroum.com/residences/penthouse1.jpg',
          'https://cdn.dodovroum.com/residences/penthouse2.jpg',
          'https://cdn.dodovroum.com/residences/penthouse3.jpg',
          'https://cdn.dodovroum.com/residences/penthouse4.jpg',
        ],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Chalet montagneux Man',
        description: 'Chalet confortable dans les montagnes, entouré de nature. Parfait pour se ressourcer loin de la ville.',
        address: 'Man, Côte d\'Ivoire',
        city: 'Man',
        country: 'Côte d\'Ivoire',
        pricePerDay: 30000.00,
        ownerId: proprietaires[2].id, // Assigner au troisième propriétaire
        capacity: 4,
        bedrooms: 2,
        bathrooms: 1,
        typeResidence: 'Chalet',
        isVerified: true,
        latitude: 7.4120,
        longitude: -7.5530,
        amenities: ['Wi-Fi', 'Chauffage', 'Cheminée', 'Jardin', 'Parking', 'Cuisine', 'Vue montagne'],
        images: [
          'https://cdn.dodovroum.com/residences/chalet1.jpg',
          'https://cdn.dodovroum.com/residences/chalet2.jpg',
        ],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Appartement T2 Adjamé',
        description: 'Appartement fonctionnel et bien situé, proche des transports en commun. Excellent rapport qualité-prix.',
        address: 'Adjamé, Abidjan, Côte d\'Ivoire',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 20000.00,
        ownerId: proprietaires[0].id, // Assigner au premier propriétaire
        capacity: 3,
        bedrooms: 1,
        bathrooms: 1,
        typeResidence: 'Appartement',
        isVerified: false,
        latitude: 5.3500,
        longitude: -4.0200,
        amenities: ['Wi-Fi', 'Ventilateur', 'Parking', 'Cuisine'],
        images: ['https://cdn.dodovroum.com/residences/adjame1.jpg'],
      } as any,
    }),
    prisma.residence.create({
      data: {
        title: 'Villa avec jardin Treichville',
        description: 'Spacieuse villa avec grand jardin, idéale pour les familles. Quartier calme et résidentiel.',
        address: 'Treichville, Abidjan, Côte d\'Ivoire',
        city: 'Abidjan',
        country: 'Côte d\'Ivoire',
        pricePerDay: 45000.00,
        ownerId: proprietaires[1].id, // Assigner au deuxième propriétaire
        capacity: 7,
        bedrooms: 3,
        bathrooms: 2,
        typeResidence: 'Villa',
        isVerified: true,
        latitude: 5.3000,
        longitude: -4.0300,
        amenities: ['Wi-Fi', 'Climatisation', 'Jardin', 'Parking', 'Cuisine', 'Terrasse', 'Aire de jeux'],
        images: [
          'https://cdn.dodovroum.com/residences/treich1.jpg',
          'https://cdn.dodovroum.com/residences/treich2.jpg',
          'https://cdn.dodovroum.com/residences/treich3.jpg',
        ],
      } as any,
    }),
  ]);

  const residence1 = residences[0];
  const residence2 = residences[1];
  const residence3 = residences[2];

  // ============================================
  // CRÉATION DES VÉHICULES
  // ============================================
  console.log('🚗 Création des véhicules...');

  const vehicles = await Promise.all([
    // Voitures
    prisma.vehicle.create({
      data: {
        brand: 'Toyota',
        model: 'RAV4',
        year: 2022,
        type: 'CAR',
        pricePerDay: 30000.00,
        ownerId: proprietaires[0].id, // Assigner au premier propriétaire
        capacity: 5,
        fuelType: 'Essence',
        transmission: 'Automatique',
        title: 'SUV Toyota RAV4 2022 - Confort et Espace',
        address: 'Cocody, Abidjan',
        mileage: 45000,
        color: 'Blanc',
        condition: 'Excellent état',
        plateNumber: 'CI-123-AB',
        isVerified: true,
        features: ['Climatisation', 'GPS', 'Bluetooth', 'Siège bébé', 'Assurance', 'Kilométrage illimité'],
        images: [
          'https://cdn.dodovroum.com/cars/rav4.jpg',
          'https://cdn.dodovroum.com/cars/rav4-1.jpg',
          'https://cdn.dodovroum.com/cars/rav4-2.jpg',
          'https://cdn.dodovroum.com/cars/rav4-3.jpg',
        ],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'BMW',
        model: 'X5',
        year: 2023,
        type: 'CAR',
        pricePerDay: 50000.00,
        ownerId: proprietaires[0].id, // Assigner au premier propriétaire
        capacity: 5,
        fuelType: 'Essence',
        transmission: 'Automatique',
        title: 'BMW X5 2023 - Luxe et Performance',
        address: 'Plateau, Abidjan',
        mileage: 25000,
        color: 'Noir',
        condition: 'Excellent état',
        plateNumber: 'CI-456-CD',
        isVerified: true,
        features: ['Climatisation', 'GPS', 'Bluetooth', 'Sièges chauffants', 'Caméra de recul', 'Assurance'],
        images: [
          'https://cdn.dodovroum.com/cars/bmw-x5.jpg',
          'https://cdn.dodovroum.com/cars/bmw-x5-1.jpg',
          'https://cdn.dodovroum.com/cars/bmw-x5-2.jpg',
        ],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'Mercedes-Benz',
        model: 'Classe C',
        year: 2023,
        type: 'CAR',
        pricePerDay: 45000.00,
        capacity: 5,
        fuelType: 'Essence',
        transmission: 'Automatique',
        title: 'Mercedes Classe C 2023 - Élégance et Confort',
        address: 'Marcory, Abidjan',
        mileage: 18000,
        color: 'Gris métallisé',
        condition: 'Excellent état',
        plateNumber: 'CI-789-EF',
        isVerified: true,
        features: ['Climatisation', 'GPS', 'Bluetooth', 'Sièges en cuir', 'Assistance à la conduite', 'Assurance'],
        images: [
          'https://cdn.dodovroum.com/cars/mercedes-c.jpg',
          'https://cdn.dodovroum.com/cars/mercedes-c-1.jpg',
        ],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'Peugeot',
        model: '208',
        year: 2022,
        type: 'CAR',
        pricePerDay: 20000.00,
        capacity: 5,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        title: 'Peugeot 208 2022 - Compacte et Économique',
        address: 'Yopougon, Abidjan',
        mileage: 35000,
        color: 'Bleu',
        condition: 'Bon état',
        plateNumber: 'CI-234-GH',
        isVerified: true,
        features: ['Climatisation', 'Bluetooth', 'Assurance'],
        images: ['https://cdn.dodovroum.com/cars/peugeot208.jpg'],
      } as any,
    }),
    // Motos
    prisma.vehicle.create({
      data: {
        brand: 'Honda',
        model: 'CBR 650R',
        year: 2023,
        type: 'MOTORCYCLE',
        pricePerDay: 25000.00,
        capacity: 2,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        title: 'Honda CBR 650R 2023 - Sportive',
        address: 'Yopougon, Abidjan',
        mileage: 12000,
        color: 'Rouge',
        condition: 'Excellent état',
        plateNumber: 'CI-MC-001',
        isVerified: true,
        features: ['ABS', 'Mode sport', 'Éclairage LED', 'Assurance'],
        images: ['https://cdn.dodovroum.com/cars/honda-cbr.jpg'],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'Yamaha',
        model: 'MT-07',
        year: 2022,
        type: 'MOTORCYCLE',
        pricePerDay: 22000.00,
        capacity: 2,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        title: 'Yamaha MT-07 2022 - Naked Bike',
        address: 'Plateau, Abidjan',
        mileage: 20000,
        color: 'Noir',
        condition: 'Excellent état',
        plateNumber: 'CI-MC-002',
        isVerified: true,
        features: ['ABS', 'Éclairage LED', 'Assurance', 'Casque inclus'],
        images: ['https://cdn.dodovroum.com/cars/yamaha-mt07.jpg'],
      } as any,
    }),
    // Vélos
    prisma.vehicle.create({
      data: {
        brand: 'Giant',
        model: 'Escape 3',
        year: 2024,
        type: 'BICYCLE',
        pricePerDay: 5000.00,
        capacity: 1,
        fuelType: 'Électrique',
        transmission: 'Vitesses multiples',
        title: 'Vélo électrique Giant Escape 3',
        address: 'Marcory, Abidjan',
        mileage: 500,
        color: 'Bleu',
        condition: 'Neuf',
        plateNumber: null, // Les vélos n'ont généralement pas de plaque
        isVerified: false,
        features: ['Éclairage', 'Porte-bagages', 'Antivol', 'Batterie rechargeable'],
        images: ['https://cdn.dodovroum.com/cars/giant-bike.jpg'],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'Trek',
        model: 'FX 3',
        year: 2023,
        type: 'BICYCLE',
        pricePerDay: 4000.00,
        capacity: 1,
        fuelType: 'Manuel',
        transmission: 'Vitesses multiples',
        title: 'Vélo Trek FX 3 - Ville et Route',
        address: 'Cocody, Abidjan',
        mileage: 1000,
        color: 'Vert',
        condition: 'Excellent état',
        plateNumber: null, // Les vélos n'ont généralement pas de plaque
        isVerified: true,
        features: ['Éclairage', 'Porte-bagages', 'Antivol', 'Casque inclus'],
        images: ['https://cdn.dodovroum.com/cars/trek-fx3.jpg'],
      } as any,
    }),
    // Scooters
    prisma.vehicle.create({
      data: {
        brand: 'Vespa',
        model: 'GTS 300',
        year: 2023,
        type: 'SCOOTER',
        pricePerDay: 15000.00,
        capacity: 2,
        fuelType: 'Essence',
        transmission: 'Automatique',
        title: 'Vespa GTS 300 2023 - Élégance Italienne',
        address: 'Plateau, Abidjan',
        mileage: 8000,
        color: 'Blanc',
        condition: 'Excellent état',
        plateNumber: 'CI-SC-001',
        isVerified: true,
        features: ['Top case', 'Assurance', 'Casque inclus'],
        images: ['https://cdn.dodovroum.com/cars/vespa-gts.jpg'],
      } as any,
    }),
    prisma.vehicle.create({
      data: {
        brand: 'Yamaha',
        model: 'NMAX',
        year: 2022,
        type: 'SCOOTER',
        pricePerDay: 12000.00,
        capacity: 2,
        fuelType: 'Essence',
        transmission: 'Automatique',
        title: 'Yamaha NMAX 2022 - Pratique et Économique',
        address: 'Yopougon, Abidjan',
        mileage: 15000,
        color: 'Rouge',
        condition: 'Bon état',
        plateNumber: 'CI-SC-002',
        isVerified: true,
        features: ['Top case', 'Assurance'],
        images: ['https://cdn.dodovroum.com/cars/yamaha-nmax.jpg'],
      } as any,
    }),
    // Van
    prisma.vehicle.create({
      data: {
        brand: 'Mercedes-Benz',
        model: 'Vito',
        year: 2022,
        type: 'VAN',
        pricePerDay: 40000.00,
        capacity: 8,
        fuelType: 'Diesel',
        transmission: 'Automatique',
        title: 'Mercedes Vito 2022 - Familiale et Spacieuse',
        address: 'Cocody, Abidjan',
        mileage: 30000,
        color: 'Blanc',
        condition: 'Excellent état',
        plateNumber: 'CI-567-IJ',
        isVerified: true,
        features: ['Climatisation', 'GPS', 'Sièges 8 places', 'Assurance', 'Kilométrage illimité'],
        images: [
          'https://cdn.dodovroum.com/cars/mercedes-vito.jpg',
          'https://cdn.dodovroum.com/cars/mercedes-vito-1.jpg',
        ],
      } as any,
    }),
    // Camionnette
    prisma.vehicle.create({
      data: {
        brand: 'Toyota',
        model: 'Hilux',
        year: 2023,
        type: 'TRUCK',
        pricePerDay: 35000.00,
        capacity: 5,
        fuelType: 'Diesel',
        transmission: 'Manuelle',
        title: 'Toyota Hilux 2023 - Robustesse et Fiabilité',
        address: 'Marcory, Abidjan',
        mileage: 22000,
        color: 'Gris',
        condition: 'Excellent état',
        plateNumber: 'CI-890-KL',
        isVerified: true,
        features: ['4x4', 'Climatisation', 'GPS', 'Assurance', 'Kilométrage illimité'],
        images: [
          'https://cdn.dodovroum.com/cars/toyota-hilux.jpg',
          'https://cdn.dodovroum.com/cars/toyota-hilux-1.jpg',
        ],
      } as any,
    }),
  ]);

  const vehicle1 = vehicles[0];
  const vehicle2 = vehicles[1];
  const vehicle3 = vehicles[4]; // Honda CBR
  const vehicle4 = vehicles[6]; // Giant Bike

  // ============================================
  // CRÉATION DES OFFRES COMBINÉES
  // ============================================
  console.log('🎁 Création des offres combinées...');

  const offers = await Promise.all([
    prisma.offer.create({
      data: {
        title: 'Package Villa + BMW X5',
        description: 'Offre spéciale : Villa de luxe avec BMW X5 inclus pour 7 jours',
        price: 420000.00, // (55000 * 7) + (50000 * 7) avec réduction
        discount: 15.0,
        nbJours: 7,
        residenceId: residence1.id,
        vehicleId: vehicle2.id,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2024-12-31'),
        isActive: true,
        isVerified: true,
      },
    }),
    prisma.offer.create({
      data: {
        title: 'Week-end Appartement + Peugeot 208',
        description: 'Package week-end : Appartement moderne + voiture compacte pour 2 jours',
        price: 110000.00,
        discount: 10.0,
        nbJours: 2,
        residenceId: residence2.id,
        vehicleId: vehicles[3].id, // Peugeot 208
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2024-12-31'),
        isActive: true,
        isVerified: true,
      },
    }),
    prisma.offer.create({
      data: {
        title: 'Séjour Grand-Bassam + Vespa',
        description: 'Découvrez Grand-Bassam avec style : Maison coloniale + Vespa pour 5 jours',
        price: 215000.00,
        discount: 12.0,
        nbJours: 5,
        residenceId: residences[3].id, // Grand-Bassam
        vehicleId: vehicles[8].id, // Vespa
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2024-12-31'),
        isActive: true,
        isVerified: true,
      },
    }),
    prisma.offer.create({
      data: {
        title: 'Famille : Villa Treichville + Mercedes Vito',
        description: 'Package famille : Grande villa avec jardin + Van 8 places pour 7 jours',
        price: 595000.00,
        discount: 20.0,
        nbJours: 7,
        residenceId: residences[7].id, // Villa Treichville
        vehicleId: vehicles[10].id, // Mercedes Vito
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2024-12-31'),
        isActive: true,
        isVerified: true,
      },
    }),
  ]);

  // ============================================
  // CRÉATION DES RÉSERVATIONS
  // ============================================
  console.log('📅 Création des réservations...');

  const bookings = await Promise.all([
    // Réservations de résidences
    prisma.booking.create({
      data: {
        userId: clients[0].id,
        residenceId: residence1.id,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-07'),
        totalPrice: 330000.00, // 55000 * 6 nuits
        status: 'CONFIRMEE',
        notes: 'Séjour en famille',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[0].id,
        residenceId: residence1.id,
        startDate: new Date('2024-05-01'),
        endDate: new Date('2024-05-03'),
        totalPrice: 110000.00,
        status: 'TERMINEE',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[0].id,
        residenceId: residence1.id,
        startDate: new Date('2024-04-15'),
        endDate: new Date('2024-04-18'),
        totalPrice: 165000.00,
        status: 'TERMINEE',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[1].id, // Marie Martin
        residenceId: residence2.id,
        startDate: new Date('2024-07-10'),
        endDate: new Date('2024-07-15'),
        totalPrice: 175000.00, // 35000 * 5 nuits
        status: 'CONFIRMEE',
        notes: 'Vacances d\'été',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[2].id, // Pierre Durand
        residenceId: residences[3].id, // Grand-Bassam
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
        totalPrice: 160000.00, // 40000 * 4 nuits
        status: 'PENDING',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[3].id, // Sophie Bernard
        residenceId: residences[4].id, // Penthouse
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-09-04'),
        totalPrice: 225000.00, // 75000 * 3 nuits
        status: 'CONFIRMEE',
        notes: 'Week-end de luxe',
      },
    }),
    // Réservations de véhicules
    prisma.booking.create({
      data: {
        userId: clients[0].id,
        vehicleId: vehicle1.id,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalPrice: 120000.00, // 30000 * 4 jours
        status: 'CONFIRMEE',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[1].id,
        vehicleId: vehicles[4].id, // Honda CBR
        startDate: new Date('2024-07-20'),
        endDate: new Date('2024-07-25'),
        totalPrice: 125000.00, // 25000 * 5 jours
        status: 'PENDING',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[2].id,
        vehicleId: vehicles[6].id, // Giant Bike
        startDate: new Date('2024-08-10'),
        endDate: new Date('2024-08-12'),
        totalPrice: 10000.00, // 5000 * 2 jours
        status: 'CONFIRMEE',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[3].id,
        vehicleId: vehicles[8].id, // Vespa
        startDate: new Date('2024-09-15'),
        endDate: new Date('2024-09-17'),
        totalPrice: 30000.00, // 15000 * 2 jours
        status: 'CONFIRMEE',
      },
    }),
    // Réservations d'offres combinées
    prisma.booking.create({
      data: {
        userId: clients[4].id, // Lucas Petit
        offerId: offers[0].id, // Package Villa + BMW
        startDate: new Date('2024-10-01'),
        endDate: new Date('2024-10-08'),
        totalPrice: 420000.00,
        status: 'CONFIRMEE',
        notes: 'Honeymoon',
      },
    }),
    prisma.booking.create({
      data: {
        userId: clients[1].id,
        offerId: offers[1].id, // Week-end Appartement + Peugeot
        startDate: new Date('2024-11-15'),
        endDate: new Date('2024-11-17'),
        totalPrice: 110000.00,
        status: 'PENDING',
      },
    }),
  ]);

  const booking1 = bookings[0];
  const booking2 = bookings[1];
  const booking3 = bookings[2];

  // ============================================
  // CRÉATION DES PAIEMENTS
  // ============================================
  console.log('💳 Création des paiements...');

  const payments = await Promise.all([
    prisma.payment.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[0].id,
        amount: 330000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'CARD',
        transactionId: 'TXN-' + Date.now() + '-1',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[1].id,
        amount: 110000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'MOBILE_MONEY',
        transactionId: 'TXN-' + Date.now() + '-2',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[1].id,
        bookingId: bookings[3].id,
        amount: 175000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'CARD',
        transactionId: 'TXN-' + Date.now() + '-3',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[6].id, // Réservation véhicule
        amount: 120000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'BANK_TRANSFER',
        transactionId: 'TXN-' + Date.now() + '-4',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[2].id,
        bookingId: bookings[4].id,
        amount: 160000.00,
        currency: 'XOF',
        status: 'PENDING',
        method: 'CARD',
        transactionId: 'TXN-' + Date.now() + '-5',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[3].id,
        bookingId: bookings[5].id,
        amount: 225000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'CARD',
        transactionId: 'TXN-' + Date.now() + '-6',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[4].id,
        bookingId: bookings[10].id, // Offre combinée
        amount: 420000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'CARD',
        transactionId: 'TXN-' + Date.now() + '-7',
      },
    }),
    prisma.payment.create({
      data: {
        userId: clients[2].id,
        bookingId: bookings[8].id, // Vélo
        amount: 10000.00,
        currency: 'XOF',
        status: 'COMPLETED',
        method: 'MOBILE_MONEY',
        transactionId: 'TXN-' + Date.now() + '-8',
      },
    }),
  ]);

  // ============================================
  // CRÉATION DES AVIS
  // ============================================
  console.log('⭐ Création des avis...');

  const reviews = await Promise.all([
    // Avis pour résidences
    prisma.review.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[0].id,
        residenceId: residence1.id,
        rating: 5,
        comment: 'Excellent séjour ! La villa est magnifique et très bien équipée. La piscine est un vrai plus.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[1].id,
        residenceId: residence1.id,
        rating: 5,
        comment: 'Parfait pour une famille ! Très propre et bien situé.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[2].id,
        residenceId: residence1.id,
        rating: 4,
        comment: 'Très bien, juste un peu cher mais ça vaut le coup.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[1].id,
        bookingId: bookings[3].id,
        residenceId: residence2.id,
        rating: 4,
        comment: 'Appartement très bien situé, proche de tout. Un peu bruyant mais acceptable.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[3].id,
        bookingId: bookings[5].id,
        residenceId: residences[4].id, // Penthouse
        rating: 5,
        comment: 'Expérience exceptionnelle ! La vue est à couper le souffle. Service impeccable.',
      },
    }),
    // Avis pour véhicules
    prisma.review.create({
      data: {
        userId: clients[0].id,
        bookingId: bookings[6].id,
        vehicleId: vehicle1.id,
        rating: 5,
        comment: 'Véhicule en excellent état, très confortable. Parfait pour les longs trajets.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[2].id,
        bookingId: bookings[8].id,
        vehicleId: vehicles[6].id, // Giant Bike
        rating: 4,
        comment: 'Vélo électrique très pratique, batterie tient bien. Parfait pour la ville.',
      },
    }),
    prisma.review.create({
      data: {
        userId: clients[3].id,
        bookingId: bookings[9].id,
        vehicleId: vehicles[8].id, // Vespa
        rating: 5,
        comment: 'Vespa en parfait état, très élégante. Parfaite pour découvrir la ville avec style.',
      },
    }),
  ]);

  // ============================================
  // CRÉATION DES FAVORIS
  // ============================================
  console.log('❤️ Création des favoris...');

  await Promise.all([
    prisma.favorite.create({
      data: {
        userId: clients[0].id,
        residenceId: residence2.id,
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[0].id,
        vehicleId: vehicle2.id,
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[1].id,
        residenceId: residences[4].id, // Penthouse
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[1].id,
        vehicleId: vehicles[4].id, // Honda CBR
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[2].id,
        residenceId: residences[3].id, // Grand-Bassam
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[2].id,
        vehicleId: vehicles[6].id, // Giant Bike
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[3].id,
        residenceId: residence1.id,
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[3].id,
        vehicleId: vehicles[8].id, // Vespa
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[4].id,
        residenceId: residences[7].id, // Villa Treichville
      },
    }),
    prisma.favorite.create({
      data: {
        userId: clients[4].id,
        vehicleId: vehicles[10].id, // Mercedes Vito
      },
    }),
  ]);

  console.log('✅ Seeding terminé avec succès !');
  console.log('\n📊 Résumé des données créées :');
  console.log(`👤 ${1} administrateur créé : ${admin.email} (mot de passe: admin123)`);
  console.log(`👥 ${clients.length} clients créés (mot de passe pour tous: client123)`);
  console.log(`   - ${clients[0].email}`);
  console.log(`   - ${clients[1].email}`);
  console.log(`   - ${clients[2].email}`);
  console.log(`   - ${clients[3].email}`);
  console.log(`   - ${clients[4].email}`);
  console.log(`🏘️  ${proprietaires.length} propriétaires créés (mot de passe pour tous: proprietaire123)`);
  console.log(`   - ${proprietaires[0].email}`);
  console.log(`   - ${proprietaires[1].email}`);
  console.log(`   - ${proprietaires[2].email}`);
  console.log(`🏠 ${residences.length} résidences créées (avec commodités, images, coordonnées GPS)`);
  console.log(`🚗 ${vehicles.length} véhicules créés (CAR, MOTORCYCLE, BICYCLE, SCOOTER, VAN, TRUCK)`);
  console.log(`🎁 ${offers.length} offres combinées créées`);
  console.log(`📅 ${bookings.length} réservations créées (résidences, véhicules, offres)`);
  console.log(`💳 ${payments.length} paiements créés (CARD, MOBILE_MONEY, BANK_TRANSFER)`);
  console.log(`⭐ ${reviews.length} avis créés (résidences et véhicules)`);
  console.log(`❤️ ${10} favoris créés`);
  console.log('\n🎉 Base de données prête pour les tests !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
