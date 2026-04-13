# 🎨 Guide d'Intégration Frontend - DodoVroum API

## 📋 Table des matières
1. [Authentification](#authentification)
2. [Gestion du Token](#gestion-du-token)
3. [Exemples de Code](#exemples-de-code)
4. [Gestion des Erreurs](#gestion-des-erreurs)
5. [Best Practices](#best-practices)

---

## 🔐 Authentification

### 1. Inscription (Register) - PUBLIC

**⚠️ Important :** Utilisez `/api/auth/register` pour l'inscription, PAS `/api/users`

**Endpoint :** `POST /api/auth/register` (Public, pas besoin de token)

**Request :**
```json
{
  "email": "nouveau@example.com",
  "password": "password123",
  "firstName": "Jean",
  "lastName": "Dupont",
  "phone": "+33123456789"
}
```

**Response :**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123...",
    "email": "nouveau@example.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "role": "CLIENT"
  }
}
```

**Note :** L'inscription retourne automatiquement un token, l'utilisateur est connecté directement.

### 2. Connexion (Login) - PUBLIC

**Endpoint :** `POST /api/auth/login` (Public, pas besoin de token)

**Request :**
```json
{
  "email": "client@dodovroum.com",
  "password": "client123"
}
```

**Response :**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123...",
    "email": "client@dodovroum.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "role": "CLIENT"
  }
}
```

### 2. Stockage du Token

**⚠️ Important :** Stockez le token de manière sécurisée :

- ✅ **localStorage** (pour les apps web simples)
- ✅ **sessionStorage** (pour les sessions temporaires)
- ✅ **Cookies httpOnly** (plus sécurisé, nécessite backend)
- ❌ **NE PAS** stocker en clair dans le code
- ❌ **NE PAS** commiter les tokens dans Git

### 3. Utilisation du Token

Toutes les requêtes vers les endpoints protégés doivent inclure :

```
Authorization: Bearer <access_token>
```

---

## 💻 Exemples de Code

### React / Next.js

```typescript
// services/auth.service.ts
const API_BASE_URL = 'http://localhost:3000/api';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Échec de la connexion');
    }

    const data = await response.json();
    
    // Stocker le token
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    return data;
  },

  async logout(): Promise<void> {
    const token = localStorage.getItem('access_token');
    
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    }
    
    // Supprimer les tokens
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  getToken(): string | null {
    return localStorage.getItem('access_token');
  },

  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
```

```typescript
// services/api.service.ts
const API_BASE_URL = 'http://localhost:3000/api';

class ApiService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        // Token expiré ou invalide
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }

      const error = await response.json();
      throw new Error(error.message || 'Une erreur est survenue');
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    return this.handleResponse<T>(response);
  }
}

export const apiService = new ApiService();
```

```typescript
// hooks/useFavorites.ts (React)
import { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';

interface Favorite {
  id: string;
  residence?: any;
  vehicle?: any;
  offer?: any;
  createdAt: string;
}

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{ data: Favorite[] }>('/favorites/my-favorites');
      setFavorites(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des favoris');
    } finally {
      setLoading(false);
    }
  };

  const addFavorite = async (residenceId?: string, vehicleId?: string, offerId?: string) => {
    try {
      const data: any = {};
      if (residenceId) data.residenceId = residenceId;
      if (vehicleId) data.vehicleId = vehicleId;
      if (offerId) data.offerId = offerId;

      await apiService.post('/favorites', data);
      await fetchFavorites(); // Recharger la liste
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Erreur lors de l\'ajout aux favoris');
    }
  };

  const removeFavorite = async (favoriteId: string) => {
    try {
      await apiService.delete(`/favorites/${favoriteId}`);
      await fetchFavorites(); // Recharger la liste
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    refresh: fetchFavorites,
  };
};
```

```typescript
// hooks/useBookings.ts (React)
import { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';

interface Booking {
  id: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: string;
  residence?: any;
  vehicle?: any;
  offer?: any;
}

export const useBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{ data: Booking[] }>('/bookings/my-bookings');
      setBookings(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des réservations');
    } finally {
      setLoading(false);
    }
  };

  const createBooking = async (bookingData: {
    residenceId?: string;
    vehicleId?: string;
    offerId?: string;
    startDate: string;
    endDate: string;
    notes?: string;
  }) => {
    try {
      await apiService.post('/bookings', bookingData);
      await fetchBookings(); // Recharger la liste
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Erreur lors de la création de la réservation');
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  return {
    bookings,
    loading,
    error,
    createBooking,
    refresh: fetchBookings,
  };
};
```

### Vue.js / Nuxt.js

```typescript
// composables/useAuth.ts
export const useAuth = () => {
  const login = async (email: string, password: string) => {
    const { data } = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    // Stocker le token
    const token = useCookie('access_token');
    token.value = data.access_token;

    const user = useCookie('user');
    user.value = data.user;

    return data;
  };

  const logout = async () => {
    const token = useCookie('access_token');
    
    if (token.value) {
      try {
        await $fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.value}`,
          },
        });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    }

    token.value = null;
    useCookie('user').value = null;
  };

  const isAuthenticated = () => {
    return !!useCookie('access_token').value;
  };

  return {
    login,
    logout,
    isAuthenticated,
  };
};
```

```typescript
// plugins/api.client.ts (Nuxt 3)
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const token = useCookie('access_token');

  // Intercepteur pour ajouter le token
  const $api = $fetch.create({
    baseURL: config.public.apiBase || 'http://localhost:3000/api',
    onRequest({ request, options }) {
      if (token.value) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${token.value}`,
        };
      }
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        // Token expiré
        token.value = null;
        navigateTo('/login');
      }
    },
  });

  return {
    provide: {
      api: $api,
    },
  };
});
```

### Angular

```typescript
// services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
  private tokenKey = 'access_token';
  private userKey = 'user';

  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((response: any) => {
          localStorage.setItem(this.tokenKey, response.access_token);
          localStorage.setItem(this.userKey, JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
        })
      );
  }

  logout(): Observable<any> {
    const token = this.getToken();
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      tap(() => {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        this.currentUserSubject.next(null);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private loadUserFromStorage(): void {
    const userStr = localStorage.getItem(this.userKey);
    if (userStr) {
      this.currentUserSubject.next(JSON.parse(userStr));
    }
  }
}
```

```typescript
// interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = this.authService.getToken();

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.authService.logout().subscribe();
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      })
    );
  }
}
```

---

## 🛡️ Gestion des Erreurs

### Codes d'Erreur Courants

| Code | Signification | Action |
|------|---------------|--------|
| 401 | Non authentifié | Rediriger vers login, supprimer le token |
| 403 | Accès refusé | Afficher un message d'erreur |
| 404 | Ressource non trouvée | Afficher un message approprié |
| 400 | Données invalides | Afficher les erreurs de validation |
| 500 | Erreur serveur | Afficher un message générique |

### Exemple de Gestion d'Erreurs

```typescript
// utils/errorHandler.ts
export const handleApiError = (error: any): string => {
  if (error.response) {
    // Erreur HTTP
    const { status, data } = error.response;
    
    switch (status) {
      case 401:
        return 'Session expirée. Veuillez vous reconnecter.';
      case 403:
        return 'Vous n\'avez pas les permissions nécessaires.';
      case 404:
        return 'Ressource non trouvée.';
      case 400:
        return data.message || 'Données invalides.';
      case 500:
        return 'Erreur serveur. Veuillez réessayer plus tard.';
      default:
        return data.message || 'Une erreur est survenue.';
    }
  } else if (error.request) {
    // Pas de réponse du serveur
    return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
  } else {
    // Erreur de configuration
    return 'Erreur de configuration. Contactez le support.';
  }
};
```

---

## ✅ Best Practices

### 1. Intercepteurs HTTP

Utilisez des intercepteurs pour :
- Ajouter automatiquement le token à toutes les requêtes
- Gérer les erreurs 401 globalement
- Rafraîchir le token automatiquement

### 2. Refresh Token

```typescript
// services/token.service.ts
export const refreshToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refresh_token');
  
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      return data.access_token;
    }
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error);
  }

  return null;
};
```

### 3. Protection des Routes

```typescript
// React Router
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = authService.isAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
```

### 4. Variables d'Environnement

```env
# .env
VITE_API_BASE_URL=http://localhost:3000/api
# ou
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

---

## 📱 Exemple Complet - Composant React

```tsx
// components/FavoritesList.tsx
import React from 'react';
import { useFavorites } from '../hooks/useFavorites';

export const FavoritesList: React.FC = () => {
  const { favorites, loading, error, removeFavorite } = useFavorites();

  if (loading) return <div>Chargement...</div>;
  if (error) return <div>Erreur: {error}</div>;

  return (
    <div>
      <h2>Mes Favoris</h2>
      {favorites.length === 0 ? (
        <p>Aucun favori pour le moment</p>
      ) : (
        <ul>
          {favorites.map((favorite) => (
            <li key={favorite.id}>
              {favorite.residence && (
                <div>
                  <h3>{favorite.residence.title}</h3>
                  <p>{favorite.residence.city}</p>
                </div>
              )}
              {favorite.vehicle && (
                <div>
                  <h3>{favorite.vehicle.title}</h3>
                  <p>{favorite.vehicle.brand} {favorite.vehicle.model}</p>
                </div>
              )}
              {favorite.offer && (
                <div>
                  <h3>{favorite.offer.title}</h3>
                  <p>Prix: {favorite.offer.price} XOF</p>
                </div>
              )}
              <button onClick={() => removeFavorite(favorite.id)}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

---

## 🔗 Endpoints Principaux

### Authentification (PUBLIC - Pas besoin de token)
- `POST /api/auth/register` - Inscription (retourne un token automatiquement)
- `POST /api/auth/login` - Connexion
- `POST /api/auth/refresh` - Rafraîchir le token

### Authentification (PROTÉGÉ - Nécessite un token)
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/validate` - Valider le token

### ⚠️ Note Importante
- **`POST /api/auth/register`** = Inscription publique (utilisez celui-ci)
- **`POST /api/users`** = Création d'utilisateur par admin (ne pas utiliser pour l'inscription)

### Favoris
- `GET /api/favorites/my-favorites` - Mes favoris
- `POST /api/favorites` - Ajouter aux favoris
- `DELETE /api/favorites/:id` - Supprimer un favori

### Réservations
- `GET /api/bookings/my-bookings` - Mes réservations
- `POST /api/bookings` - Créer une réservation

### Résidences
- `GET /api/residences` - Liste des résidences
- `GET /api/residences/:id` - Détails d'une résidence

### Véhicules
- `GET /api/vehicles` - Liste des véhicules
- `GET /api/vehicles/:id` - Détails d'un véhicule

### Offres
- `GET /api/offers` - Liste des offres
- `GET /api/offers/:id` - Détails d'une offre

---

## 📚 Documentation Complète

- **Swagger UI** : http://localhost:3000/api
- **Guide d'authentification** : `AUTHENTICATION.md`
- **Guide rapide** : `QUICK_START.md`

---

**Besoin d'aide ?** Consultez la documentation Swagger ou contactez l'équipe backend.

