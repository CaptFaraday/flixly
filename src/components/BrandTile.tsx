import { useFocusable } from '../nav/useFocusable';
import type { Collection } from '../types';

export function BrandTile({ collection, onActivate }: { collection: Collection; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `brand-${collection.id}` });
  const bg = collection.background_color ?? '#161616';
  return (
    <div
      ref={ref as any}
      {...rest}
      style={{
        ...tileStyle,
        // Layered background: subtle radial highlight at top-left + base color
        // gives a hint of dimensionality so it doesn't read as a flat color block.
        background: `radial-gradient(ellipse 90% 70% at 30% 0%, rgba(255,255,255,0.10) 0%, transparent 55%), ${bg}`,
      }}
    >
      {collection.logo_url
        ? <img src={collection.logo_url} alt={collection.title} style={logoStyle} />
        : <span style={textStyleFor(collection.id)}>{collection.title}</span>}
      {/* Glassy highlight strip across the top edge */}
      <div style={glossStyle} />
    </div>
  );
}

const tileStyle: any = {
  aspectRatio: '16/9', borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'hidden', cursor: 'pointer',
  border: '1px solid rgba(240,236,228,0.08)',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)',
  position: 'relative',
};
const glossStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)',
  pointerEvents: 'none',
};
const logoStyle: any = { maxWidth: '70%', maxHeight: '60%' };

function textStyleFor(id: string): any {
  const base: any = {
    color: '#fff', textTransform: 'uppercase', fontWeight: 800,
    letterSpacing: '0.18em', fontSize: 26,
    textAlign: 'center', lineHeight: 1.05,
  };
  if (id === 'a24') return { ...base, fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em', fontStyle: 'italic', fontSize: 36, textTransform: 'none' };
  if (id === 'neon') return { ...base, fontWeight: 900, letterSpacing: '0.04em', fontSize: 30 };
  if (id === 'studio-ghibli' || id === 'searchlight' || id === 'focus-features') {
    return { ...base, fontSize: 16, letterSpacing: '0.20em' };
  }
  return base;
}
