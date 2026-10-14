# Supabase (backend)

Backend géré gratuitement (free tier) : base Postgres, Auth, Storage, Edge Functions, API auto-générée.

## Démarrage

1. Créer un projet sur <https://supabase.com/dashboard>.
2. Copier `Project URL` et `anon key` (Settings > API) dans `frontend/.env.local`.
3. (Optionnel) Lier le projet avec la CLI :

   ```bash
   npx supabase login
   npx supabase init
   npx supabase link --project-ref YOUR-PROJECT-REF
   ```

4. Les migrations SQL vont dans `supabase/migrations/` puis : `npx supabase db push`.

> ⚠️ Toujours activer la Row Level Security (RLS) sur les tables exposées au frontend.
