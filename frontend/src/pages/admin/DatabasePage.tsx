import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Database, KeyRound, Pencil, Search, Trash2, UserRound, Users, X } from 'lucide-react';
import { api } from '../../api';
import type { Role, User } from '../../domain/types';
import { useCurrentUser } from '../../state/session';
import './Management.css';
import './DatabasePage.css';

type Filter = 'ALL' | Role;
type AccountForm = { name: string; email: string; employeeId: string; reportSubAdminId: string; status: 'ACTIVE' | 'DISABLED' };
const labels: Record<Role, string> = { MAIN_ADMIN: 'Super Admin', SUB_ADMIN: 'Sub-Admin', EMPLOYEE: 'Employee' };
const formFrom = (person: User): AccountForm => ({ name: person.name, email: person.email, employeeId: person.employeeId, reportSubAdminId: person.reportSubAdminId || '', status: person.status || 'ACTIVE' });

export default function DatabasePage() {
  const current = useCurrentUser();
  const [people, setPeople] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL'), [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null), [form, setForm] = useState<AccountForm | null>(null);
  const [resetting, setResetting] = useState<User | null>(null), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');

  async function load() { setPeople(await api<User[]>('/admin/database/accounts')); }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, []);
  const managers = people.filter(person => person.role === 'SUB_ADMIN' && person.status === 'ACTIVE');
  const visible = useMemo(() => people.filter(person => {
    const needle = search.trim().toLowerCase();
    return (filter === 'ALL' || person.role === filter) && (!needle || [person.name, person.email, person.employeeId].some(value => value.toLowerCase().includes(needle)));
  }), [people, filter, search]);
  const counts = { ALL: people.length, MAIN_ADMIN: people.filter(person => person.role === 'MAIN_ADMIN').length, SUB_ADMIN: people.filter(person => person.role === 'SUB_ADMIN').length, EMPLOYEE: people.filter(person => person.role === 'EMPLOYEE').length };

  function openEdit(person: User) { setEditing(person); setForm(formFrom(person)); setResetting(null); setError(''); setNotice(''); }
  function openReset(person: User) { setResetting(person); setPassword(''); setEditing(null); setForm(null); setError(''); setNotice(''); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const values: Record<string, string> = { name: form.name, email: form.email, employeeId: form.employeeId };
      if (editing.role === 'EMPLOYEE') values.reportSubAdminId = form.reportSubAdminId;
      if (editing.id !== current.id) values.status = form.status;
      await api(`/admin/database/accounts/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      await load(); setEditing(null); setForm(null); setNotice('Account details saved.');
      if (editing.id === current.id) window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save account.'); }
    finally { setBusy(false); }
  }
  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetting) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/database/accounts/${resetting.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
      await load(); setResetting(null); setPassword('');
      if (resetting.id === current.id) window.location.assign('/login');
      else setNotice('Password changed. This user must set a new password at next sign-in.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change password.'); }
    finally { setBusy(false); }
  }
  async function remove(person: User) {
    if (!window.confirm(`Delete ${person.name} (${person.email})? Their account will be removed. Submitted reports will remain in report history.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/database/accounts/${person.id}`, { method: 'DELETE' });
      await load(); setEditing(null); setResetting(null); setNotice(`${person.name}'s account was deleted.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete account.'); }
    finally { setBusy(false); }
  }

  return <div className="dash database-page">
    <div className="page-head"><div><h2>Database</h2><p>View and manage portal account records.</p></div></div>
    {error && <p className="manage-error" role="alert">{error}</p>}{notice && <p className="manage-state" role="status">{notice}</p>}
    <div className="database-stats"><div><Database size={20} /><span>All accounts</span><strong>{counts.ALL}</strong></div><div><UserRound size={20} /><span>Super admins</span><strong>{counts.MAIN_ADMIN}</strong></div><div><Users size={20} /><span>Sub-admins</span><strong>{counts.SUB_ADMIN}</strong></div><div><Users size={20} /><span>Employees</span><strong>{counts.EMPLOYEE}</strong></div></div>
    <section className="panel glass database-panel"><div className="database-toolbar"><div><h3>Account records</h3><p>Select a record to edit its details or password.</p></div><label className="database-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email or ID" aria-label="Search accounts" /></label></div>
      <div className="database-tabs" role="group" aria-label="Filter accounts">{(['ALL', 'MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] as Filter[]).map(option => <button key={option} type="button" className={filter === option ? 'is-active' : ''} onClick={() => setFilter(option)}>{option === 'ALL' ? 'All' : labels[option]} <span>{counts[option]}</span></button>)}</div>
      <div className="manage-table-wrap"><table className="manage-table database-table"><thead><tr><th>Account</th><th>Role</th><th>Employee ID</th><th>Assigned sub-admin</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{visible.map(person => <tr key={person.id}><td><strong>{person.name}</strong><small>{person.email}</small></td><td>{labels[person.role]}</td><td>{person.employeeId}</td><td>{person.role === 'EMPLOYEE' ? people.find(manager => manager.id === person.reportSubAdminId)?.name || 'Unassigned' : '—'}</td><td><span className={`database-status ${person.status === 'DISABLED' ? 'is-disabled' : ''}`}>{person.status === 'DISABLED' ? 'Disabled' : 'Active'}</span></td><td>{person.lastLoginAt ? new Date(person.lastLoginAt).toLocaleDateString() : 'Never'}</td><td><div className="database-actions"><button type="button" onClick={() => openEdit(person)} title={`Edit ${person.name}`} aria-label={`Edit ${person.name}`}><Pencil size={16} /></button><button type="button" onClick={() => openReset(person)} title={`Change password for ${person.name}`} aria-label={`Change password for ${person.name}`}><KeyRound size={16} /></button>{person.role !== 'MAIN_ADMIN' && <button type="button" className="is-danger" disabled={busy} onClick={() => void remove(person)} title={`Delete ${person.name}`} aria-label={`Delete ${person.name}`}><Trash2 size={16} /></button>}</div></td></tr>)}</tbody></table></div>
      {!visible.length && <p className="manage-note database-empty">No matching accounts.</p>}
    </section>

    {editing && form && <div className="database-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setEditing(null); setForm(null); } }}><section className="database-modal" role="dialog" aria-modal="true" aria-labelledby="database-edit-title"><div className="database-modal__head"><div><span>Edit record</span><h3 id="database-edit-title">{editing.name}</h3></div><button type="button" aria-label="Close" onClick={() => { setEditing(null); setForm(null); }}><X size={20} /></button></div>{error && <p className="manage-error" role="alert">{error}</p>}<form onSubmit={save} className="database-form"><label>Full name<input className="input" required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Email<input className="input" type="email" required maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Employee ID<input className="input" required maxLength={30} value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })} /></label>{editing.role === 'EMPLOYEE' && <label>Assigned sub-admin<select className="select" required value={form.reportSubAdminId} onChange={event => setForm({ ...form, reportSubAdminId: event.target.value })}><option value="">Select sub-admin</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>}{editing.id !== current.id && <label>Status<select className="select" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AccountForm['status'] })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label>}<div className="database-modal__actions"><button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save changes</button></div></form></section></div>}
    {resetting && <div className="database-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setResetting(null); }}><section className="database-modal" role="dialog" aria-modal="true" aria-labelledby="database-password-title"><div className="database-modal__head"><div><span>Account security</span><h3 id="database-password-title">Change password</h3></div><button type="button" aria-label="Close" onClick={() => setResetting(null)}><X size={20} /></button></div>{error && <p className="manage-error" role="alert">{error}</p>}<form onSubmit={resetPassword} className="database-form"><p>Set a new password for <strong>{resetting.name}</strong>. Their current sessions will end, and they will be asked to change this password when they next sign in.</p><label>New password<input className="input" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label><div className="database-modal__actions"><button type="button" className="btn btn-ghost" onClick={() => setResetting(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Change password</button></div></form></section></div>}
  </div>;
}
