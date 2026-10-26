#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BUCKET = 'family-archives'
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_BODY_CHARS = 200_000
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const HELP = `Import authorized family archive content into private Supabase storage and tables.

Usage:
  node supabase/scripts/import-family-content.mjs <manifest.json> [--apply]
  node supabase/scripts/import-family-content.mjs --help

Default mode is a dry run: the whole manifest and every local file are validated
and the planned writes are printed. Nothing is written unless --apply is given.

--apply requires server-only environment variables (never put them in frontend env files):
  SUPABASE_URL                HTTPS project URL
  SUPABASE_SERVICE_ROLE_KEY   service role key

Keep the manifest and media outside the repository. File paths are relative to the
manifest directory and may not resolve outside it (symlinks included).

Manifest (JSON):
{
  "articles": [{
    "slug": "lowercase-slug",          required, unique, [a-z0-9-]
    "title": "Title",                  required, plain text
    "body": "Plain text...",           plain text, OR
    "body_file": "texts/article.txt",  UTF-8 plain-text .txt file (exactly one of body/body_file)
    "published_at": "1950-06-01",      optional ISO date or date-time
    "category": "Category",            optional
    "source_url": "https://..."        required HTTPS provenance (stored, never rendered)
  }],
  "documents": [{
    "title": "Title",                  required
    "local_path": "media/scan.jpg",    required, relative: jpg, jpeg, png, webp, gif, pdf, txt, doc, docx, xlsx (max 50 MB)
    "storage_path": "documents/x.jpg", optional; default documents/<sha256-prefix>/<safe-file-name>;
                                       if given: documents/ + [a-z0-9._-] segments, same extension
    "mime_type": "image/jpeg",         optional; must equal the type implied by the extension
    "year": 1950,                      optional integer
    "article_slug": "lowercase-slug",  optional, must match an article in this manifest
    "source_url": "https://..."        required HTTPS provenance
  }]
}

Files are uploaded only to the private "${BUCKET}" bucket at the stable storage_path.
Articles are upserted by slug, documents by storage_path. Bodies are stored as plain
text; HTML markup is rejected. Output lists slugs, paths and ids only, never secrets.`

function fail(message) {
  throw new Error(message)
}

function text(value, field, max, required = true) {
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`)
    return null
  }
  if (typeof value !== 'string') fail(`${field} must be a string`)
  const trimmed = value.trim()
  if (required && !trimmed) fail(`${field} must not be empty`)
  if (trimmed.length > max) fail(`${field} exceeds ${max} characters`)
  if (CONTROL_CHARS.test(trimmed)) fail(`${field} contains control characters`)
  if (/<\/?[a-z!][^>]*>/i.test(trimmed)) fail(`${field} contains HTML markup`)
  return trimmed || null
}

function httpsUrl(value, field) {
  const raw = text(value, field, 2000)
  let url
  try {
    url = new URL(raw)
  } catch {
    fail(`${field} must be a valid URL`)
  }
  if (url.protocol !== 'https:') fail(`${field} must use HTTPS`)
  if (url.username || url.password) fail(`${field} must not contain credentials`)
  return url.toString()
}

function plainBody(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be non-empty plain text`)
  const body = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (body.length > MAX_BODY_CHARS) fail(`${field} exceeds ${MAX_BODY_CHARS} characters`)
  if (/<\/?[a-z!][^>]*>/i.test(body)) fail(`${field} contains HTML markup; provide plain text`)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) fail(`${field} contains control characters`)
  return body
}

async function localFile(baseDir, relativePath, field) {
  const raw = text(relativePath, field, 1000)
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw) || /^[a-z]:/i.test(raw)) {
    fail(`${field} must be relative to the manifest directory`)
  }
  let real
  try {
    real = await realpath(path.resolve(baseDir, raw))
  } catch {
    fail(`${field} does not exist: ${raw}`)
  }
  const relative = path.relative(baseDir, real)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${field} resolves outside the manifest directory`)
  }
  const info = await stat(real)
  if (!info.isFile()) fail(`${field} is not a regular file`)
  if (info.size === 0) fail(`${field} is empty`)
  if (info.size > MAX_FILE_BYTES) fail(`${field} exceeds ${MAX_FILE_BYTES} bytes`)
  return { real, display: relative.split(path.sep).join('/'), size: info.size }
}

function safeName(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  const stem = path.basename(fileName, path.extname(fileName))
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return `${stem || 'document'}${ext}`
}

function onlyKeys(item, at, allowed) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${at} must be an object`)
  for (const key of Object.keys(item)) if (!allowed.includes(key)) fail(`${at}.${key} is not supported`)
}

