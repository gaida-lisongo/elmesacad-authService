# Auth Service

Service Express.js d’authentification des applications clientes : approvisionnement des identifiants (API key / secret), émission de JWT, validation pour **Traefik** (`forwardAuth`), vérification, renouvellement et révocation.

**Préfixe API** : `/api/v1`

**Port** : défini par `PORT` (défaut `3000`).

---

## Variables d’environnement

| Variable | Rôle |
|----------|------|
| `PORT` | Port d’écoute HTTP |
| `MONGODB_URI` | URI de connexion MongoDB (Mongoose) |
| `JWT_SECRET` | Secret de signature des JWT |
| `GLOBAL_SHARED_KEY` | Secret partagé pour le calcul HMAC des appels d’administration (`provision`, `verify`, `refresh`, `revoke`) |

---

## Santé

### `GET /`

Vérifie que le service répond.

**cURL**

```bash
curl -sS "http://localhost:3000/"
```

**Réponses attendues**

| Code | Corps (exemple) |
|------|-------------------|
| `200` | `{"message":"Service opérationnel","status":"OK"}` |

---

## Authentification des appels d’administration (signature HMAC)

Les routes **provision**, **verify**, **refresh** et **revoke** exigent une signature issue d’une clé partagée `GLOBAL_SHARED_KEY`.

**Algorithme**

1. Choisir un `timestamp` (chaîne, souvent millisecondes Unix : `Date.now().toString()`).
2. Calculer en hexadécimal :  
   `signature = HMAC_SHA256(GLOBAL_SHARED_KEY, timestamp + apiKey)`

Vous pouvez transmettre `apiKey`, `timestamp` et `signature` soit dans le **corps JSON**, soit dans les **en-têtes** :

| Paramètre | En-tête alternatif |
|-----------|-------------------|
| `apiKey` | `X-Api-Key` |
| `timestamp` | `X-Timestamp` |
| `signature` | `X-Signature` |

**Erreurs communes**

| Code | Corps (exemple) |
|------|-------------------|
| `401` | `{"error":"Paramètres d'authentification manquants"}` |
| `403` | `{"error":"Reconnaissance échouée"}` |

---

## Endpoints clients (`/api/v1/client`)

### `GET /api/v1/client/validate`

Destiné au middleware **Traefik** `forwardAuth` : valide le JWT présent dans `Authorization` et renvoie un statut HTTP interprété par Traefik (2xx = accès autorisé).

**En-têtes**

- `Authorization: Bearer <jwt>`

**cURL**

```bash
curl -sS -i \
  -H "Authorization: Bearer VOTRE_JWT" \
  "http://localhost:3000/api/v1/client/validate"
```

**Réponses attendues**

| Code | Corps / en-têtes |
|------|-------------------|
| `200` | Corps texte : `OK`. En-tête optionnel : `X-Client-Id` (identifiant MongoDB du client, issu du payload JWT `id`). |
| `401` | Corps texte : `Missing or invalid Authorization header` |
| `401` | Corps texte : `Invalid or expired token` |

---

### `POST /api/v1/client/provision`

Crée un client applicatif et retourne un premier JWT.

**Corps JSON** (en plus de `apiKey`, `timestamp`, `signature`)

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `apiKey` | oui | Identifiant public du client |
| `apiSecret` | oui | Secret (stocké haché côté serveur) |
| `designation` | oui | Libellé du client |
| `duration` | non | Durée de validité du JWT en **secondes** (défaut côté schéma : `3600`) |

**cURL**

```bash
# Remplacer TIMESTAMP, SIGNATURE, et les valeurs selon votre calcul HMAC
curl -sS -X POST "http://localhost:3000/api/v1/client/provision" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "mon-app-001",
    "apiSecret": "secret-tres-long",
    "designation": "Mon application",
    "duration": 3600,
    "timestamp": "TIMESTAMP",
    "signature": "SIGNATURE"
  }'
```

**Réponses attendues**

| Code | Corps (exemple) |
|------|-------------------|
| `201` | `{"message":"Client approvisionné","token":"<jwt>"}` |
| `400` | `{"error":"Client déjà enregistré"}` |
| `401` / `403` | Voir section signature HMAC |
| `500` | `{"error":"<message d’erreur>"}` |

---

### `POST /api/v1/client/verify`

Retourne l’enregistrement client (sans `apiSecret`) et indique si le token courant est expiré au regard de `expiresAt`.

**Corps JSON** (signature + `apiKey`)

| Champ | Obligatoire |
|-------|-------------|
| `apiKey` | oui |
| `timestamp` | oui (pour la signature) |
| `signature` | oui |

**cURL**

