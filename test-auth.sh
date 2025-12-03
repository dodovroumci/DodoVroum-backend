#!/bin/bash

# Script de test pour l'authentification DodoVroum
# Usage: ./test-auth.sh

BASE_URL="http://localhost:3000/api"
EMAIL="client@dodovroum.com"
PASSWORD="client123"

echo "🔐 Test d'authentification DodoVroum"
echo "===================================="
echo ""

# 1. Se connecter
echo "1️⃣ Connexion avec $EMAIL..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

# Vérifier si la connexion a réussi
if echo "$LOGIN_RESPONSE" | grep -q "access_token"; then
  echo "✅ Connexion réussie !"
  echo ""
  
  # Extraire le token
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
  
  if [ -z "$TOKEN" ]; then
    # Essayer avec jq si disponible
    if command -v jq &> /dev/null; then
      TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.access_token')
    else
      echo "❌ Impossible d'extraire le token. Installez jq ou vérifiez la réponse:"
      echo "$LOGIN_RESPONSE"
      exit 1
    fi
  fi
  
  echo "📝 Token obtenu: ${TOKEN:0:50}..."
  echo ""
  
  # 2. Valider le token
  echo "2️⃣ Validation du token..."
  VALIDATE_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/validate" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$VALIDATE_RESPONSE" | grep -q "valid"; then
    echo "✅ Token valide !"
    echo "$VALIDATE_RESPONSE" | jq '.' 2>/dev/null || echo "$VALIDATE_RESPONSE"
  else
    echo "❌ Token invalide"
    echo "$VALIDATE_RESPONSE"
  fi
  echo ""
  
  # 3. Obtenir les bookings
  echo "3️⃣ Récupération des bookings..."
  BOOKINGS_RESPONSE=$(curl -s -X GET "$BASE_URL/bookings/my-bookings" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$BOOKINGS_RESPONSE" | grep -q "statusCode\|error"; then
    echo "❌ Erreur lors de la récupération des bookings:"
    echo "$BOOKINGS_RESPONSE" | jq '.' 2>/dev/null || echo "$BOOKINGS_RESPONSE"
  else
    echo "✅ Bookings récupérés avec succès !"
    echo "$BOOKINGS_RESPONSE" | jq '.' 2>/dev/null || echo "$BOOKINGS_RESPONSE"
  fi
  echo ""
  
  # 4. Se déconnecter
  echo "4️⃣ Déconnexion..."
  LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$LOGOUT_RESPONSE" | grep -q "message\|success"; then
    echo "✅ Déconnexion réussie !"
  else
    echo "⚠️  Réponse de déconnexion:"
    echo "$LOGOUT_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGOUT_RESPONSE"
  fi
  
else
  echo "❌ Échec de la connexion"
  echo "Réponse:"
  echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo "✨ Test terminé !"

