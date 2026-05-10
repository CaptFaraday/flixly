import { useFocusable } from '../nav/useFocusable';

interface Props {
  current: 'home' | 'search' | 'library' | 'settings';
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function TopNav({ current, onNavigate }: Props) {
  const items: Props['current'][] = ['home', 'search', 'library', 'settings'];
  return (
    <nav style={navStyle}>
      <span style={logoStyle}>FLIXLY</span>
      <div style={{ flex: 1, display: 'flex', gap: 36 }}>
        {items.map((id) => <NavItem key={id} id={id} active={current === id} onActivate={() => onNavigate(id)} />)}
      </div>
    </nav>
  );
}

function NavItem({ id, active, onActivate }: { id: string; active: boolean; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `nav-${id}` });
  return (
    <span
      ref={ref as any}
      {...rest}
      style={{ ...navItemStyle, opacity: active ? 1 : 0.7, fontWeight: active ? 700 : 500 }}
    >
      {id[0].toUpperCase() + id.slice(1)}
    </span>
  );
}

const navStyle: any = {
  position: 'fixed', top: 0, left: 0, right: 0, height: 80, zIndex: 30,
  display: 'flex', alignItems: 'center', padding: '0 64px', gap: 56,
  background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 70%, transparent 100%)',
};
// Netflix-style wordmark: bold sans, tight tracking, vibrant red, slight drop shadow.
const logoStyle: any = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 900,
  fontSize: 28,
  letterSpacing: '0.04em',
  color: 'var(--accent)',
  textTransform: 'uppercase',
  textShadow: '0 2px 14px rgba(229, 9, 20, 0.45)',
  marginRight: 12,
};
const navItemStyle: any = {
  fontSize: 18, color: 'var(--text)', cursor: 'pointer',
  padding: '6px 14px', borderRadius: 4,
  textShadow: '0 1px 8px rgba(0,0,0,0.7)',
};
