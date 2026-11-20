import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Camera, Check, FileText, ImagePlus, UserRound, X } from 'lucide-react';
import { api } from '../../api';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '../../state/session';
import '../admin/Management.css';
import './DailyReportsPage.css';

type PhotoMetadata = { captureDate: string | null; captureUtc: string | null; timezoneStatus: string; captureSource: string | null; status: 'capture_present' | 'capture_missing' | 'possible_edit'; indicators: string[]; cameraMake: string | null; cameraModel: string | null; software: string | null; uploadedAt: string; sha256: string };
type Photo = { attachmentId: string; url: string; metadata?: PhotoMetadata | null };
type Report = { id: string; date: string; employeeId: string; employeeName: string; eventDetail: string; city: string; studentsAttended: number | 'NA' | null; dataCollected: number | 'NA' | null; eventRemarks: string; additionalRemarks: string; photos: Photo[] };
type Summary = { date: string; employees: { id: string; name: string; employeeId: string; submitted: boolean }[] };
function today() { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
function displayCount(value: number | 'NA' | null) { return value === 'NA' ? 'N/A' : value ?? '—'; }
function parseCount(value: string, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative whole number or N/A.`);
  return number;
}

function ReportPhoto({ photo, name, index }: { photo: Photo; name: string; index: number }) {
  const [open, setOpen] = useState(false);
  const metadata = photo.metadata;
  const status = metadata?.status === 'possible_edit' ? 'Possible edit' : metadata?.status === 'capture_missing' ? 'Capture metadata missing; photo may have been shared or exported' : metadata ? 'Capture date available' : 'Not inspected';
  return <><button type="button" className="report-sheet__photo" onClick={() => setOpen(true)} aria-label={`Inspect picture ${index + 1} for ${name}`}>
    <img src={photo.url} alt={`Event picture ${index + 1} for ${name}`} loading="lazy" />
    <span>{metadata?.status === 'possible_edit' ? 'Possible edit · ' : metadata?.status === 'capture_missing' ? 'No capture metadata · ' : ''}{metadata?.captureDate || 'Date unavailable'}</span>
  </button>{open && createPortal(<div className="photo-inspection-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section className="photo-inspection" role="dialog" aria-modal="true" aria-label={`Picture ${index + 1} inspection`}>
    <div className="photo-inspection__head"><strong>Picture {index + 1} · {name}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close photo details"><X size={20} /></button></div>
    <div className="photo-inspection__image"><img src={photo.url} alt={`Event picture ${index + 1} for ${name}`} /><span>{metadata?.captureDate ? `Captured: ${metadata.captureDate}` : 'Capture date unavailable'}</span></div>
    <div className="photo-inspection__details"><strong className={metadata?.status === 'possible_edit' ? 'is-warning' : ''}>{status}</strong>
      <p>Capture date: {metadata?.captureDate || 'Not available'}{metadata?.captureSource ? ` · ${metadata.captureSource}` : ''}</p>
      {metadata?.captureDate && <p>Timezone: {metadata.timezoneStatus === 'embedded' ? 'Embedded offset available' : 'Unknown or invalid; no timezone assumed'}</p>}
      <p>Uploaded: {metadata?.uploadedAt ? new Date(metadata.uploadedAt).toLocaleString() : 'Not recorded'}</p>
      {(metadata?.cameraMake || metadata?.cameraModel) && <p>Camera: {[metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(' ')}</p>}
      {metadata?.indicators.map((indicator, item) => <p key={item}>{indicator}</p>)}
      <small>File metadata can be changed or removed. This result cannot prove when a photo was taken, edited, or shared.</small>
    </div>
    <a href={photo.url} target="_blank" rel="noreferrer">Open original photo</a>
  </section></div>, document.body)}</>;
}

function CountField({ label, value, onChange, na, onNAChange }: { label: string; value: string; onChange: (value: string) => void; na: boolean; onNAChange: (value: boolean) => void }) {
  return <div className="report-count-card">
    <div className="report-count-card__head"><strong>{label}</strong><div className="report-count-mode" role="group" aria-label={`${label} entry mode`}>
      <button type="button" aria-pressed={!na} onClick={() => onNAChange(false)}>Number</button>
      <button type="button" aria-pressed={na} onClick={() => onNAChange(true)}>N/A</button>
    </div></div>
    {na ? <p className="report-count-card__na">N/A selected · explain below</p> : <label className="report-count-card__input"><span>Enter a whole number</span><input className="input" type="number" inputMode="numeric" min="0" step="1" required value={value} onChange={event => onChange(event.target.value)} placeholder="0" /></label>}
  </div>;
}

function SelectedPhoto({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="report-photo-tile">
    {preview && <button type="button" className="report-photo-tile__preview" onClick={() => setOpen(true)} aria-label={`Enlarge ${file.name}`}><img src={preview} alt={`Selected photo ${file.name}`} /></button>}
    <span title={file.name}>{file.name}</span>
    <button type="button" className="report-photo-tile__remove" aria-label={`Remove ${file.name}`} onClick={onRemove}><X size={15} /></button>
    {open && preview && createPortal(<div className="photo-inspection-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section className="photo-inspection" role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`}>
      <div className="photo-inspection__head"><strong>{file.name}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close photo preview"><X size={20} /></button></div>
      <div className="photo-inspection__image"><img src={preview} alt={`Large preview of ${file.name}`} /></div>
    </section></div>, document.body)}
  </div>;
}

