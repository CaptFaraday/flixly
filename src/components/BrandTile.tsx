import './BrandTile.css';
import { useFocusable } from '../nav/useFocusable';
import type { Collection } from '../types';

interface BrandConfig {
  bg: string;
  logo?: string;          // path to public/ SVG, e.g. '/brand-logos/a24.svg'
  logoFilter?: string;    // e.g. 'invert(1)' if the SVG is dark and needs to be white
}

const BRAND_CONFIG: Record<string, BrandConfig> = {
  a24: { bg: '#000', logo: '/brand-logos/a24.svg', logoFilter: 'invert(1)' },
  neon: { bg: '#00d4d4', logo: '/brand-logos/neon.svg' },
  'studio-ghibli': { bg: '#1e3a5f', logo: '/brand-logos/studio-ghibli.svg', logoFilter: 'invert(1)' },
  pixar: { bg: '#fef3c7', logo: '/brand-logos/pixar.svg' },
  marvel: { bg: '#ed1d24', logo: '/brand-logos/marvel.svg' },
  searchlight: { bg: '#f5b942', logo: '/brand-logos/searchlight.svg' },
  'focus-features': { bg: '#1a1a2e', logo: '/brand-logos/focus-features.svg', logoFilter: 'invert(1)' },
};

export function BrandTile({ collection, onActivate }: { collection: Collection; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `brand-${collection.id}` });
  const cfg = BRAND_CONFIG[collection.id];
  const bg = cfg?.bg ?? '#161616';
  return (
    <div ref={ref as any} {...rest} className="brand">
      <div
        className="brand__inner"
        style={{ background: `radial-gradient(ellipse 90% 70% at 30% 0%, rgba(255,255,255,0.10) 0%, transparent 55%), ${bg}` }}
      >
        <div className="brand__logo-box">
          {cfg?.logo ? (
            <img src={cfg.logo} alt={collection.title} className="brand__logo-img" style={cfg.logoFilter ? { filter: cfg.logoFilter } : undefined} />
          ) : (
            <span className="brand__fallback-text">{collection.title}</span>
          )}
        </div>
        <div className="brand__gloss" />
      </div>
    </div>
  );
}
