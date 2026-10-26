import type { ReactNode } from 'react'

export function ContentPage({
  eyebrow = 'La bicoque · Archives familiales',
  title,
  intro,
  children,
}: {
  eyebrow?: string
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section className="mx-auto max-w-5xl py-5 sm:py-8">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-indigo-700">{eyebrow}</p>
      <h1 className="mb-4 text-4xl font-semibold sm:text-5xl">{title}</h1>
      {intro && <p className="mb-8 max-w-3xl text-lg leading-relaxed text-slate-600">{intro}</p>}
      {children}
    </section>
  )
}

export function ContentCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.06)]">
      {children}
    </div>
  )
}

export function ContentMessage({
  children,
  role = 'status',
}: {
  children: ReactNode
  role?: 'alert' | 'status'
}) {
  return <p role={role} className={role === 'alert' ? 'text-red-700' : 'text-slate-600'}>{children}</p>
}
