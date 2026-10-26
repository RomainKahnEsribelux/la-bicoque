import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(fileURLToPath(import.meta.url))
const script = path.resolve(testsDir, '..', '..', 'supabase', 'scripts', 'import-family-content.mjs')
let root

function run(...args) {
  const env = { ...process.env }
  delete env.SUPABASE_URL
  delete env.SUPABASE_SERVICE_ROLE_KEY
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

async function fixture(name, manifest, files = {}) {
  const dir = path.join(root, name)
  await mkdir(path.join(dir, 'media'), { recursive: true })
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  const manifestPath = path.join(dir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return manifestPath
}

function failure(result) {
  assert.equal(result.status, 1)
  return JSON.parse(result.stderr)
}

const article = { slug: 'test-article', title: 'Test', body: 'Plain text body.', source_url: 'https://example.test/a' }
const doc = (localPath, extra = {}) => ({ title: 'Doc', local_path: localPath, source_url: 'https://example.test/d', ...extra })

describe('import-family-content CLI', () => {
  before(async () => {
    root = await mkdtemp(path.join(testsDir, '.import-fixtures-'))
  })

  after(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('prints help', () => {
    const result = run('--help')
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /--apply/)
    assert.match(result.stdout, /local_path/)
  })

  test('dry-run validates without writing or needing credentials', async () => {
    const manifest = await fixture('dry-run', {
      articles: [{ ...article, published_at: '1950-06-01', category: 'Histoire' }],
      documents: [doc('media/photo.png', { year: 1950, article_slug: 'test-article', mime_type: 'image/png' })],
    }, { 'media/photo.png': Buffer.from([137, 80, 78, 71]) })
    const result = run(manifest)
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.mode, 'dry-run')
    assert.equal(output.bucket, 'family-archives')
    assert.equal(output.articles[0].slug, 'test-article')
    assert.match(output.documents[0].storage_path, /^documents\/[0-9a-f]{24}\/photo\.png$/)
    assert.doesNotMatch(result.stdout, /https:\/\/example\.test/)
  })

  test('--apply refuses to run without server credentials', async () => {
    const manifest = await fixture('apply', { articles: [article] })
    assert.match(failure(run(manifest, '--apply')).error, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/)
  })

  test('rejects missing files', async () => {
    const manifest = await fixture('missing', { documents: [doc('media/absent.pdf')] })
    assert.match(failure(run(manifest)).details.join('\n'), /local_path does not exist/)
  })

  test('rejects path traversal and absolute paths', async () => {
    await writeFile(path.join(root, 'outside.pdf'), 'outside')
    const manifest = await fixture('traversal', {
      documents: [
        doc('../outside.pdf'),
        doc(path.join(root, 'outside.pdf')),
        doc('media/a.pdf', { storage_path: 'documents/../a.pdf' }),
      ],
    }, { 'media/a.pdf': '%PDF-1.4' })
    const details = failure(run(manifest)).details.join('\n')
    assert.match(details, /documents\[0\]\.local_path resolves outside the manifest directory/)
    assert.match(details, /documents\[1\]\.local_path must be relative/)
    assert.match(details, /documents\[2\]\.storage_path must be documents\//)
  })

  test('requires HTTPS source URLs', async () => {
    const manifest = await fixture('https', {
      articles: [{ ...article, source_url: 'http://example.test/a' }],
      documents: [doc('media/a.pdf', { source_url: 'https://user:secret@example.test/d' })],
    }, { 'media/a.pdf': '%PDF-1.4' })
    const details = failure(run(manifest)).details.join('\n')
    assert.match(details, /articles\[0\]\.source_url must use HTTPS/)
    assert.match(details, /documents\[0\]\.source_url must not contain credentials/)
  })

  test('rejects HTML in bodies and titles', async () => {
    const manifest = await fixture('html', {
      articles: [
        { ...article, body: '<p>Hello</p>' },
        { ...article, slug: 'second', title: '<b>Bold</b>' },
        { ...article, slug: 'third', body: undefined, body_file: 'texts/body.txt' },
      ],
    }, { 'texts/body.txt': 'Text with <script>alert(1)</script>' })
    const details = failure(run(manifest)).details.join('\n')
    assert.match(details, /articles\[0\]\.body contains HTML markup/)
    assert.match(details, /articles\[1\]\.title contains HTML markup/)
    assert.match(details, /articles\[2\]\.body_file contains HTML markup/)
  })

  test('rejects invalid media types, empty files and mismatched mime types', async () => {
    const manifest = await fixture('media', {
      documents: [
        doc('media/run.exe'),
        doc('media/empty.pdf'),
        doc('media/photo.jpg', { mime_type: 'image/png' }),
        doc('media/photo.jpg', { storage_path: 'documents/photo.png' }),
      ],
    }, { 'media/run.exe': 'MZ', 'media/empty.pdf': '', 'media/photo.jpg': 'jpg' })
    const details = failure(run(manifest)).details.join('\n')
    assert.match(details, /documents\[0\]\.local_path type \.exe is not allowed/)
    assert.match(details, /documents\[1\]\.local_path is empty/)
    assert.match(details, /documents\[2\]\.mime_type must be image\/jpeg/)
    assert.match(details, /documents\[3\]\.storage_path extension must be \.jpg/)
  })

  test('accepts legacy Office documents', async () => {
    const manifest = await fixture('office', {
      documents: [
        doc('media/minutes.doc', { mime_type: 'application/msword' }),
        doc('media/report.docx'),
        doc('media/accounts.xlsx', { storage_path: 'documents/ag/accounts.xlsx' }),
      ],
    }, { 'media/minutes.doc': 'doc', 'media/report.docx': 'docx', 'media/accounts.xlsx': 'xlsx' })
    const result = run(manifest)
    assert.equal(result.status, 0, result.stderr)
    const types = JSON.parse(result.stdout).documents.map(item => item.mime_type)
    assert.deepEqual(types, [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])
  })
})