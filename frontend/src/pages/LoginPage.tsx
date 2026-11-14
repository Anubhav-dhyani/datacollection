import { useState, type CSSProperties, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Eye, EyeOff, ImageIcon, Loader2, Lock, MapPin, TriangleAlert, User } from 'lucide-react';
import logo from '../assets/geu-logo.png';
import { roleHome, useSession } from '../state/session';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user && !busy) return <Navigate to={user.passwordChangeRequired ? '/change-password' : roleHome[user.role]} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      if (!email.trim() || !password) throw new Error('Enter your email and password.');
      const signedIn = await signIn(email.trim(), password);
      navigate(signedIn.passwordChangeRequired ? '/change-password' : roleHome[signedIn.role], { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  return <div className="login">
    <section className="login-brand" aria-label="About the portal">
      <div className="login-brand__bg" aria-hidden="true" />
      <header className="login-brand__top rise-in"><img src={logo} alt="Graphic Era deemed to be University, Dehradun" className="login-brand__logo" /></header>
      <div className="login-brand__intro rise-in" style={{ '--i': 1 } as CSSProperties}>
        <span className="login-brand__eyebrow"><span className="live-dot" aria-hidden="true" /> Daily Event Reporting Portal</span>
        <h1 className="login-brand__title">Record it. Submit it. <span>Track it.</span></h1>
        <p className="login-brand__lead">Submit daily event activity with location-tagged pictures and keep your team informed.</p>
      </div>
      <div className="login-brand__scene rise-in" style={{ '--i': 2 } as CSSProperties}><div className="login-preview" aria-hidden="true"><div className="login-preview__top"><span><CalendarDays size={18} /> Daily report</span><span className="login-preview__dot" /></div><div className="login-preview__line login-preview__line--long" /><div className="login-preview__line" /><div className="login-preview__photo"><ImageIcon size={42} /></div><div className="login-preview__foot"><span><MapPin size={16} /> Location attached</span><span>Submitted</span></div></div></div>
    </section>
    <main className="login-main">
      <div className="login-card rise-in" style={{ '--i': 2 } as CSSProperties}>
        <div className="login-card__head"><span className="login-card__badge"><Lock size={14} aria-hidden="true" /> Secure sign-in</span><h2>Welcome back</h2><p>Sign in with your registered email and password.</p></div>
        {error && <div className="login-alert" role="alert"><TriangleAlert size={18} />{error}</div>}
        <form onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email address</label><div className="field__control"><User size={18} className="field__icon" aria-hidden="true" /><input id="email" type="email" autoComplete="username" placeholder="name@geu.ac.in" value={email} onChange={e => setEmail(e.target.value)} required /></div></div>
            <div className="field"><div className="field__label-row"><label htmlFor="password">Password</label><span className="field__link">For password help, contact the portal administrator.</span></div><div className="field__control"><Lock size={18} className="field__icon" aria-hidden="true" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="field__toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> Please wait…</> : <>Sign in <ArrowRight size={18} /></>}</button>
        </form>
      </div>
      <p className="login-copy">© {new Date().getFullYear()} Graphic Era (Deemed to be University), Dehradun</p>
    </main>
  </div>;
}
