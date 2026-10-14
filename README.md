# Website

## Stack

| Couche | Techno | Dossier |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS | [`frontend/`](./frontend) |
| CMS (contenu) | Directus | [`cms/`](./cms) |
| Backend / BDD / Auth | Supabase (free tier) | [`supabase/`](./supabase) |
| Réservation | À définir | [`docs/reservation.md`](./docs/reservation.md) |

## Démarrage rapide

### Frontend

```bash
cd frontend
cp .env.example .env.local   # puis remplir les clés Supabase
npm install
npm run dev                  # http://localhost:5173
```

### CMS (Directus)

```bash
cd cms
cp .env.example .env         # changer SECRET et ADMIN_PASSWORD
npm install
npm run bootstrap            # 1re fois : crée la BDD + compte admin
npm start                    # http://localhost:8055
```

Alternative Docker : `docker compose up -d` dans `cms/`.

En production, Directus peut utiliser la base Postgres de Supabase (voir `cms/.env.example`, option B).

> Licence Directus : BSL 1.1 — gratuite pour les structures avec moins de 5 M$ de revenus annuels.

### Supabase

Voir [`supabase/README.md`](./supabase/README.md).
