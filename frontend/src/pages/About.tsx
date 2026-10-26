import { Link } from 'react-router-dom'
import { ContentCard, ContentPage } from '../components/ContentPage'
import housePhoto from '../assets/bicoque-house.jpg'

export default function About() {
  return (
    <ContentPage
      title="À propos"
      intro="La Bicoque est liée à la Société des Bicoquins et à une maison familiale partagée en indivision."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <ContentCard>
          <h2 className="mb-3 text-2xl font-semibold">La Société des Bicoquins</h2>
          <p className="leading-relaxed text-slate-600">
            Cet espace rassemble les informations de la Société des Bicoquins et les archives familiales
            liées à la maison.
          </p>
        </ContentCard>
        <ContentCard>
          <h2 className="mb-3 text-2xl font-semibold">La maison</h2>
          <img src={housePhoto} alt="La Bicoque, maison à colombages entourée de verdure"
            width={300} height={200} className="mb-4 max-w-full rounded-xl" loading="lazy" />
          <p className="leading-relaxed text-slate-600">
            La maison est détenue en indivision. Elle se trouve au 54, rue de Spa, à Stavelot.
          </p>
        </ContentCard>
      </div>
      <nav aria-label="Découvrir les archives" className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
        <Link className="font-medium text-indigo-800 underline underline-offset-4" to="/histoires">Parcourir les histoires</Link>
        <Link className="font-medium text-indigo-800 underline underline-offset-4" to="/documents">Consulter les documents</Link>
      </nav>
    </ContentPage>
  )
}
