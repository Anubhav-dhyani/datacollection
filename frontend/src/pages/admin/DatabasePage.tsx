import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Database, KeyRound, MoreHorizontal, Pencil, Search, Trash2, UserRound, Users, X } from 'lucide-react';
import { api } from '../../api';
import type { Role, User } from '../../domain/types';
import { useCurrentUser } from '../../state/session';
import './Management.css';
import './DatabasePage.css';
import '../shared/ReportTeamPage.css';

type Filter = 'ALL' | Role;
type AccountForm = { name: string; email: string; employeeId: string; reportSubAdminIds: string[]; status: 'ACTIVE' | 'DISABLED' };
type ReportDeletePreview = { date: string; employeeId: string; employeeName: string; reportCount: number; photoCount: number; snapshot: string };
const labels: Record<Role, string> = { MAIN_ADMIN: 'Super Admin', SUB_ADMIN: 'Sub-Admin', EMPLOYEE: 'Employee' };
const today = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
const assignmentIds = (person: User) => person.reportSubAdminIds?.length ? person.reportSubAdminIds : person.reportSubAdminId ? [person.reportSubAdminId] : [];
const formFrom = (person: User): AccountForm => ({ name: person.name, email: person.email, employeeId: person.employeeId, reportSubAdminIds: assignmentIds(person), status: person.status || 'ACTIVE' });

