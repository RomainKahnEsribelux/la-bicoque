import { ContentCard, ContentPage } from '../components/ContentPage'

const walks = [
  { title: 'Promenades et randonnées', url: 'https://tourismestavelot.be/fr/pied',
    description: 'Les possibilités de marche et les parcours balisés autour de Stavelot, Coo et Francorchamps, présentés par l’office de tourisme.' },
  { title: 'Voies RAVeL', url: 'https://tourismestavelot.be/fr/ravel',
    description: 'Découvre les voies vertes de la région et prépare une sortie adaptée à ton groupe.' },
]
export default function Activities() {
  return <ContentPage title="Activités autour de Stavelot" intro="Quelques pistes pour profiter de la région pendant votre séjour à La Bicoque.">
    <nav aria-label="Sections des activités" className="mb-6 flex flex-wrap gap-5">
      <a className="underline" href="#cinema">Cinéma Le Versailles</a>
      <a className="underline" href="#balades">Balades dans la région</a>
    </nav>
    <section id="cinema" className="mb-8 scroll-mt-6">
      <ContentCard>
        <h2 className="mb-3 text-2xl font-semibold">Cinéma Le Versailles</h2>
        <p>Pour une sortie cinéma à Stavelot, retrouve les films et les séances sur la programmation officielle, actualisée par le cinéma.</p>
        <a className="mt-4 inline-block rounded-xl bg-indigo-700 px-5 py-3 text-white" href="https://www.cinemaleversailles.be/programme" target="_blank" rel="noopener noreferrer">Voir la programmation officielle</a>
        <p className="mt-3 text-sm text-slate-600">Le site du cinéma ne permet pas l’affichage intégré sur un autre site. Le programme s’ouvre dans un nouvel onglet.</p>
      </ContentCard>
    </section>
    <section id="balades" className="scroll-mt-6">
      <h2 className="mb-4 text-2xl font-semibold">Balades dans la région</h2>
      <div className="grid gap-5 md:grid-cols-2">{walks.map(walk => <ContentCard key={walk.url}>
        <h3 className="mb-3 text-xl font-semibold">{walk.title}</h3>
        <p>{walk.description}</p>
        <a className="mt-4 inline-block underline" href={walk.url} target="_blank" rel="noopener noreferrer">Découvrir : {walk.title.toLowerCase()}</a>
      </ContentCard>)}</div>
      <p className="mt-5 rounded-xl bg-amber-50 p-4">Avant de partir, vérifie les conditions, les éventuelles fermetures et la signalisation locale.
        Consulte aussi les <a className="underline" href="https://www.chasseonweb.be/" target="_blank" rel="noopener noreferrer">informations officielles sur les périodes de chasse</a>.</p>
    </section>
  </ContentPage>
}
