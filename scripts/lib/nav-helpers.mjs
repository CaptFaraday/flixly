// Focusable testids on the Home screen include rows we don't want the smoke-
// test driver to land on while it's navigating poster rows by index. The hero
// is row 0, then BrandShelf (`brand-*`) sits ABOVE the first poster row when
// collections exist. Pressing Down from hero-play lands on the brand shelf;
// the smoke driver needs to press Down again to reach the first poster row.
// TopNav (`nav-*`) is also passthrough — D-pad Up from a row lands there and
// the driver should keep going up to hero-play.
export function shouldSkipFocusId(id) {
  if (!id) return false;
  return id.startsWith('brand-') || id.startsWith('nav-');
}
