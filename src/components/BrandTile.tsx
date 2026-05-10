import { useFocusable } from '../nav/useFocusable';
import type { Collection } from '../types';

export function BrandTile({ collection, onActivate }: { collection: Collection; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `brand-${collection.id}` });
  return (
    <div ref={ref as any} {...rest} style={{ ...tileStyle, background: collection.background_color ?? '#222' }}>
      {collection.logo_url
        ? <img src={collection.logo_url} alt={collection.title} style={logoStyle} />
        : <span style={textStyle}>{collection.title}</span>}
    </div>
  );
}

const tileStyle: any = { aspectRatio: '16/9', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' };
const logoStyle: any = { maxWidth: '70%', maxHeight: '60%' };
const textStyle: any = { fontWeight: 800, letterSpacing: '1.5px', fontSize: 18, color: '#fff' };
