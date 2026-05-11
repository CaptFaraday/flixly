import './BrandTile.css';
import { useFocusable } from '../nav/useFocusable';
import { BRAND_CONFIG } from '../data/brands';
import type { Collection } from '../types';

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
