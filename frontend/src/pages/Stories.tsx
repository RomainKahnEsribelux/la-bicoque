import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContentCard, ContentMessage, ContentPage } from '../components/ContentPage'
import { getFamilyArticles } from '../lib/familyContent'
import type { FamilyArticle } from '../lib/familyContent'

export default function Stories() {
  const [articles, setArticles] = useState<FamilyArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getFamilyArticles()
      .then(items => { if (active) setArticles(items) })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les histoires.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <ContentPage title="Histoires" intro="Récits familiaux et repères partagés autour de la maison.">
      {loading && <ContentMessage>Chargement des histoires…</ContentMessage>}
      {error && <ContentMessage role="alert">{error} Connectez-vous avec un compte vérifié pour consulter les archives.</ContentMessage>}
      {!loading && !error && articles.length === 0 && (
        <ContentCard>
          <h2 className="mb-2 text-xl font-semibold">Aucun récit publié</h2>
          <p className="text-slate-600">Les histoires sont en attente d’import. Aucun contenu historique n’a été ajouté pour le moment.</p>
        </ContentCard>
      )}
      {!error && articles.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {articles.map(article => (
            <li key={article.id}>
              <ContentCard>
                {article.category && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">{article.category}</p>}
                <h2 className="mb-3 text-2xl font-semibold">
                  <Link className="hover:underline" to={`/histoires/${encodeURIComponent(article.slug)}`}>{article.title}</Link>
                </h2>
                <p className="line-clamp-4 whitespace-pre-line leading-relaxed text-slate-600">{article.body}</p>
                <Link className="mt-4 inline-flex font-medium text-indigo-800 underline underline-offset-4" to={`/histoires/${encodeURIComponent(article.slug)}`}>
                  Lire le récit
                </Link>
              </ContentCard>
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  )
}