export default function DailyReportsPage({ mode = 'all' }: { mode?: 'all' | 'submit' | 'mine' }) {
  const user = useCurrentUser(), employee = user.role === 'EMPLOYEE';
  const showForm = employee && mode === 'submit';
  const showList = !employee || mode === 'mine';
  const [reports, setReports] = useState<Report[]>([]), [summary, setSummary] = useState<Summary | null>(null);
  const [date, setDate] = useState(() => employee && mode === 'mine' ? '' : today()), [employeeId, setEmployeeId] = useState('');
  const [eventDetail, setEventDetail] = useState(''), [city, setCity] = useState('');
  const [studentsAttended, setStudentsAttended] = useState(''), [studentsAttendedNA, setStudentsAttendedNA] = useState(false);
  const [dataCollected, setDataCollected] = useState(''), [dataCollectedNA, setDataCollectedNA] = useState(false);
  const [eventRemarks, setEventRemarks] = useState(''), [additionalRemarks, setAdditionalRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoDragging, setPhotoDragging] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const needsRemarks = studentsAttendedNA || dataCollectedNA;
  const query = new URLSearchParams(); if (date) query.set('date', date); if (employeeId && !employee) query.set('employeeId', employeeId);
  const suffix = query.toString() ? `?${query}` : '';
  async function load() {
    if (!showList) return;
    const [items, overview] = await Promise.all([api<Report[]>(`/daily-reports${suffix}`), employee ? Promise.resolve(null) : api<Summary>('/daily-reports/summary')]);
    setReports(items); setSummary(overview);
  }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, [date, employeeId, employee, showList]);
  function addPhotos(incoming: File[]) {
    const merged = [...files];
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { setError(`${file.name} must be a JPG, PNG or WebP under 5 MB.`); return; }
      if (!merged.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) merged.push(file);
    }
    if (merged.length > 8) { setError('Add at most 8 event pictures.'); return; }
    setError(''); setFiles(merged);
  }
  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setPhotoDragging(false); addPhotos(Array.from(event.dataTransfer.files));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const studentCount = studentsAttendedNA ? 'NA' : parseCount(studentsAttended, 'Students attended');
      const collectionCount = dataCollectedNA ? 'NA' : parseCount(dataCollected, 'Data collected');
      if (needsRemarks && !eventRemarks.trim()) throw new Error('Explain why a count is N/A in Event remarks.');
      if (!files.length || files.length > 8) throw new Error('Select 1 to 8 photos.');
      const photos = [];
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Use JPG, PNG or WebP photos up to 5 MB each.');
        const { attachmentId } = await api<{ attachmentId: string }>('/uploads/report-photo', { method: 'POST', body: file });
        photos.push({ attachmentId });
      }
      await api('/daily-reports', { method: 'POST', body: JSON.stringify({ eventDetail, city, studentsAttended: studentCount, dataCollected: collectionCount, eventRemarks: needsRemarks ? eventRemarks.trim() : '', additionalRemarks: needsRemarks ? additionalRemarks.trim() : '', photos }) });
      setEventDetail(''); setCity(''); setStudentsAttended(''); setStudentsAttendedNA(false); setDataCollected(''); setDataCollectedNA(false); setEventRemarks(''); setAdditionalRemarks(''); setFiles([]);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setNotice('Report submitted to your sub-admin.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Submission failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function download() {
    try {
      const response = await fetch(`/api/v1/daily-reports/export.csv${suffix}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not export reports.');
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = `geu-daily-reports${date ? `-${date}` : ''}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.'); }
  }
  return <div className="dash report-page"><div className="page-head"><div><h2>{mode === 'mine' ? 'My Reports' : showForm ? 'New event report' : 'Daily Reports'}</h2><p>{showForm ? 'Capture the event details and send your report to your sub-admin.' : employee ? 'Review the reports you have submitted.' : 'Review reports and submission status.'}</p></div>{showList && <button className="btn btn-primary" onClick={() => void download()}>Download CSV</button>}</div>
    {error && <p role="alert" className="manage-error">{error}</p>}{notice && <p role="status" className="manage-state">{notice} <Link to="/app/my-reports">View My Reports</Link></p>}
    {showForm && <section className="panel glass report-editor">
      <div className="report-editor__intro"><div className="report-editor__mark"><FileText size={25} /></div><div><span className="report-editor__eyebrow">Daily activity</span><h3>Tell us about today's event</h3><p>Describe the event, add its city and pictures, and include any remarks for your sub-admin.</p></div></div>
      <form className="report-form" onSubmit={submit}>
        <div className="report-section">
          <div className="report-section__heading"><span className="report-section__number">01</span><div><h4>Event overview</h4><p>When, who, and where</p></div></div>
          <div className="report-meta-grid">
            <div className="report-meta"><CalendarDays size={18} /><div><span>Date</span><strong>{today()}</strong></div><Check size={16} className="report-meta__check" /></div>
            <div className="report-meta"><UserRound size={18} /><div><span>Submitted by</span><strong>{user.name}</strong></div><Check size={16} className="report-meta__check" /></div>
          </div>
          <div className="report-overview-grid">
            <label className="report-field report-field--wide"><span>Event detail <em>Required</em></span><textarea className="input report-textarea" required maxLength={3000} placeholder="What happened at the event? Add the key activities and outcomes…" value={eventDetail} onChange={e => setEventDetail(e.target.value)} /></label>
            <label className="report-field"><span>City <em>Required</em></span><input className="input" required maxLength={120} placeholder="e.g. Dehradun" value={city} onChange={e => setCity(e.target.value)} /></label>
          </div>
        </div>

        <div className="report-section">
          <div className="report-section__heading"><span className="report-section__number">02</span><div><h4>Data Collected</h4><p>Enter each count, or select N/A when a count is unavailable.</p></div></div>
          <div className="report-count-grid">
            <CountField label="Number of students attended" value={studentsAttended} onChange={setStudentsAttended} na={studentsAttendedNA} onNAChange={setStudentsAttendedNA} />
            <CountField label="Number of data collected" value={dataCollected} onChange={setDataCollected} na={dataCollectedNA} onNAChange={setDataCollectedNA} />
          </div>
        </div>

        {needsRemarks && <div className="report-section">
          <div className="report-section__heading"><span className="report-section__number">03</span><div><h4>Remarks</h4><p>Explain why a count is N/A for your sub-admin.</p></div></div>
          <div className="report-remarks-grid">
            <label className="report-field"><span>Event remarks <em>Required</em></span><textarea className="input report-textarea" required maxLength={3000} placeholder="Explain why a count is N/A…" value={eventRemarks} onChange={e => setEventRemarks(e.target.value)} /></label>
            <label className="report-field"><span>Additional remarks</span><textarea className="input report-textarea" maxLength={3000} placeholder="Follow-ups, requests, or extra notes…" value={additionalRemarks} onChange={e => setAdditionalRemarks(e.target.value)} /></label>
          </div>
        </div>}

        <div className="report-section">
          <div className="report-section__heading"><span className="report-section__number">{needsRemarks ? '04' : '03'}</span><div><h4>Event pictures</h4><p>Add 1–8 pictures to support your report.</p></div></div>
          <div className={`report-photo-dropzone ${photoDragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setPhotoDragging(true); }} onDragLeave={() => setPhotoDragging(false)} onDrop={dropFiles}>
            <div className="report-photo-dropzone__icon"><ImagePlus size={23} /></div><div><strong>Drop your pictures here</strong><span>JPG, PNG, or WebP · 5 MB each</span></div><button type="button" className="btn btn-ghost" onClick={() => photoInputRef.current?.click()}><Camera size={16} /> Add pictures</button>
            <input ref={photoInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { addPhotos(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </div>
          {files.length > 0 && <div className="report-photo-preview">{files.map((file, index) => <SelectedPhoto key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => setFiles(current => current.filter((_, item) => item !== index))} />)}</div>}
        </div>

        <div className="report-editor__footer"><div><strong>Ready to send?</strong><span>{files.length} {files.length === 1 ? 'picture' : 'pictures'} selected</span></div><button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit daily report'}</button></div>
      </form>
    </section>}
    {summary && <section className="panel glass manage-panel"><h3>Today's submissions · {summary.date}</h3><div className="manage-pills"><span className="manage-pill">Submitted: {summary.employees.filter(person => person.submitted).length}</span><span className="manage-pill">Pending: {summary.employees.filter(person => !person.submitted).length}</span></div><div className="report-people">{summary.employees.map(person => <span key={person.id} className={person.submitted ? 'report-person done' : 'report-person'}>{person.name} · {person.submitted ? 'Submitted' : 'Pending'}</span>)}</div>{!summary.employees.length && <p className="manage-note">No assigned employees yet.</p>}</section>}
    {showList && <section className="panel glass manage-panel report-sheet">
      <div className="report-list-head">
        <div><span className="report-sheet__eyebrow">Daily report sheet</span><h3>{date ? `Reports for ${date}` : 'All reports'}</h3><p>{reports.length} {reports.length === 1 ? 'report' : 'reports'} in this view</p></div>
        <div className="report-filters">
          <label>Date<input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <button type="button" className="btn btn-ghost" onClick={() => setDate('')}>All dates</button>
          {!employee && <label>Employee<select className="select" value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">All employees</option>{summary?.employees.map(person => <option key={person.id} value={person.id}>{person.name} · {person.employeeId}</option>)}</select></label>}
        </div>
      </div>
      {!reports.length ? <p className="manage-note">No reports found for this selection.</p> : employee ? <div className="my-report-cards">{reports.map(report => <article className="my-report-card" key={report.id}>
        <div className="my-report-card__head"><strong>{report.eventDetail}</strong><span>{report.date} · {report.city}</span></div>
        <div className="my-report-card__counts"><span>Students attended: <strong>{displayCount(report.studentsAttended)}</strong></span><span>Data collected: <strong>{displayCount(report.dataCollected)}</strong></span></div>
        {report.eventRemarks && <p><strong>Event remarks:</strong> {report.eventRemarks}</p>}
        {report.additionalRemarks && <p><strong>Additional remarks:</strong> {report.additionalRemarks}</p>}
        <div className="my-report-card__pictures"><h4>Event pictures</h4><div className="report-sheet__photos">{report.photos.map((photo, index) => <ReportPhoto key={photo.attachmentId} photo={photo} name={report.employeeName} index={index} />)}</div></div>
      </article>)}</div> : <div className="report-sheet__scroll"><table className="report-sheet__table">
        <thead><tr><th scope="col">Date</th><th scope="col">Name</th><th scope="col">Event Detail</th><th scope="col">City</th><th scope="col">Students Attended</th><th scope="col">Data Collected</th><th scope="col">Event Remarks</th><th scope="col">Additional Remarks</th><th scope="col">Event Pictures</th></tr></thead>
        <tbody>{reports.map(report => <tr key={report.id}>
          <td className="report-sheet__date">{report.date}</td>
          <td className="report-sheet__name">{report.employeeName}</td>
          <td>{report.eventDetail}</td>
          <td>{report.city}</td>
          <td>{displayCount(report.studentsAttended)}</td>
          <td>{displayCount(report.dataCollected)}</td>
          <td>{report.eventRemarks || '—'}</td>
          <td>{report.additionalRemarks || '—'}</td>
          <td><div className="report-sheet__photos">{report.photos.map((photo, index) => <ReportPhoto key={photo.attachmentId} photo={photo} name={report.employeeName} index={index} />)}</div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}</div>;
}
