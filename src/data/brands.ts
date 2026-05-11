export interface BrandConfig {
  bg: string;
  logo?: string;
  logoFilter?: string;
}

export const BRAND_CONFIG: Record<string, BrandConfig> = {
  a24: { bg: '#000', logo: 'brand-logos/a24.svg', logoFilter: 'invert(1)' },
  neon: { bg: '#00d4d4', logo: 'brand-logos/neon.svg' },
  'studio-ghibli': { bg: '#1e3a5f', logo: 'brand-logos/studio-ghibli.svg', logoFilter: 'invert(1)' },
  pixar: { bg: '#fef3c7', logo: 'brand-logos/pixar.svg' },
  marvel: { bg: '#ed1d24', logo: 'brand-logos/marvel.svg' },
  searchlight: { bg: '#f5b942', logo: 'brand-logos/searchlight.svg' },
  'focus-features': { bg: '#1a1a2e', logo: 'brand-logos/focus-features.svg', logoFilter: 'invert(1)' },
};
