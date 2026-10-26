import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section className="mx-auto max-w-6xl py-3 sm:py-6">
      <div className="home-hero relative flex overflow-hidden rounded-[1.75rem] shadow-[0_28px_80px_rgba(48,52,37,0.2)] sm:rounded-[2.25rem]">
        <img
          className="home-hero-image"
          src="https://lh3.googleusercontent.com/gps-cs-s/ANWiy9RBKN9hMruiYyLDBsfD9SIJ4Ds0_Fi68DWLIg--lonDKDaQTgaSv7nmo7rZ6v-HrjRYoD369e4zXD_ujX77JLA1WS4u-wjHJvDY_1ATlzOtWoA8XMrghxdqaJlcEcMD9npi3VZq=s680-w680-h510-rw"
          alt="Paysage enneigé au coucher du soleil, autour de La bicoque"
          width="680"
          height="510"
          fetchPriority="high"
        />
        <div className="mx-auto flex w-full max-w-6xl items-end px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <div className="max-w-2xl text-white">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#f5dfb1] backdrop-blur-sm sm:text-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#e6b56e]" />
              La Société des Bicoquins
            </p>
            <h1 className="mb-5 font-serif text-5xl font-medium leading-[0.98] tracking-tight drop-shadow sm:text-7xl lg:text-8xl">
              La bicoque
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-white/90 sm:text-xl">
              Un lieu familial à Stavelot, détenu en indivision, et des archives à transmettre.
              Découvrez la maison, les récits et les documents partagés.
            </p>
            <Link
              to="/a-propos"
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#f6f0df] px-6 py-3.5 font-semibold text-[#34462f] shadow-lg transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Découvrir la maison
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <p className="absolute bottom-5 right-6 hidden rounded-full border border-white/30 bg-black/20 px-4 py-2 text-xs font-medium tracking-wide text-white/90 backdrop-blur-sm sm:block">
          La campagne, au fil des saisons
        </p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-3 sm:gap-5">
        <article className="home-feature rounded-2xl p-5 sm:p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Le lieu</p>
          <h2 className="font-serif text-xl font-semibold text-slate-800">Au 54, rue de Spa</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">La maison familiale est située à Stavelot et détenue en indivision.</p>
        </article>
        <article className="home-feature rounded-2xl p-5 sm:p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Ensemble</p>
          <h2 className="font-serif text-xl font-semibold text-slate-800">La Société des Bicoquins</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Un espace pour retrouver les informations et l’histoire familiale autour de la maison.</p>
        </article>
        <article className="home-feature rounded-2xl p-5 sm:p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Archives</p>
          <h2 className="font-serif text-xl font-semibold text-slate-800">Récits et documents</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Les pages d’archives s’enrichiront au fil des imports de contenu familial.</p>
          <Link to="/histoires" className="mt-3 inline-flex font-medium text-indigo-800 underline underline-offset-4">Parcourir les histoires</Link>
        </article>
      </div>
    </section>
  )
}
