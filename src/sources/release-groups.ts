/**
 * Release-group quality bonuses, sourced from TRaSH-Guides custom-format
 * tiers (https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/).
 *
 * Returns a per-candidate score adjustment applied in picker.score:
 *   premium remux groups      +50
 *   premium HD BluRay groups  +40
 *   premium WEB-DL groups     +30
 *   good WEB-DL groups        +20
 *   standard WEB-DL groups    +10
 *   known low-quality groups  -50
 *
 * Unknown groups return 0 (neutral). The point is to break ties in favor
 * of known-good encoders and tilt away from known-bad ones — magnitudes
 * are small enough that resolution + source still dominate.
 */
const PREMIUM_REMUX = new Set(['3l', 'bizkit', 'bluranium', 'bmf', 'cinephiles', 'framestor', 'piramidhead', 'pmp', 'wildcat', 'zq', 'ctrlhd', 'mainframe', 'don', 'w4nk3r']);
const PREMIUM_WEB = new Set(['abbie', 'ajp69', 'apex', 'blutonium', 'byndr', 'cmrg', 'crfw', 'crud', 'flux', 'gnome', 'hone', 'kings', 'kitsune', 'nosivid', 'ntb', 'ntg', 'rawr', 'sic', 'tepes', 'thefarm']);
// TRaSH "Low Quality Groups" custom format — known to produce noisy
// encodes, ad-laden subs, or other quality issues that don't show up in
// resolution/codec/source signals alone.
const LOW_QUALITY = new Set(['24xhd', '41rgb', '4k4u', 'aoc', 'aroma', 'axxo', 'azaze', 'barc0de', 'bauckley', 'bdc', 'beast', 'btm', 'c1nem4', 'c4k', 'cddhd', 'chaos', 'chd', 'cine', 'collective', 'creative24', 'crewsade', 'ctfoh', 'd3g', 'ddr', 'dnl', 'drx', 'epic', 'eureka', 'fangding0', 'feranki1980', 'fgt', 'fmd', 'frds', 'fzhd', 'galaxyrg', 'ghd', 'gpthd', 'hdhub4u', 'hds', 'hdt', 'hdtime', 'hdwing', 'intenso', 'iplanet', 'ivy', 'jennaortega', 'jff', 'kc', 'kingdom', 'kira', 'l0sernight', 'lama', 'leffe', 'liber8', 'ligas', 'lucy', 'markii', 'megusta', 'mesc', 'mhd', 'msd', 'mteam', 'mysilu', 'nhanc3', 'nhd', 'nikt0', 'nogroup', 'nsd', 'oft', 'pahe', 'patomiel', 'prodji', 'psa', 'ptnk', 'r&h', 'rarbg', 'rdn', 'rifftrax', 'ru4hd', 'santi', 'scene', 'shd', 'shieldbearer', 'stuttershit', 'sunscreen', 'tbs', 'tekno3d', 'tigole', 'tiko', 'visionplushdr', 'waf', 'wiki', 'x0r', 'yify', 'yts', 'zeus']);

export function releaseGroupBonus(group: string | undefined): number {
  if (!group) return 0;
  const key = group.toLowerCase();
  if (PREMIUM_REMUX.has(key)) return 50;
  if (PREMIUM_WEB.has(key)) return 30;
  if (LOW_QUALITY.has(key)) return -50;
  return 0;
}
