# La Bicoque — frontend

React, TypeScript, Vite, Tailwind et Supabase Auth/Postgres/Storage.

## Développement

```powershell
# Depuis frontend, uniquement si le fichier n'existe pas :
Copy-Item .env.example .env.local
# Renseigner URL et clé publique Supabase en privé.
npm run dev
```

Restaurer les dépendances avec `npm ci` si nécessaire. Redémarrer Vite après
changement des variables. Ne jamais utiliser de clé secrète dans une variable `VITE_`.

## Parcours

- `/` : présentation publique de La Bicoque et des Bicoquins.
- `/a-propos`, `/contact` : présentation/informations pratiques ; aucun ancien
  contact n'est republié sans validation.
- `/inscription`, `/connexion`, `/auth/callback` : inscription avec confirmation e-mail.
- `/profil` : nom et branche ; changement de branche réservé aux admins.
- `/reservation` : calendrier borné à six mois, demandes ouvertes/exclusives,
  effectifs estimés et suivi des approbations/confirmations.
- `/gestion` : réservé aux admins, priorités familiales, approbations, conflits,
  blocages, profils, tarif de virement et suivi des e-mails.
- `/histoires`, `/histoires/:slug`, `/documents` : archives privées après import,
  accessibles aux comptes à e-mail confirmé. Les fichiers sont dans Storage privé.

La base et les fonctions serveur font autorité : masquer un bouton n'est pas une
autorisation. Voir [les règles de réservation](../docs/reservation.md) et
[la mise en service Supabase](../supabase/README.md).

## Validation

```powershell
npm test
npm run build
npm run lint
```

## Cloudflare Workers deployment

Projet Git connecté à `master`, Worker `la-bicoque` :

| Paramètre | Valeur |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable `NODE_VERSION` | `24` |
| Build variable `VITE_SUPABASE_URL` | URL du projet Supabase |
| Build variable `VITE_SUPABASE_ANON_KEY` | Clé publishable ou anon |

`wrangler.jsonc` publie `dist` et configure le repli SPA. Ne pas publier les sources
ni committer `dist`. Les valeurs `VITE_` sont intégrées au build : les variables
d'exécution Worker ne les remplacent pas.

**Ordre de mise en service :** migrations/permissions Supabase, configuration Auth,
admins et jobs, validation, puis publication frontend. Un push n'applique pas les
migrations et ne configure pas Resend.

Vérifier accueil, accès direct/actualisation des routes, inscription, e-mail confirmé,
droits d'accès et réservations sur l'URL publique. Les nouveaux parcours ne sont
pas déclarés opérationnels en production par la seule réussite du build local.
