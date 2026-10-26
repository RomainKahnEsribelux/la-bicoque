import { useEffect, useState } from 'react'
import { ContentCard, ContentMessage, ContentPage } from '../components/ContentPage'
import { getFamilyDocuments, getFamilyDocumentUrl, isDownloadOnlyDocument, isImageDocument } from '../lib/familyContent'
import type { FamilyDocument } from '../lib/familyContent'

export default function Documents() {
  const [documents, setDocuments] = useState<FamilyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    void getFamilyDocuments()
      .then(items => { if (active) setDocuments(items) })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les documents.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function openDocument(document: FamilyDocument) {
    if (isImageDocument(document) && previews[document.id]) {
      setPreviews(current => {
        const next = { ...current }
        delete next[document.id]
        return next
      })
      return
    }
    setOpeningId(document.id)
    setError(null)
    try {
      if (isImageDocument(document)) {
        const url = await getFamilyDocumentUrl(document.storage_path, 300)
        setPreviews(current => ({ ...current, [document.id]: url }))
        return
      }
      if (isDownloadOnlyDocument(document)) {
        window.location.assign(await getFamilyDocumentUrl(document.storage_path, 60, true))
        return
      }
      const url = await getFamilyDocumentUrl(document.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Impossible de créer un lien temporaire pour ce document.')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <ContentPage title="Documents" intro="Documents d’archives accessibles aux membres disposant d’un compte vérifié.">
      {loading && <ContentMessage>Chargement des documents…</ContentMessage>}
      {error && <ContentMessage role="alert">{error} Connectez-vous avec un compte vérifié pour consulter les archives.</ContentMessage>}
      {!loading && !error && documents.length === 0 && (
        <ContentCard>
          <h2 className="mb-2 text-xl font-semibold">Aucun document disponible</h2>
          <p className="text-slate-600">Les documents sont en attente d’import. Aucun document ni contenu historique fictif n’est affiché.</p>
        </ContentCard>
      )}
      {!error && documents.length > 0 && (
        <ul className="space-y-3">
          {documents.map(document => (
            <li key={document.id}>
              <ContentCard>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{document.title}</h2>
                    {document.year !== null && <p className="mt-1 text-sm text-slate-500">{document.year}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={openingId !== null}
                    onClick={() => void openDocument(document)}
                    className="rounded-full bg-[#34462f] px-5 py-2.5 font-medium text-white transition hover:bg-[#2b3928] disabled:opacity-60"
                  >
                    {openingId === document.id
                      ? 'Préparation…'
                      : isImageDocument(document)
                        ? previews[document.id] ? 'Masquer l’image' : 'Afficher l’image'
                        : isDownloadOnlyDocument(document) ? 'Télécharger le document' : 'Ouvrir le document'}
                  </button>
                </div>
                {previews[document.id] && (
                  <img
                    src={previews[document.id]}
                    alt={document.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="mt-5 max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain"
                    onError={() => setError('L’image n’a pas pu être affichée. Le lien temporaire a peut-être expiré.')}
                  />
                )}
              </ContentCard>
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  )
}
