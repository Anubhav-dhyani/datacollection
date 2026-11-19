import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { renderCollage, type CollageEmployee } from '../utils/reportCollage';

type Collage = { url: string; count: number };

export default function ReportCollages({ date, employeeId }: { date: string; employeeId: string }) {
  const [collages, setCollages] = useState<Collage[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const urls = useRef<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    urls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  async function generate() {
    const request = new AbortController();
    controller.current = request;
    urls.current.forEach(url => URL.revokeObjectURL(url));
    urls.current = [];
    setCollages([]); setError(''); setBusy(true); setProgress('Finding employee photos…');
    try {
      const query = new URLSearchParams({ date });
      if (employeeId) query.set('employeeId', employeeId);
      const employees = await api<CollageEmployee[]>(`/daily-reports/collage?${query}`, { signal: request.signal });
      if (!employees.length) throw new Error('No employee reports found for this selection.');
      const missing = employees.filter(person => !person.photo);
      if (missing.length) throw new Error(`Missing photos for ${missing.map(person => person.employeeName).join(', ')}. Every employee needs a photo before generating collages.`);
      const result: Collage[] = [];
      const total = Math.ceil(employees.length / 7);
      for (let index = 0; index < employees.length; index += 7) {
        const batch = employees.slice(index, index + 7);
        const number = Math.floor(index / 7) + 1;
        setProgress(`Creating collage ${number} of ${total}…`);
        const blob = await renderCollage(batch, date, number, total, request.signal);
        request.signal.throwIfAborted();
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        result.push({ url, count: batch.length });
      }
      setCollages(result);
    } catch (cause) {
      if (request.signal.aborted) return;
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current = [];
      setError(cause instanceof Error ? cause.message : 'Could not create collages. Please try again.');
    } finally {
      if (!request.signal.aborted) { setBusy(false); setProgress(''); }
    }
  }

  return <section className="report-collages" aria-label="Employee photo collages" aria-busy={busy}>
    <div className="report-list-head"><div><h3>Employee photo collages</h3><p>One photo per employee, with city and students attended. Up to 7 photos per collage; the last may have fewer.</p><p>The first photo from each employee’s latest report on the selected date is used.</p></div>
      <button type="button" className="btn btn-primary" disabled={!date || busy} onClick={() => void generate()}>{busy ? 'Creating collages…' : collages.length ? 'Regenerate collages' : 'Create collages'}</button>
    </div>
    {!date && <p className="manage-note">Select a date above to create collages.</p>}
    {progress && <p role="status" className="manage-note">{progress}</p>}
    {error && <p role="alert" className="manage-error">{error}</p>}
    {collages.length > 0 && <><p role="status" className="manage-note">{collages.reduce((sum, item) => sum + item.count, 0)} employees included across {collages.length} {collages.length === 1 ? 'collage' : 'collages'}.</p>
      <div className="report-collages__grid">{collages.map((collage, index) => <figure key={collage.url}>
        <a href={collage.url} target="_blank" rel="noreferrer" aria-label={`Open collage ${index + 1}`}><img src={collage.url} alt={`Employee event collage for ${date}, page ${index + 1}, with ${collage.count} employee photos, cities and attendance counts`} /></a>
        <figcaption><span>Collage {index + 1} · {collage.count} employees</span><a className="btn btn-ghost" href={collage.url} download={`geu-collage-${date}-${index + 1}.jpg`}>Download JPG</a></figcaption>
      </figure>)}</div></>}
  </section>;
}
