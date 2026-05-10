import { useFocusable } from '../nav/useFocusable';

interface Props {
  current: 'home' | 'search' | 'library' | 'settings';
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function TopNav({ current, onNavigate }: Props) {
  const items: Props['current'][] = ['home', 'search', 'library', 'settings'];
  return (
    <nav style={navStyle}>
      <div style={logoStyle}>
        <span style={logoMarkStyle}>D</span>
        <span style={logoTextStyle}>UANE</span>
      </div>
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
  position: 'absolute', top: 0, left: 0, right: 0, height: 80, zIndex: 30,
  display: 'flex', alignItems: 'center', padding: '0 64px', gap: 56,
  // Stronger top fade so nav stays legible over any hero artwork
  background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 70%, transparent 100%)',
};
const logoStyle: any = {
  display: 'flex', alignItems: 'baseline',
  fontFamily: 'var(--font-ui)', fontWeight: 900, letterSpacing: '0.02em',
  textTransform: 'uppercase',
};
const logoMarkStyle: any = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: 6, background: 'var(--accent)',
  color: '#fff', fontSize: 22, fontWeight: 900, marginRight: 10,
  boxShadow: '0 4px 14px rgba(229, 9, 20, 0.4)',
};
const logoTextStyle: any = {
  fontSize: 18, fontWeight: 800, letterSpacing: '0.18em',
  color: 'var(--text)',
};
const navItemStyle: any = {
  fontSize: 18, color: 'var(--text)', cursor: 'pointer',
  padding: '6px 14px', borderRadius: 4,
  textShadow: '0 1px 8px rgba(0,0,0,0.7)',
};
