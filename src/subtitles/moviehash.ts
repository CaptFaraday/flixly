// OpenSubtitles moviehash — a 64-bit checksum computed from the file size,
// the first 64 KB of the file, and the last 64 KB of the file. Subtitles
// uploaded with this hash are guaranteed to match the EXACT same rip
// (frame-accurate, correct cuts, right framerate). This is the only
// reliable way to avoid the "subs drift / are for a different cut" bug.
//
// Algorithm reference: https://trac.opensubtitles.org/projects/opensubtitles/wiki/HashSourceCodes
// JS port using BigInt arithmetic (Chromium 79 / WebOS 6 supports BigInt
// and DataView.getBigUint64 since Chrome 67).

const CHUNK_BYTES = 64 * 1024;
const MASK_64 = (1n << 64n) - 1n;

function sumChunk(buf: ArrayBuffer): bigint {
  const view = new DataView(buf);
  let sum = 0n;
  // The reference algorithm reads 8-byte (64-bit) integers little-endian and
  // sums them mod 2^64. Truncate to a multiple of 8 in case the server
  // returned a slightly-shorter chunk than requested.
  const limit = buf.byteLength - (buf.byteLength % 8);
  for (let i = 0; i < limit; i += 8) {
    sum = (sum + view.getBigUint64(i, true)) & MASK_64;
  }
  return sum;
}

export interface MoviehashResult {
  hash: string;        // 16-char lowercase hex
  size: number;        // file size in bytes
}

/**
 * Compute the OpenSubtitles moviehash for a remote file via HTTP Range requests.
 * Returns null if the server doesn't support Range / HEAD, the file is too small,
 * or anything else goes wrong. Caller should fall back to imdb-id-based lookup.
 */
export async function computeMoviehash(url: string): Promise<MoviehashResult | null> {
  try {
    // HEAD to learn the size. Some CDNs honor Range on GET but not HEAD —
    // if that happens we fall back to a tiny Range GET to read the
    // Content-Range header.
    let size = 0;
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) {
      const len = head.headers.get('content-length');
      if (len) size = Number(len);
    }
    if (!size) {
      const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      const contentRange = probe.headers.get('content-range'); // "bytes 0-0/12345678"
      const match = contentRange?.match(/\/(\d+)$/);
      if (match) size = Number(match[1]);
    }
    if (!size || size < CHUNK_BYTES * 2) return null;

    const [firstResp, lastResp] = await Promise.all([
      fetch(url, { headers: { Range: `bytes=0-${CHUNK_BYTES - 1}` } }),
      fetch(url, { headers: { Range: `bytes=${size - CHUNK_BYTES}-${size - 1}` } }),
    ]);
    if (!firstResp.ok || !lastResp.ok) return null;
    const [first, last] = await Promise.all([firstResp.arrayBuffer(), lastResp.arrayBuffer()]);

    let hash = BigInt(size) & MASK_64;
    hash = (hash + sumChunk(first)) & MASK_64;
    hash = (hash + sumChunk(last)) & MASK_64;

    return { hash: hash.toString(16).padStart(16, '0'), size };
  } catch {
    return null;
  }
}
