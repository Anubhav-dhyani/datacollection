import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, LogOut, Menu } from 'lucide-react';
import { initials } from '../../domain/format';
import { roleHome, roleLabel, useCurrentUser, useSession } from '../../state/session';
import './Header.css';

interface Props { title: string; onOpenMenu: () => void; menuOpen: boolean }

export default function Header({ title, onOpenMenu, menuOpen }: Props) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { signOut } = useSession();
  return <header className="topbar">
    <div className="topbar__left">
      <button type="button" className="icon-btn topbar__menu" onClick={onOpenMenu} aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={menuOpen}><Menu size={20} /></button>
      <div className="topbar__title"><span className="topbar__crumb">{roleLabel[user.role]}</span><h1>{title}</h1></div>
    </div>
    <div className="topbar__actions">
      <Link to={`${roleHome[user.role]}/daily-reports`} className="btn btn-accent topbar__new"><BarChart3 size={18} /><span>{user.role === 'EMPLOYEE' ? 'Submit Report' : 'Daily Reports'}</span></Link>
      <span className="topbar__divider" aria-hidden="true" />
      <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
      <button type="button" className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => { signOut(); navigate('/login'); }}><LogOut size={20} /></button>
    </div>
  </header>;
}
