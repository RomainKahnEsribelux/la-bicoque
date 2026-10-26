import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContentCard, ContentMessage, ContentPage } from '../components/ContentPage'
import { getFamilyArticle } from '../lib/familyContent'
import type { FamilyArticle } from '../lib/familyContent'

export default function StoryDetail() {
  const { slug = '' } = useParams()
  const [article, setArticle] = useState<FamilyArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) { setLoading(true); setError(null); setArticle(null) }
      return getFamilyArticle(slug)
    })
      .then(item => { if (active) setArticle(item) })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger ce récit.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug])

  return (
    <ContentPage title={article?.title ?? 'Récit familial'}>
      <div className="mb-5"><Link className="font-medium text-indigo-800 underline underline-offset-4" to="/histoires">← Toutes les histoires</Link></div>
      {loading && <ContentMessage>Chargement du récit…</ContentMessage>}
      {error && <ContentMessage role="alert">{error} Connectez-vous avec un compte vérifié pour consulter les archives.</ContentMessage>}
      {!loading && !error && !article && (
        <ContentCard>
          <h2 className="mb-2 text-xl font-semibold">Récit introuvable</h2>
          <p className="text-slate-600">Ce récit n’est pas publié ou n’existe pas encore.</p>
        </ContentCard>
      )}
      {article && !error && (
        <ContentCard>
          {article.category && <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700">{article.category}</p>}
          <div className="whitespace-pre-wrap leading-8 text-slate-700">{article.body}</div>
          {article.published_at && (
            <p className="mt-7 border-t border-slate-200 pt-4 text-sm text-slate-500">
              Publié le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(article.published_at))}
            </p>
          )}
        </ContentCard>
      )}
    </ContentPage>
  )
}