```bash
curl -sS -X POST "http://localhost:3000/api/v1/client/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "mon-app-001",
    "timestamp": "TIMESTAMP",
    "signature": "SIGNATURE"
  }'
```

**Réponses attendues**

| Code | Corps (exemple) |
|------|-------------------|
| `200` | `{"client":{...,"apiKey":"mon-app-001","token":"...","expiresAt":"...","duration":3600,"designation":"..."},"isExpired":false}` |
| `404` | `{"error":"Client inconnu"}` |
| `401` / `403` | Voir section signature HMAC |
| `500` | `{"error":"<message d’erreur>"}` |

---

### `PUT /api/v1/client/refresh`

Renouvelle le JWT à partir de `apiKey` et `apiSecret` (vérification bcrypt).

**Corps JSON**

| Champ | Obligatoire |
|-------|-------------|
| `apiKey` | oui |
| `apiSecret` | oui (en clair, comparé au hash stocké) |
| `timestamp` | oui |
| `signature` | oui |

**cURL**

```bash
curl -sS -X PUT "http://localhost:3000/api/v1/client/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "mon-app-001",
    "apiSecret": "secret-tres-long",
    "timestamp": "TIMESTAMP",
    "signature": "SIGNATURE"
  }'
```

**Réponses attendues**

| Code | Corps (exemple) |
|------|-------------------|
| `200` | `{"token":"<nouveau_jwt>","expiresAt":"2026-01-01T12:00:00.000Z"}` |
| `401` | `{"error":"Identifiants invalides"}` (secret incorrect) |
| `404` | `{"error":"Client inconnu"}` |
| `401` / `403` | Voir section signature HMAC |
| `500` | `{"error":"<message d’erreur>"}` |

---

### `DELETE /api/v1/client/revoke`

Supprime le client de la base si `apiSecret` est correct.

**Corps JSON**

| Champ | Obligatoire |
|-------|-------------|
| `apiKey` | oui |
| `apiSecret` | oui |
| `timestamp` | oui |
| `signature` | oui |

**cURL**

```bash
curl -sS -X DELETE "http://localhost:3000/api/v1/client/revoke" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "mon-app-001",
    "apiSecret": "secret-tres-long",
    "timestamp": "TIMESTAMP",
    "signature": "SIGNATURE"
  }'
```

**Réponses attendues**

| Code | Corps (exemple) |
|------|-------------------|
| `200` | `{"message":"Accès révoqué avec succès"}` |
| `401` | `{"error":"Action non autorisée"}` (mauvais `apiSecret`) |
| `404` | `{"error":"Client inconnu"}` |
| `401` / `403` | Voir section signature HMAC |
| `500` | `{"error":"<message d’erreur>"}` |

---

## Exemple de calcul de signature (Node.js, identique au service)

Même algorithme que `checkSignature` : `HMAC_SHA256(GLOBAL_SHARED_KEY, timestamp + apiKey)` en **hexadécimal**, avec `timestamp` et `apiKey` en **chaînes** concaténées sans séparateur.

```bash
export GLOBAL_SHARED_KEY="votre_cle_partagee"
export API_KEY="mon-app-001"
node -e "
const crypto = require('crypto');
const k = process.env.GLOBAL_SHARED_KEY;
const apiKey = process.env.API_KEY;
const ts = Date.now().toString();
const sig = crypto.createHmac('sha256', k).update(ts + apiKey).digest('hex');
console.log(JSON.stringify({ timestamp: ts, signature: sig }, null, 2));
"
```

Avec **OpenSSL** (message = concaténation `timestamp` + `apiKey` en binaire UTF-8) :

```bash
export GLOBAL_SHARED_KEY="votre_cle_partagee"
export API_KEY="mon-app-001"
export TIMESTAMP="$(node -e "console.log(Date.now().toString())")"
SIGNATURE=$(printf '%s' "${TIMESTAMP}${API_KEY}" | openssl dgst -sha256 -hmac "$GLOBAL_SHARED_KEY" -hex | awk '{print $2}')
echo "timestamp=$TIMESTAMP"
echo "signature=$SIGNATURE"
```

---

## Intégration Traefik (rappel)

Le middleware `forwardAuth` appelle en général **GET** `/api/v1/client/validate` en reprenant les en-têtes de la requête client, notamment `Authorization: Bearer <jwt>`.

Exemple d’adresse côté Traefik : `http://auth-service:3000/api/v1/client/validate` (ajuster hôte et port).

---

## Tests automatisés

```bash
npm test
```

Lance Jest (dont `auth.test.js`) : provisioning, validate, verify, revoke avec MongoDB en mémoire.
