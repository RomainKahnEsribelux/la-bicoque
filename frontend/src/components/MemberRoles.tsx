import { useState } from 'react'
import { branches } from '../lib/family'
import { workflowAction } from '../lib/memberWorkflows'
import type { ManagedMember } from '../lib/management'

export default function MemberRoles({ members, generalAdmin, onChanged }: {
  members: ManagedMember[]; generalAdmin: boolean; onChanged: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [change, setChange] = useState<{ member: ManagedMember; kind: 'general' | 'branch'; enabled: boolean; previous: ManagedMember | null } | null>(null)
  const [reason, setReason] = useState('')
  const filtered = members.filter(member =>
    `${member.first_name} ${member.last_name} ${member.email}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr'))
    && (!branchFilter || member.branch === branchFilter)
    && (!roleFilter || (roleFilter === 'general' ? member.general_admin : roleFilter === 'manager' ? !!member.managed_branch : !member.general_admin && !member.managed_branch)))
  const holder = change?.previous
  function prepare(member: ManagedMember, kind: 'general' | 'branch', enabled: boolean) {
    setChange({ member, kind, enabled, previous: kind === 'branch' ? members.find(m => m.managed_branch === member.branch) ?? null : null })
    setReason(''); setError(null); setNotice(null)
  }
  async function save() {
    if (!change || busy) return
    setBusy(true); setError(null)
    try {
      if (change.kind === 'general') {
        await workflowAction('set_general_administrator', { p_user_id: change.member.user_id, p_enabled: change.enabled, p_reason: reason.trim() })
      } else {
        await workflowAction('set_branch_manager', {
          p_branch: change.member.branch, p_user_id: change.enabled ? change.member.user_id : null,
          p_expected_user_id: holder?.user_id ?? null, p_reason: reason.trim(),
        })
      }
      setChange(null)
      await onChanged()
      setNotice('Rôles mis à jour et changement enregistré dans l’historique.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-2xl bg-white/85 p-6">
    <h2 className="text-xl font-semibold">Rôles dans la liste des membres</h2>
    <p>Deux admins généraux maximum, invitations en attente comprises. Un responsable par branche ; un admin général peut cumuler. Les responsables gèrent toutes les réservations, paiements, paramètres et blocages, quelle que soit la branche.</p>
    <ul className="space-y-1">{Object.entries(branches).map(([key, label]) => {
      const current = members.find(m => m.managed_branch === key)
      return <li key={key}><strong>{label}</strong> : {current ? `${current.first_name} ${current.last_name}` : 'À désigner'}</li>
    })}</ul>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {notice && <p role="status" className="text-green-900">{notice}</p>}
    <div className="flex flex-wrap gap-3">
      <label className="grid gap-1">Rechercher un membre<input className="rounded border p-2" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="grid gap-1">Branche du membre<select className="rounded border p-2" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
        <option value="">Toutes</option>{Object.entries(branches).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="grid gap-1">Rôle du membre<select className="rounded border p-2" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
        <option value="">Tous</option><option value="general">Admin général</option><option value="manager">Responsable de branche</option><option value="member">Membre sans rôle de gestion</option>
      </select></label>
    </div>
    <p>{filtered.length} membre(s)</p>
    <ul className="space-y-4">{filtered.map(member => <li className="space-y-2 border-t pt-3" key={member.user_id}>
      <p className="break-all font-medium">{member.first_name || 'Profil à compléter'} {member.last_name} · {member.email}</p>
      <p>Branche : {member.branch ? branches[member.branch] : 'À compléter'} · {member.general_admin ? 'Admin général' : 'Membre'}
        {member.managed_branch && ` · Responsable ${branches[member.managed_branch]}`}</p>
      <div className="flex flex-wrap gap-4">
        {generalAdmin && <button className="underline" disabled={busy} onClick={() => prepare(member, 'general', !member.general_admin)}>{member.general_admin ? 'Retirer admin général' : 'Nommer admin général'}</button>}
        {member.branch && <button className="underline" disabled={busy} onClick={() => prepare(member, 'branch', !member.managed_branch)}>{member.managed_branch ? 'Retirer la responsabilité de branche' : 'Nommer responsable de sa branche'}</button>}
      </div>
    </li>)}</ul>
    {change && <form className="space-y-3 rounded-xl border border-amber-400 bg-amber-50 p-4" onSubmit={e => { e.preventDefault(); void save() }}>
      <h3 className="font-semibold">Confirmer le changement de rôle</h3>
      <p>{change.enabled ? 'Attribuer' : 'Retirer'} le rôle {change.kind === 'general' ? 'admin général' : `responsable ${branches[change.member.branch ?? '']}`}
        {' '}à {change.member.first_name} {change.member.last_name} ({change.member.email}).</p>
      {change.kind === 'branch' && change.enabled && holder && <p className="font-semibold">Remplacement : {holder.first_name} {holder.last_name} perdra sa responsabilité de cette branche. Ses autres rôles seront conservés.</p>}
      <label className="block">Motif obligatoire<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded border p-3" /></label>
      <button disabled={busy || !reason.trim()} className="mr-4 rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">Confirmer le changement</button>
      <button type="button" disabled={busy} className="underline" onClick={() => setChange(null)}>Annuler</button>
    </form>}
  </section>
}
