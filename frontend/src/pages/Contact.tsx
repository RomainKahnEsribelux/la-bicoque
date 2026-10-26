import { ContentCard, ContentPage } from '../components/ContentPage'

export default function Contact() {
  return (
    <ContentPage title="Contact" intro="Cette page sera complétée lorsque les coordonnées de contact auront été définies.">
      <ContentCard>
        <h2 className="mb-2 text-xl font-semibold">Coordonnées à venir</h2>
        <p className="text-slate-600">Aucune adresse e-mail, aucun numéro de téléphone ni formulaire de contact n’a encore été communiqué.</p>
      </ContentCard>
    </ContentPage>
  )
}
