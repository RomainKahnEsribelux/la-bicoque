import { ContentCard, ContentPage } from '../components/ContentPage'
import { directionsUrl } from '../lib/memberWorkflows'

export default function Contact() {
  return (
    <ContentPage title="Contact" intro="Cette page sera complétée lorsque les coordonnées de contact auront été définies.">
      <ContentCard>
        <h2 className="mb-2 text-xl font-semibold">Venir à La Bicoque</h2>
        <p>54, rue de Spa · 4970 Stavelot · Belgique</p>
        <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block underline">Calculer mon itinéraire avec Google Maps</a>
      </ContentCard>
      <ContentCard>
        <h2 className="mb-2 text-xl font-semibold">Coordonnées à venir</h2>
        <p className="text-slate-600">Aucune adresse e-mail, aucun numéro de téléphone ni formulaire de contact n’a encore été communiqué.</p>
      </ContentCard>
    </ContentPage>
  )
}
