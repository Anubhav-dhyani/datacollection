import { Link } from 'react-router-dom';
import { useCurrentUser } from '../../state/session';
import DailyReportDashboard from '../../components/reports/DailyReportDashboard';

export default function DashboardPage() {
  const user = useCurrentUser();
  const base = user.role === 'MAIN_ADMIN' ? '/admin' : user.role === 'SUB_ADMIN' ? '/sub-admin' : '/app';
  return <div className="dash"><section className="hero rise-in"><div className="hero__text"><span className="hero__date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><h2>Welcome, <span>{user.name}</span></h2><p>{user.role === 'EMPLOYEE' ? 'Submit your event work for today and review previous reports.' : 'Track today’s event reports and your team’s submissions.'}</p></div><div className="hero__actions"><Link to={`${base}/daily-reports`} className="btn btn-accent">{user.role === 'EMPLOYEE' ? 'Submit report' : 'View reports'}</Link>{user.role !== 'EMPLOYEE' && <Link to={`${base}/report-team`} className="btn hero__btn-glass">{user.role === 'MAIN_ADMIN' ? 'Manage team' : 'My employees'}</Link>}</div></section><DailyReportDashboard /></div>;
}
