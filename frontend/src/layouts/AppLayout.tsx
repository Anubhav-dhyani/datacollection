import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import { navByRole } from '../config/navigation';
import { useEdgeSwipe } from '../hooks/useEdgeSwipe';
import { roleHome, useSession } from '../state/session';
import type { Role, User } from '../domain/types';
import './AppLayout.css';

const PIN_KEY = 'geu.sidebarPinned';

function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppLayout({ role }: { role: Role }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  if (user.passwordChangeRequired) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={roleHome[user.role]} replace />;
  return <Shell user={user} />;
}

function Shell({ user }: { user: User }) {
  const { pathname } = useLocation();
  const [pinned, setPinned] = useState(readPinned);
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = navByRole[user.role];

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  useEdgeSwipe({ open: mobileOpen, onOpen: openMobile, onClose: closeMobile });

  const togglePin = () => {
    setPinned((p) => {
      try {
        localStorage.setItem(PIN_KEY, p ? '0' : '1');
      } catch {
        /* storage unavailable: preference just won't persist */
      }
      return !p;
    });
  };

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const title = useMemo(() => {
    const item = nav.flatMap((g) => g.items).find((i) => i.path === pathname);
    if (item) return item.label;
    return 'Dashboard';
  }, [nav, pathname]);

  return (
    <div className={`shell ${pinned ? 'shell--pinned' : ''}`}>
      <div className="shell__ambient" aria-hidden="true" />
      <Sidebar
        nav={nav}
        pinned={pinned}
        onTogglePin={togglePin}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div className="shell__main">
        <Header title={title} onOpenMenu={openMobile} menuOpen={mobileOpen} />
        <main className="shell__content" key={pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
