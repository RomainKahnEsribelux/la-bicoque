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
- `/mot-de-passe-oublie`, `/nouveau-mot-de-passe` : récupération et définition
  du mot de passe, avec vérification de session côté Supabase.
- `/mes-sejours` : demandes personnelles, statuts, annulation et paiements.
- `/sejour-pratique` : fiche privée chargée en base, sans contenu familial dans le bundle.
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

`VITE_AUTH_EMAILS_ENABLED` vaut `false` par défaut : les nouveaux envois de
confirmation d'inscription et de récupération sont bloqués dans l'interface,
avec un avertissement explicite. Les connexions existantes et les liens déjà
reçus restent utilisables. Passer à `true` **seulement après** configuration et
validation réelle du SMTP Supabase et des URL de redirection, puis reconstruire.
Ce drapeau public ne protège pas les API Auth : la configuration Auth serveur
reste obligatoire. Les invitations actuelles sont enregistrées sans envoi, même
avec ce drapeau ; elles fournissent le lien public d'inscription et réservent
les droits serveur, pas de lien d'authentification.

Vérifier accueil, accès direct/actualisation des routes, inscription, e-mail confirmé,
droits d'accès et réservations sur l'URL publique. Les nouveaux parcours ne sont
pas déclarés opérationnels en production par la seule réussite du build local.
