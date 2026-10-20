import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function validateConfiguration(): string | null {
  if (!url || !key || url.includes('YOUR-PROJECT') || key === 'your-anon-key') {
    return 'Connexion indisponible : configurez les variables Supabase dans .env.local.'
  }
  try {
    if (new URL(url).protocol !== 'https:') {
      return 'La connexion Supabase doit utiliser une adresse HTTPS.'
    }
  } catch {
    return 'L\u2019adresse du projet Supabase est invalide.'
  }
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload: unknown = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (typeof payload !== 'object' || payload === null || !('role' in payload) || payload.role !== 'anon') {
        return 'Utilisez uniquement une cl\u00e9 publique Supabase (publishable ou anon).'
      }
    } catch {
      return 'Utilisez uniquement une cl\u00e9 publique Supabase (publishable ou anon).'
    }
  }
  return null
}

export const authConfigurationError = validateConfiguration()
export const supabase = authConfigurationError ? null : createClient(url!, key!)
