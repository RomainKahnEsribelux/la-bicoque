import { authConfigurationError, supabase } from './supabase'

export type FamilyArticle = {
  id: string
  slug: string
  title: string
  body: string
  published_at: string | null
  category: string | null
}

export type FamilyDocument = {
  id: string
  title: string
  storage_path: string
  year: number | null
  mime_type: string | null
  article_id: string | null
}

function client() {
  if (!supabase) {
    throw new Error(authConfigurationError ?? 'Le service de contenu est indisponible.')
  }
  return supabase
}

function explainError(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Impossible de charger les archives. Veuillez réessayer.'
}

export async function getFamilyArticles(): Promise<FamilyArticle[]> {
  const { data, error } = await client()
    .from('family_articles')
    .select('id, slug, title, body, published_at, category')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true })

  if (error) throw new Error(explainError(error))
  return data ?? []
}

export async function getFamilyArticle(slug: string): Promise<FamilyArticle | null> {
  const { data, error } = await client()
    .from('family_articles')
    .select('id, slug, title, body, published_at, category')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(explainError(error))
  return data
}

export async function getFamilyDocuments(): Promise<FamilyDocument[]> {
  const { data, error } = await client()
    .from('family_documents')
    .select('id, title, storage_path, year, mime_type, article_id')
    .order('year', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true })

  if (error) throw new Error(explainError(error))
  return data ?? []
}

export function isImageDocument(document: FamilyDocument) {
  return document.mime_type !== null && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(document.mime_type)
}

const DOWNLOAD_ONLY_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export function isDownloadOnlyDocument(document: FamilyDocument) {
  return document.mime_type !== null && DOWNLOAD_ONLY_TYPES.includes(document.mime_type)
}

export async function getFamilyDocumentUrl(storagePath: string, expiresIn = 60, download = false): Promise<string> {
  const storage = client().storage.from('family-archives')
  const { data, error } = await storage.createSignedUrl(storagePath, expiresIn, download ? { download: true } : undefined)
  if (error) throw new Error(explainError(error))
  if (!data?.signedUrl) throw new Error('Le lien temporaire du document n’a pas pu être créé.')
  return data.signedUrl
}
