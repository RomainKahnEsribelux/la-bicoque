# Website

## Stack

| Couche | Techno | Dossier |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS | [`frontend/`](./frontend) |
| CMS (contenu) | Directus | [`cms/`](./cms) |
| Backend / BDD / Auth | Supabase (free tier) | [`supabase/`](./supabase) |
| Réservation | Demandes manuelles + disponibilité transactionnelle dans Supabase | [`docs/reservation.md`](./docs/reservation.md) |

## Démarrage rapide

### Frontend

```powershell
Set-Location 'D:\personal project\website\frontend'
Copy-Item .env.example .env.local   # uniquement si le fichier n'existe pas déjà
# Remplir l'URL et la clé publishable/anon Supabase dans .env.local
npm ci
npm run dev                        # http://localhost:5173
```

Ne jamais placer une clé `secret`/`service_role`, un mot de passe ou une chaîne
de connexion dans une variable `VITE_` : ces valeurs seraient publiques.
L'inscription publique doit être désactivée dans Supabase.

Les prochaines étapes de base de données, d'activation du propriétaire et le
formulaire sont documentés dans [`docs/reservation.md`](./docs/reservation.md).

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

## Publication gratuite

Le code peut etre conserve dans un depot GitHub prive et le frontend publie
automatiquement sur Cloudflare Pages. Cloudflare compile le site a chaque push :
ne pas committer le dossier `dist`, les fichiers `.env` ou la configuration MCP
locale. Le depot prive ne rend pas le site publie prive.

Voir [la procedure de deploiement](./frontend/README.md#cloudflare-pages-deployment).
