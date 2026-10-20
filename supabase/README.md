# Supabase (backend)

Backend géré gratuitement (free tier) : base Postgres, Auth, Storage, Edge Functions, API auto-générée.

## Démarrage

1. Créer un projet sur <https://supabase.com/dashboard>.
2. Copier `Project URL` et la clé **publishable** (ou l'ancienne clé `anon`) dans `frontend/.env.local` :

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

   Le nom `VITE_SUPABASE_ANON_KEY` accepte aussi une clé `sb_publishable_`.
   Ne jamais utiliser une clé `secret` / `service_role`, un mot de passe ou une chaîne de connexion :
   les variables `VITE_` sont publiques dans le site compilé.
3. (Optionnel) Lier le projet avec la CLI :

   ```bash
   npx supabase login
   npx supabase init
   npx supabase link --project-ref YOUR-PROJECT-REF
   ```

4. Les migrations SQL vont dans `supabase/migrations/` puis : `npx supabase db push`.

> ⚠️ Toujours activer la Row Level Security (RLS) sur les tables exposées au frontend.

## Connexion au site

- Dans Authentication, désactiver **Allow new users to sign up**. Masquer un formulaire d'inscription ne suffit pas.
- Dans Authentication > Users, créer le compte temporaire avec une adresse e-mail confirmée et un mot de passe privé.
- La page `/connexion` utilise Supabase Auth (e-mail / mot de passe). Aucun compte ni mot de passe n'est codé dans React.
- La session est restaurée au rechargement. La déconnexion ferme la session locale de ce navigateur, pas celles des autres appareils.
- Sans session, `/reservation` redirige vers `/connexion`. Après connexion, le site affiche la page de réservation.
- Une migration de réservations se trouve dans `supabase/migrations/20261016090000_booking_requests.sql`. Après vérification, l'exécuter dans le SQL Editor Supabase comme décrit dans `docs/reservation.md`.
- Les demandes collectent le prénom et le nom du voyageur et limitent les heures d'arrivée/de départ à des heures pleines. Le calendrier authentifié partage le nom des séjours confirmés, mais jamais les e-mails ou les messages des voyageurs.
- Les droits propriétaire sont activés une fois dans `/gestion`. Le mécanisme refuse l'activation si le projet contient autre chose que l'unique utilisateur Auth initial ; désactiver l'inscription publique et activer le compte propriétaire avant d'ajouter les comptes invités.
- La navigation React n'est pas une autorisation de base de données. Les demandes et dates occupées sont protégées par RLS et des fonctions PostgreSQL.
- La capacité reste non configurée jusqu'à ce que le propriétaire l'enregistre depuis `/gestion`. Les demandes sont refusées avant cela.
- Pour un compte perdu ou un mot de passe oublié, contacter le propriétaire. Pas d'inscription publique ni de récupération de mot de passe dans cette première étape.

Avant publication sur Cloudflare Pages, configurer les URL d'authentification Supabase pour le domaine réel et vérifier les limites du service.
