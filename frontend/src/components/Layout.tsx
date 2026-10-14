import { Link, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <header className="bg-white shadow-sm">
        <nav className="mx-auto max-w-5xl flex items-center justify-between p-4">
          <Link to="/" className="text-xl font-bold">Mon site</Link>
          <div className="flex gap-6">
            <Link to="/" className="hover:text-indigo-600">Accueil</Link>
            <Link to="/reservation" className="hover:text-indigo-600">Réservation</Link>
          </div>
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl p-4">
        <Outlet />
      </main>
      <footer className="text-center text-sm text-slate-500 p-4">© {new Date().getFullYear()}</footer>
    </div>
  )
}
