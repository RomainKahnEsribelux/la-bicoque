import { useEffect, useState } from 'react'
import { ContentPage } from '../components/ContentPage'
import { directionsUrl, getPracticalGuides } from '../lib/memberWorkflows'
import type { PracticalGuide } from '../lib/memberWorkflows'

export default function PracticalStay() {
  const [guides, setGuides] = useState<PracticalGuide[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getPracticalGuides().then(data => { if (active) setGuides(data) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.') })
    return () => { active = false }
  }, [])
  return <ContentPage title="Préparer et terminer mon séjour" intro="Fiche privée pour les membres ayant confirmé leur adresse e-mail.">
    <div className="mb-6 flex flex-wrap gap-5 print:hidden">
      <a className="underline" href={directionsUrl} target="_blank" rel="noreferrer">Itinéraire Google Maps</a>
      <button className="underline" onClick={() => window.print()}>Imprimer la fiche</button>
    </div>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!error && guides === null && <p role="status">Chargement...</p>}
    {guides?.length === 0 && <p>Les consignes sont en cours de préparation. Contacte un administrateur pour les informations actuelles.</p>}
    <div className="space-y-6">{guides?.map(guide => <section key={guide.slug} className="rounded-2xl bg-white/85 p-6">
      <h2 className="mb-4 text-xl font-semibold">{guide.title}</h2>
      {guide.body.split('\n').filter(Boolean).map((line, index) => <label key={index} className="mb-3 flex items-start gap-3">
        <input type="checkbox" className="mt-1" /><span>{line}</span>
      </label>)}
    </section>)}</div>
    <p className="mt-6 text-sm">Synthèse de documents d’octobre 2020. Les détails techniques, contacts, horaires de collecte et tarifs doivent être confirmés par la gestion. Les cases sont une aide locale et ne sont pas enregistrées.</p>
  </ContentPage>
}