async function validateManifest(manifestPath) {
  let manifestReal
  try {
    manifestReal = await realpath(path.resolve(manifestPath))
  } catch {
    fail(`Manifest not found: ${manifestPath}`)
  }
  const baseDir = path.dirname(manifestReal)
  let manifest
  try {
    manifest = JSON.parse((await readFile(manifestReal, 'utf8')).replace(/^\uFEFF/, ''))
  } catch (error) {
    fail(`Manifest is not valid JSON: ${error.message}`)
  }
  onlyKeys(manifest, 'manifest', ['articles', 'documents'])
  const rawArticles = manifest.articles ?? []
  const rawDocuments = manifest.documents ?? []
  if (!Array.isArray(rawArticles) || !Array.isArray(rawDocuments)) fail('articles and documents must be arrays')
  if (rawArticles.length + rawDocuments.length === 0) fail('Manifest contains no articles or documents')

  const errors = []
  const articles = []
  const slugs = new Set()
  for (const [index, item] of rawArticles.entries()) {
    const at = `articles[${index}]`
    try {
      onlyKeys(item, at, ['slug', 'title', 'body', 'body_file', 'published_at', 'category', 'source_url'])
      const slug = text(item.slug, `${at}.slug`, 160)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`${at}.slug must use lowercase letters, digits and single hyphens`)
      if (slugs.has(slug)) fail(`${at}.slug duplicates "${slug}"`)
      slugs.add(slug)
      if ((item.body === undefined) === (item.body_file === undefined)) fail(`${at} needs exactly one of body or body_file`)
      let body
      if (item.body_file !== undefined) {
        const file = await localFile(baseDir, item.body_file, `${at}.body_file`)
        if (path.extname(file.real).toLowerCase() !== '.txt') fail(`${at}.body_file must be a .txt file`)
        body = plainBody(await readFile(file.real, 'utf8'), `${at}.body_file`)
      } else {
        body = plainBody(item.body, `${at}.body`)
      }
      let publishedAt = null
      if (item.published_at !== undefined && item.published_at !== null) {
        const raw = text(item.published_at, `${at}.published_at`, 40)
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)
        const parsed = new Date(dateOnly ? `${raw}T00:00:00Z` : raw)
        if ((!dateOnly && !dateTime) || Number.isNaN(parsed.getTime())) fail(`${at}.published_at must be an ISO date or date-time with timezone`)
        publishedAt = parsed.toISOString()
      }
      articles.push({
        slug,
        title: text(item.title, `${at}.title`, 300),
        body,
        published_at: publishedAt,
        category: text(item.category, `${at}.category`, 100, false),
        source_url: httpsUrl(item.source_url, `${at}.source_url`),
      })
    } catch (error) {
      errors.push(error.message)
    }
  }

  const documents = []
  const paths = new Set()
  for (const [index, item] of rawDocuments.entries()) {
    const at = `documents[${index}]`
    try {
      onlyKeys(item, at, ['title', 'local_path', 'storage_path', 'year', 'article_slug', 'source_url', 'mime_type'])
      const file = await localFile(baseDir, item.local_path, `${at}.local_path`)
      const ext = path.extname(file.real).toLowerCase()
      const mimeType = MIME_TYPES[ext]
      if (!mimeType) fail(`${at}.local_path type ${ext || '(none)'} is not allowed`)
      if (item.mime_type !== undefined && item.mime_type !== null && item.mime_type !== mimeType) {
        fail(`${at}.mime_type must be ${mimeType} for ${ext} files`)
      }
      const content = await readFile(file.real)
      const digest = createHash('sha256').update(content).digest('hex')
      let storagePath = `documents/${digest.slice(0, 24)}/${safeName(file.real)}`
      if (item.storage_path !== undefined && item.storage_path !== null) {
        storagePath = text(item.storage_path, `${at}.storage_path`, 500)
        if (!/^documents(\/[a-z0-9][a-z0-9._-]*)+$/.test(storagePath) || storagePath.includes('..')) {
          fail(`${at}.storage_path must be documents/<segments> of lowercase letters, digits, dot, underscore or hyphen`)
        }
        if (path.posix.extname(storagePath) !== ext) fail(`${at}.storage_path extension must be ${ext}`)
      }
      if (paths.has(storagePath)) fail(`${at}.storage_path duplicates another document in this manifest`)
      paths.add(storagePath)
      let year = null
      if (item.year !== undefined && item.year !== null) {
        if (!Number.isInteger(item.year) || item.year < 1 || item.year > 9999) fail(`${at}.year must be an integer between 1 and 9999`)
        year = item.year
      }
      const articleSlug = text(item.article_slug, `${at}.article_slug`, 160, false)
      if (articleSlug && !slugs.has(articleSlug)) fail(`${at}.article_slug "${articleSlug}" is not an article in this manifest`)
      documents.push({
        title: text(item.title, `${at}.title`, 300),
        storage_path: storagePath,
        year,
        source_url: httpsUrl(item.source_url, `${at}.source_url`),
        mime_type: mimeType,
        article_slug: articleSlug,
        local: file.display,
        size: file.size,
        content,
      })
    } catch (error) {
      errors.push(error.message)
    }
  }

  if (errors.length) {
    const error = new Error(`Manifest validation failed with ${errors.length} error(s); nothing was written`)
    error.details = errors
    throw error
  }
  return { articles, documents }
}