export default function DatabasePage() {
  const current = useCurrentUser();
  const [people, setPeople] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL'), [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null), [form, setForm] = useState<AccountForm | null>(null);
  const [resetting, setResetting] = useState<User | null>(null), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [actionsOpen, setActionsOpen] = useState<{ employee: User; top: number; right: number } | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<User | null>(null);
  const [deleteDate, setDeleteDate] = useState(today), [deleteStage, setDeleteStage] = useState<'select' | 'confirm'>('select');
  const [deletePreview, setDeletePreview] = useState<ReportDeletePreview | null>(null), [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(''), [previewVersion, setPreviewVersion] = useState(0);

  async function load() { setPeople(await api<User[]>('/admin/database/accounts')); }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, []);
  useEffect(() => {
    if (!deleteEmployee || !deleteDate) return;
    let active = true;
    setDeleteLoading(true); setDeletePreview(null); setDeleteError('');
    void api<ReportDeletePreview>(`/admin/database/accounts/${deleteEmployee.id}/reports/by-date?date=${encodeURIComponent(deleteDate)}`).then(result => {
      if (active) setDeletePreview(result);
    }).catch(cause => { if (active) setDeleteError(cause instanceof Error ? cause.message : 'Could not load report count.'); })
      .finally(() => { if (active) setDeleteLoading(false); });
    return () => { active = false; };
  }, [deleteEmployee?.id, deleteDate, previewVersion]);
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
      const values: Record<string, string | string[]> = { name: form.name, email: form.email, employeeId: form.employeeId };
      if (editing.role === 'EMPLOYEE') values.reportSubAdminIds = form.reportSubAdminIds;
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
  function openReportDeletion(person: User) {
    setActionsOpen(null); setDeleteDate(today()); setDeleteStage('select'); setDeletePreview(null); setDeleteError(''); setDeleteEmployee(person);
  }
  function closeReportDeletion() { setDeleteEmployee(null); setDeletePreview(null); setDeleteStage('select'); setDeleteError(''); }
  async function confirmReportDeletion() {
    if (!deleteEmployee || !deletePreview || deletePreview.employeeId !== deleteEmployee.id || deletePreview.date !== deleteDate || deletePreview.reportCount < 1) return;
    setBusy(true); setDeleteError('');
    try {
      const result = await api<{ deletedReports: number; deletedPhotos: number; failedPhotoDeletes: number }>(`/admin/database/accounts/${deleteEmployee.id}/reports/by-date`, {
        method: 'DELETE', body: JSON.stringify({ date: deleteDate, confirmDate: deleteDate, expectedCount: deletePreview.reportCount, snapshot: deletePreview.snapshot }),
      });
      closeReportDeletion(); setNotice(`${result.deletedReports} report${result.deletedReports === 1 ? '' : 's'} for ${deleteEmployee.name} on ${deleteDate} deleted.${result.failedPhotoDeletes ? ` ${result.failedPhotoDeletes} photo files could not be removed from S3; check the server audit log.` : ''}`);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete reports.');
      setDeleteStage('select'); setPreviewVersion(version => version + 1);
    } finally { setBusy(false); }
  }

  return <div className="dash database-page">
    <div className="page-head"><div><h2>Database</h2><p>View and manage portal account records.</p></div></div>
    {error && <p className="manage-error" role="alert">{error}</p>}{notice && <p className="manage-state" role="status">{notice}</p>}
    <div className="database-stats"><div><Database size={20} /><span>All accounts</span><strong>{counts.ALL}</strong></div><div><UserRound size={20} /><span>Super admins</span><strong>{counts.MAIN_ADMIN}</strong></div><div><Users size={20} /><span>Sub-admins</span><strong>{counts.SUB_ADMIN}</strong></div><div><Users size={20} /><span>Employees</span><strong>{counts.EMPLOYEE}</strong></div></div>
    <section className="panel glass database-panel"><div className="database-toolbar"><div><h3>Account records</h3><p>Select a record to edit its details or password.</p></div><label className="database-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email or ID" aria-label="Search accounts" /></label></div>
      <div className="database-tabs" role="group" aria-label="Filter accounts">{(['ALL', 'MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] as Filter[]).map(option => <button key={option} type="button" className={filter === option ? 'is-active' : ''} onClick={() => setFilter(option)}>{option === 'ALL' ? 'All' : labels[option]} <span>{counts[option]}</span></button>)}</div>
      <div className="manage-table-wrap"><table className="manage-table database-table"><thead><tr><th>Account</th><th>Role</th><th>Employee ID</th><th>Assigned sub-admins</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{visible.map(person => <tr key={person.id}><td><strong>{person.name}</strong><small>{person.email}</small></td><td>{labels[person.role]}</td><td>{person.employeeId}</td><td>{person.role === 'EMPLOYEE' ? assignmentIds(person).map(id => people.find(manager => manager.id === id)?.name).filter(Boolean).join(', ') || 'Unassigned' : '—'}</td><td><span className={`database-status ${person.status === 'DISABLED' ? 'is-disabled' : ''}`}>{person.status === 'DISABLED' ? 'Disabled' : 'Active'}</span></td><td>{person.lastLoginAt ? new Date(person.lastLoginAt).toLocaleDateString() : 'Never'}</td><td><div className="database-actions"><button type="button" onClick={() => openEdit(person)} title={`Edit ${person.name}`} aria-label={`Edit ${person.name}`}><Pencil size={16} /></button><button type="button" onClick={() => openReset(person)} title={`Change password for ${person.name}`} aria-label={`Change password for ${person.name}`}><KeyRound size={16} /></button>{person.role !== 'MAIN_ADMIN' && <button type="button" className="is-danger" disabled={busy} onClick={() => void remove(person)} title={`Delete ${person.name}`} aria-label={`Delete ${person.name}`}><Trash2 size={16} /></button>}{person.role === 'EMPLOYEE' && <button type="button" disabled={busy} title={`Report actions for ${person.name}`} aria-label={`Report actions for ${person.name}`} aria-haspopup="menu" aria-expanded={actionsOpen?.employee.id === person.id} onClick={event => { if (actionsOpen?.employee.id === person.id) { setActionsOpen(null); return; } const rect = event.currentTarget.getBoundingClientRect(); setActionsOpen({ employee: person, top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) }); }}><MoreHorizontal size={18} /></button>}</div></td></tr>)}</tbody></table></div>
      {!visible.length && <p className="manage-note database-empty">No matching accounts.</p>}
    </section>

    {actionsOpen && createPortal(<><div className="database-menu__dismiss" onClick={() => setActionsOpen(null)} /><div className="database-menu__list" role="menu" style={{ top: actionsOpen.top, right: actionsOpen.right }}><button type="button" role="menuitem" onClick={() => openReportDeletion(actionsOpen.employee)}><Trash2 size={17} /> Delete report data</button></div></>, document.body)}

    {editing && form && <div className="database-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setEditing(null); setForm(null); } }}><section className="database-modal" role="dialog" aria-modal="true" aria-labelledby="database-edit-title"><div className="database-modal__head"><div><span>Edit record</span><h3 id="database-edit-title">{editing.name}</h3></div><button type="button" aria-label="Close" onClick={() => { setEditing(null); setForm(null); }}><X size={20} /></button></div>{error && <p className="manage-error" role="alert">{error}</p>}<form onSubmit={save} className="database-form"><label>Full name<input className="input" required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Email<input className="input" type="email" required maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Employee ID<input className="input" required maxLength={30} value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })} /></label>{editing.role === 'EMPLOYEE' && <fieldset className="team-assignments"><legend>Assigned sub-admins <small>(choose at least one)</small></legend>{managers.map(manager => <label key={manager.id}><input type="checkbox" checked={form.reportSubAdminIds.includes(manager.id)} onChange={event => setForm({ ...form, reportSubAdminIds: event.target.checked ? [...form.reportSubAdminIds, manager.id] : form.reportSubAdminIds.filter(id => id !== manager.id) })} /> {manager.name}</label>)}</fieldset>}{editing.id !== current.id && <label>Status<select className="select" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AccountForm['status'] })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label>}<div className="database-modal__actions"><button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button><button className="btn btn-primary" disabled={busy || (editing.role === 'EMPLOYEE' && !form.reportSubAdminIds.length)}>Save changes</button></div></form></section></div>}
    {resetting && <div className="database-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setResetting(null); }}><section className="database-modal" role="dialog" aria-modal="true" aria-labelledby="database-password-title"><div className="database-modal__head"><div><span>Account security</span><h3 id="database-password-title">Change password</h3></div><button type="button" aria-label="Close" onClick={() => setResetting(null)}><X size={20} /></button></div>{error && <p className="manage-error" role="alert">{error}</p>}<form onSubmit={resetPassword} className="database-form"><p>Set a new password for <strong>{resetting.name}</strong>. Their current sessions will end, and they will be asked to change this password when they next sign in.</p><label>New password<input className="input" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label><div className="database-modal__actions"><button type="button" className="btn btn-ghost" onClick={() => setResetting(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Change password</button></div></form></section></div>}
    {deleteEmployee && <div className="database-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) closeReportDeletion(); }}><section className="database-modal" role="dialog" aria-modal="true" aria-labelledby="database-delete-reports-title"><div className="database-modal__head"><div><span>Report data</span><h3 id="database-delete-reports-title">Delete {deleteEmployee.name}'s reports</h3></div><button type="button" aria-label="Close" disabled={busy} onClick={closeReportDeletion}><X size={20} /></button></div>
      {deleteError && <p className="manage-error" role="alert">{deleteError}</p>}
      {deleteStage === 'select' ? <div className="database-form"><p>Choose a day to remove {deleteEmployee.name}'s reports and event photos for that date. Their account and other employees' reports will stay.</p><label>Report date<input className="input" type="date" max={today()} value={deleteDate} onChange={event => { setDeleteDate(event.target.value); setDeletePreview(null); setDeleteError(''); }} /></label><p className="database-delete-count">{deleteLoading ? 'Checking reports…' : deletePreview ? `${deletePreview.reportCount} report${deletePreview.reportCount === 1 ? '' : 's'} and ${deletePreview.photoCount} photo${deletePreview.photoCount === 1 ? '' : 's'} found for ${deleteEmployee.name} on ${deleteDate}.` : 'Select a date to check this employee’s reports.'}</p><div className="database-modal__actions"><button type="button" className="btn btn-ghost" onClick={closeReportDeletion}>Cancel</button><button type="button" className="btn btn-primary database-delete-button" disabled={deleteLoading || !deletePreview?.reportCount || deletePreview.employeeId !== deleteEmployee.id || deletePreview.date !== deleteDate} onClick={() => setDeleteStage('confirm')}>Delete data</button></div></div> : <div className="database-form"><p><strong>Confirm permanent deletion</strong></p><p>Delete <strong>{deletePreview?.reportCount}</strong> report{deletePreview?.reportCount === 1 ? '' : 's'} submitted by <strong>{deleteEmployee.name}</strong> on <strong>{deleteDate}</strong>, including attached photos? This cannot be undone.</p><div className="database-modal__actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDeleteStage('select')}>Back</button><button type="button" className="btn btn-primary database-delete-button" disabled={busy || !deletePreview || deletePreview.employeeId !== deleteEmployee.id || deletePreview.date !== deleteDate} onClick={() => void confirmReportDeletion()}>{busy ? 'Deleting…' : 'Confirm delete'}</button></div></div>}
    </section></div>}
  </div>;
}
