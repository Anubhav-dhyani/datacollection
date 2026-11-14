import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useCurrentUser } from '../../state/session';
import '../../pages/admin/Management.css';
import '../../pages/shared/DailyReportsPage.css';

type Summary = { date: string; employees: { id: string; name: string; submitted: boolean }[] };
export default function DailyReportDashboard() {
  const user = useCurrentUser();
  const [summary, setSummary] = useState<Summary | null>(null), [mine, setMine] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    if (user.role === 'EMPLOYEE') {
      api<{ date: string }[]>('/daily-reports').then(items => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
        setMine(items.filter(item => item.date === `${parts.year}-${parts.month}-${parts.day}`).length);
      }).catch(cause => setError(cause.message));
    } else api<Summary>('/daily-reports/summary').then(setSummary).catch(cause => setError(cause.message));
  }, [user.role]);
  const employee = user.role === 'EMPLOYEE';
  const path = user.role === 'MAIN_ADMIN' ? '/admin/daily-reports' : user.role === 'SUB_ADMIN' ? '/sub-admin/daily-reports' : '/app/daily-reports';
  return <section className="panel glass manage-panel"><div className="report-list-head"><div><h3>Daily event reports</h3><p>{employee ? (mine ? `You submitted ${mine} report${mine === 1 ? '' : 's'} today.` : 'Your daily report is pending.') : `${summary?.employees.filter(person => person.submitted).length ?? 0} submitted · ${summary?.employees.filter(person => !person.submitted).length ?? 0} pending today`}</p></div><Link to={path} className="btn btn-primary">{employee ? 'Submit report' : 'View reports'}</Link></div>{error && <p role="alert" className="manage-error">{error}</p>}{summary && <div className="report-people">{summary.employees.map(person => <span key={person.id} className={person.submitted ? 'report-person done' : 'report-person'}>{person.name} · {person.submitted ? 'Submitted' : 'Pending'}</span>)}</div>}</section>;
}
