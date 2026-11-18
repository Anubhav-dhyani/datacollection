import { useEffect, useState, type FormEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { api } from '../../api';
import { useCurrentUser } from '../../state/session';
import type { User } from '../../domain/types';
import '../admin/Management.css';
import './DailyReportsPage.css';
import './ReportTeamPage.css';

type ImportRow = { row: number; status: 'created' | 'error'; role?: string; name?: string; email: string; employeeId?: string; message?: string };
type ImportResult = { created: number; failed: number; rows: ImportRow[] };
const assignmentIds = (person: User) => person.reportSubAdminIds?.length ? person.reportSubAdminIds : person.reportSubAdminId ? [person.reportSubAdminId] : [];
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ReportTeamPage() {
  const current = useCurrentUser(), admin = current.role === 'MAIN_ADMIN';
  const [people, setPeople] = useState<User[]>([]), [role, setRole] = useState<'SUB_ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [managerIds, setManagerIds] = useState<string[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null), [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function load() { setPeople(await api<User[]>('/report-team')); }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    if (admin && role === 'EMPLOYEE' && !managerIds.length) { setError('Choose at least one sub-admin.'); setBusy(false); return; }
    try {
      await api('/report-team', { method: 'POST', body: JSON.stringify({ role, name, email, password, reportSubAdminIds: admin && role === 'EMPLOYEE' ? managerIds : undefined }) });
      setName(''); setEmail(''); setPassword(''); setManagerIds([]); await load();
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
  async function downloadTemplate(type: 'employee' | 'sub-admin' | 'combined') {
    setError('');
    try {
      const response = await fetch(`/api/v1/report-team/template.csv?type=${type}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not download the CSV template.');
      saveFile(await response.blob(), `${type}-team-template.csv`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not download the CSV template.'); }
  }
  async function importCsv(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (!importFile) { setError('Choose a CSV file first.'); return; }
    if (importFile.size > 1024 * 1024) { setError('CSV must be under 1 MB.'); return; }
    setBusy(true);
    try {
      const result = await api<ImportResult>('/report-team/import.csv', { method: 'POST', body: importFile, headers: { 'Content-Type': 'text/csv' } });
      setImportResult(result); await load();
      setNotice(`${result.created} account${result.created === 1 ? '' : 's'} created · ${result.failed} row${result.failed === 1 ? '' : 's'} need correction.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import the CSV.'); }
    finally { setBusy(false); }
  }
  const managers = people.filter(person => person.role === 'SUB_ADMIN' && person.status === 'ACTIVE');
  const namesFor = (person: User) => assignmentIds(person).map(id => people.find(manager => manager.id === id)?.name).filter(Boolean).join(', ') || (admin ? 'Unassigned' : current.name);
  return <div className="dash report-page"><div className="page-head"><div><h2>Report team</h2><p>{admin ? 'Create sub-admins and employees, and assign employees to one or more sub-admins.' : 'Create and view employees assigned to you.'}</p></div></div>
    {error && <p role="alert" className="manage-error">{error}</p>}{notice && <p role="status" className="manage-state">{notice}</p>}
    <section className="panel glass manage-panel"><h3>Create account</h3><form className="manage-form report-form" onSubmit={create}>
      {admin && <label>Role<select className="select" value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="EMPLOYEE">Employee</option><option value="SUB_ADMIN">Sub-Admin</option></select></label>}
      <label>Name<input className="input" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email<input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Initial password <small>(at least 10 characters)</small><input className="input" type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {admin && role === 'EMPLOYEE' && <fieldset className="team-assignments"><legend>Assigned sub-admins <small>(choose at least one)</small></legend>{managers.map(person => <label key={person.id}><input type="checkbox" checked={managerIds.includes(person.id)} onChange={e => setManagerIds(e.target.checked ? [...managerIds, person.id] : managerIds.filter(id => id !== person.id))} /> {person.name}</label>)}</fieldset>}
      <p className="manage-note">An account ID is generated automatically.</p>
      <button className="btn btn-primary" disabled={busy || (admin && role === 'EMPLOYEE' && !managerIds.length)}>Create account</button>
    </form></section>
    <section className="panel glass manage-panel team-import">
      <div className="team-import__head"><div><h3>Bulk import accounts</h3><p>{admin ? 'Choose an employee, sub-admin, or combined template. Assign one or more sub-admins to each employee.' : 'Import employees. Every account will be assigned to you.'}</p></div><div className="team-import__templates">{admin && <button type="button" className="btn btn-ghost" onClick={() => void downloadTemplate('sub-admin')}><Download size={17} /> Sub-admin template</button>}<button type="button" className="btn btn-ghost" onClick={() => void downloadTemplate('employee')}><Download size={17} /> Employee template</button>{admin && <button type="button" className="btn btn-ghost" onClick={() => void downloadTemplate('combined')}><Download size={17} /> Combined template</button>}</div></div>
      <p className="team-import__hint">Every template includes <strong>initial_password</strong> (at least 10 characters). Fill it for each account before importing. {admin && 'For employees, enter sub-admin email addresses in sub_admin_emails, separated by semicolons (;). The combined template can create sub-admins and assign employees to them in the same file. '}Up to 100 accounts per file; account IDs are generated automatically.</p>
      <form className="team-import__form" onSubmit={importCsv}><label>Completed CSV file<input className="input" type="file" accept=".csv,text/csv" onChange={event => setImportFile(event.target.files?.[0] || null)} /></label><button className="btn btn-primary" disabled={busy || !importFile}><Upload size={17} /> {busy ? 'Importing…' : 'Import accounts'}</button></form>
      {importResult && <div className="team-import__result"><div className="team-import__result-head"><strong>{importResult.created} created · {importResult.failed} failed</strong></div>{importResult.created > 0 && <p>Imported users sign in with the initial passwords from your CSV and must change them at first sign-in.</p>}<div className="manage-table-wrap"><table className="manage-table"><thead><tr><th>CSV row</th><th>Email</th><th>Result</th><th>Details</th></tr></thead><tbody>{importResult.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.email}</td><td>{row.status === 'created' ? 'Created' : 'Failed'}</td><td>{row.status === 'created' ? `Generated ID: ${row.employeeId}` : row.message}</td></tr>)}</tbody></table></div></div>}
    </section>
    <section className="panel glass manage-panel"><h3>{admin ? 'Sub-admins and employees' : 'My employees'}</h3><div className="manage-table-wrap"><table className="manage-table"><thead><tr><th>Name</th><th>Role</th><th>Employee ID</th><th>Assigned sub-admins</th><th>Status</th><th>Action</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td>{person.name}<br /><small>{person.email}</small></td><td>{person.role === 'SUB_ADMIN' ? 'Sub-Admin' : 'Employee'}</td><td>{person.employeeId}</td><td>{person.role === 'SUB_ADMIN' ? '—' : namesFor(person)}</td><td>{person.status}</td><td>{person.role === 'EMPLOYEE' && <div className="report-actions">{admin && <details className="team-assignment-menu"><summary>Assign</summary><div className="team-assignment-menu__choices">{managers.map(manager => <label key={manager.id}><input type="checkbox" checked={assignmentIds(person).includes(manager.id)} disabled={busy || (assignmentIds(person).length === 1 && assignmentIds(person).includes(manager.id))} onChange={e => { const ids = e.target.checked ? [...assignmentIds(person), manager.id] : assignmentIds(person).filter(id => id !== manager.id); if (ids.length) void update(person, { reportSubAdminIds: ids }); }} /> {manager.name}</label>)}</div></details>}{admin && <button className="btn btn-ghost" disabled={busy} onClick={() => void update(person, { status: person.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' })}>{person.status === 'DISABLED' ? 'Activate' : 'Disable'}</button>}<button className="btn btn-ghost" disabled={busy} onClick={() => { const value = window.prompt(`New initial password for ${person.name} (10+ characters)`); if (value) void update(person, { password: value }); }}>Reset password</button></div>}</td></tr>)}</tbody></table></div>{!people.length && <p className="manage-note">No accounts yet.</p>}</section>
  </div>;
}