function serverClient() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) fail('--apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    fail('SUPABASE_URL is invalid')
  }
  if (parsed.protocol !== 'https:') fail('SUPABASE_URL must use HTTPS')
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const require = createRequire(path.resolve(scriptDir, '..', '..', 'frontend', 'package.json'))
  let createClient
  try {
    ({ createClient } = require('@supabase/supabase-js'))
  } catch {
    fail('Cannot load @supabase/supabase-js from frontend/node_modules; run npm install in frontend')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

async function apply(plan) {
  const supabase = serverClient()
  const result = { articles: [], documents: [] }
  const articleIds = new Map()

  if (plan.articles.length) {
    const { data, error } = await supabase
      .from('family_articles')
      .upsert(plan.articles, { onConflict: 'slug' })
      .select('id, slug')
    if (error) fail(`Article upsert failed: ${error.message}`)
    for (const row of data ?? []) {
      articleIds.set(row.slug, row.id)
      result.articles.push({ slug: row.slug, id: row.id, status: 'upserted' })
    }
  }

  for (const document of plan.documents) {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(document.storage_path, document.content, {
      contentType: document.mime_type,
      upsert: true,
    })
    if (uploadError) fail(`Upload failed for ${document.local}: ${uploadError.message}`)
    let articleId = null
    if (document.article_slug) {
      articleId = articleIds.get(document.article_slug)
      if (!articleId) fail(`Article id missing for ${document.article_slug}`)
    }
    const { data, error } = await supabase
      .from('family_documents')
      .upsert({
        title: document.title,
        storage_path: document.storage_path,
        year: document.year,
        source_url: document.source_url,
        mime_type: document.mime_type,
        article_id: articleId,
      }, { onConflict: 'storage_path' })
      .select('id, storage_path')
      .single()
    if (error) fail(`Document upsert failed for ${document.local}: ${error.message}`)
    result.documents.push({ local: document.local, id: data.id, storage_path: data.storage_path, status: 'uploaded_and_upserted' })
  }
  return result
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const unknown = args.filter(arg => arg.startsWith('-') && arg !== '--apply')
  if (unknown.length) fail(`Unknown option: ${unknown.join(', ')}`)
  const positional = args.filter(arg => !arg.startsWith('-'))
  if (positional.length !== 1) fail('Provide exactly one manifest path (see --help)')
  const applyWrites = args.includes('--apply')

  const plan = await validateManifest(positional[0])
  if (!applyWrites) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      bucket: BUCKET,
      articles: plan.articles.map(article => ({ slug: article.slug, title: article.title, body_chars: article.body.length })),
      documents: plan.documents.map(document => ({
        local: document.local,
        storage_path: document.storage_path,
        mime_type: document.mime_type,
        bytes: document.size,
        article_slug: document.article_slug,
      })),
      note: 'Validation passed. No writes performed; rerun with --apply.',
    }, null, 2))
    return
  }
  const result = await apply(plan)
  console.log(JSON.stringify({ mode: 'apply', bucket: BUCKET, ...result }, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ error: error.message, details: error.details }, null, 2))
  process.exitCode = 1
})