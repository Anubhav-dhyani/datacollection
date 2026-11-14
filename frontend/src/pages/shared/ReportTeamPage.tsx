import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useCurrentUser } from '../../state/session';
import type { User } from '../../domain/types';
import '../admin/Management.css';
import './DailyReportsPage.css';

export default function ReportTeamPage() {
  const current = useCurrentUser(), admin = current.role === 'MAIN_ADMIN';
  const [people, setPeople] = useState<User[]>([]), [role, setRole] = useState<'SUB_ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState(''), [managerId, setManagerId] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function load() { setPeople(await api<User[]>('/report-team')); }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/report-team', { method: 'POST', body: JSON.stringify({ role, name, email, employeeId, password, reportSubAdminId: admin && role === 'EMPLOYEE' ? managerId : undefined }) });
      setName(''); setEmail(''); setEmployeeId(''); setPassword(''); await load();
      setNotice('Account created. The user must change their initial password at first sign-in.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create account.'); }
    finally { setBusy(false); }
  }
  async function update(person: User, values: object) {
    setBusy(true); setError(''); setNotice('');
    try { await api(`/report-team/${person.id}`, { method: 'PATCH', body: JSON.stringify(values) }); await load(); setNotice('Account updated.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }
  const managers = people.filter(person => person.role === 'SUB_ADMIN' && person.status === 'ACTIVE');
  return <div className="dash report-page"><div className="page-head"><div><h2>Report team</h2><p>{admin ? 'Create sub-admins and employees, and assign each employee to one sub-admin.' : 'Create and view employees assigned to you.'}</p></div></div>
    {error && <p role="alert" className="manage-error">{error}</p>}{notice && <p role="status" className="manage-state">{notice}</p>}
    <section className="panel glass manage-panel"><h3>Create account</h3><form className="manage-form report-form" onSubmit={create}>
      {admin && <label>Role<select className="select" value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="EMPLOYEE">Employee</option><option value="SUB_ADMIN">Sub-Admin</option></select></label>}
      <label>Name<input className="input" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email<input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Employee ID<input className="input" required maxLength={30} value={employeeId} onChange={e => setEmployeeId(e.target.value)} /></label>
      <label>Initial password <small>(at least 10 characters)</small><input className="input" type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {admin && role === 'EMPLOYEE' && <label>Assigned sub-admin<select className="select" required value={managerId} onChange={e => setManagerId(e.target.value)}><option value="">Select sub-admin…</option>{managers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <button className="btn btn-primary" disabled={busy}>Create account</button>
    </form></section>
    <section className="panel glass manage-panel"><h3>{admin ? 'Sub-admins and employees' : 'My employees'}</h3><div className="manage-table-wrap"><table className="manage-table"><thead><tr><th>Name</th><th>Role</th><th>Employee ID</th><th>Assigned sub-admin</th><th>Status</th><th>Action</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td>{person.name}<br /><small>{person.email}</small></td><td>{person.role === 'SUB_ADMIN' ? 'Sub-Admin' : 'Employee'}</td><td>{person.employeeId}</td><td>{person.role === 'SUB_ADMIN' ? '—' : (managers.find(manager => manager.id === person.reportSubAdminId)?.name || (admin ? 'Unassigned' : current.name))}</td><td>{person.status}</td><td>{person.role === 'EMPLOYEE' && <div className="report-actions">{admin && <select aria-label={`Assign ${person.name}`} className="select" value={person.reportSubAdminId || ''} onChange={e => void update(person, { reportSubAdminId: e.target.value })}><option value="">Assign…</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select>}{admin && <button className="btn btn-ghost" disabled={busy} onClick={() => void update(person, { status: person.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' })}>{person.status === 'DISABLED' ? 'Activate' : 'Disable'}</button>}<button className="btn btn-ghost" disabled={busy} onClick={() => { const value = window.prompt(`New initial password for ${person.name} (10+ characters)`); if (value) void update(person, { password: value }); }}>Reset password</button></div>}</td></tr>)}</tbody></table></div>{!people.length && <p className="manage-note">No accounts yet.</p>}</section>
  </div>;
}
