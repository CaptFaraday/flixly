import './BrandTile.css';
import { useFocusable } from '../nav/useFocusable';
import type { Collection } from '../types';

export function BrandTile({ collection, onActivate }: { collection: Collection; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `brand-${collection.id}` });
  const cfg = LOGO_CONFIG[collection.id] ?? LOGO_CONFIG.default;
  return (
    <div ref={ref as any} {...rest} className="brand">
      <div
        className="brand__inner"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 30% 0%, rgba(255,255,255,0.10) 0%, transparent 55%), ${cfg.bg}`,
        }}
      >
        <div className="brand__logo">{cfg.logo(collection.title)}</div>
        <div className="brand__gloss" />
      </div>
    </div>
  );
}

interface LogoConfig {
  bg: string;
  logo: (title: string) => any;
}

const LOGO_CONFIG: Record<string, LogoConfig> = {
  a24: {
    bg: '#000',
    logo: () => (
      <svg viewBox="0 0 200 90" className="brand__svg">
        <text x="100" y="68" textAnchor="middle"
          fontFamily="Times New Roman, Georgia, serif" fontSize="78" fontWeight="400" fill="#f1f1f1" fontStyle="italic">A24</text>
      </svg>
    ),
  },
  neon: {
    bg: '#00d4d4',
    logo: () => (
      <svg viewBox="0 0 240 80" className="brand__svg">
        <text x="120" y="62" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="62" fontWeight="900" fill="#001a1a" letterSpacing="4">NEON</text>
      </svg>
    ),
  },
  'studio-ghibli': {
    bg: '#1e3a5f',
    logo: () => (
      // Stylized Totoro silhouette + wordmark
      <svg viewBox="0 0 220 110" className="brand__svg">
        <ellipse cx="60" cy="58" rx="32" ry="42" fill="#f0ece4"/>
        <ellipse cx="60" cy="36" rx="24" ry="22" fill="#f0ece4"/>
        <polygon points="48,18 52,2 56,18" fill="#f0ece4"/>
        <polygon points="64,18 68,2 72,18" fill="#f0ece4"/>
        <circle cx="52" cy="36" r="3.5" fill="#1e3a5f"/>
        <circle cx="68" cy="36" r="3.5" fill="#1e3a5f"/>
        <text x="155" y="50" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="20" fontWeight="700" fill="#f0ece4" letterSpacing="1.5">STUDIO</text>
        <text x="155" y="78" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="20" fontWeight="700" fill="#f0ece4" letterSpacing="1.5">GHIBLI</text>
      </svg>
    ),
  },
  pixar: {
    bg: '#fef3c7',
    logo: () => (
      // Stylized lamp shape + wordmark
      <svg viewBox="0 0 240 100" className="brand__svg">
        <ellipse cx="36" cy="86" rx="22" ry="6" fill="#0a1a2a"/>
        <rect x="32" y="56" width="8" height="30" fill="#0a1a2a"/>
        <ellipse cx="36" cy="46" rx="14" ry="10" fill="#0a1a2a"/>
        <text x="135" y="75" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="58" fontWeight="900" fill="#0a1a2a" letterSpacing="-2">PIXAR</text>
      </svg>
    ),
  },
  marvel: {
    bg: '#ed1d24',
    logo: () => (
      // White rectangle frame with MARVEL inside (their iconic banner)
      <svg viewBox="0 0 260 80" className="brand__svg">
        <rect x="6" y="6" width="248" height="68" fill="#ed1d24" stroke="#f1f1f1" strokeWidth="0"/>
        <text x="130" y="58" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="48" fontWeight="900" fill="#f1f1f1" letterSpacing="2">MARVEL</text>
      </svg>
    ),
  },
  searchlight: {
    bg: '#f5b942',
    logo: () => (
      // Sun-rays motif + Searchlight Pictures wordmark
      <svg viewBox="0 0 280 120" className="brand__svg">
        <g stroke="#1a1a1a" strokeWidth="1.5" fill="none">
          {/* Rays radiating from top */}
          <line x1="140" y1="10" x2="80"  y2="40"/>
          <line x1="140" y1="10" x2="100" y2="30"/>
          <line x1="140" y1="10" x2="140" y2="22"/>
          <line x1="140" y1="10" x2="180" y2="30"/>
          <line x1="140" y1="10" x2="200" y2="40"/>
        </g>
        <text x="140" y="68" textAnchor="middle"
          fontFamily="Times New Roman, Georgia, serif" fontSize="22" fontWeight="700" fill="#1a1a1a" letterSpacing="3">SEARCHLIGHT</text>
        <text x="140" y="98" textAnchor="middle"
          fontFamily="Times New Roman, Georgia, serif" fontSize="16" fontWeight="400" fill="#1a1a1a" letterSpacing="6">PICTURES</text>
      </svg>
    ),
  },
  'focus-features': {
    bg: '#1a1a2e',
    logo: () => (
      <svg viewBox="0 0 280 80" className="brand__svg">
        <text x="140" y="40" textAnchor="middle"
          fontFamily="Times New Roman, Georgia, serif" fontSize="32" fontWeight="400" fill="#f0ece4" fontStyle="italic">focus</text>
        <text x="140" y="64" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="13" fontWeight="600" fill="#f0ece4" letterSpacing="6">FEATURES</text>
      </svg>
    ),
  },
  default: {
    bg: '#161616',
    logo: (title: string) => (
      <svg viewBox="0 0 240 60" className="brand__svg">
        <text x="120" y="44" textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif" fontSize="24" fontWeight="800" fill="#f1f1f1" letterSpacing="2">{title.toUpperCase()}</text>
      </svg>
    ),
  },
};
