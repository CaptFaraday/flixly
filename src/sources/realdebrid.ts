const BASE = 'https://api.real-debrid.com/rest/1.0';

export class RDClient {
  constructor(private apiKey: string) {}

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`RD api ${r.status}: ${await r.text().catch(() => '')}`);
    return r;
  }

  /** Returns the subset of hashes RD has cached. */
  async checkCache(hashes: string[]): Promise<string[]> {
    if (hashes.length === 0) return [];
    const path = `/torrents/instantAvailability/${hashes.join('/')}`;
    const r = await this.req(path);
    const data = (await r.json()) as Record<string, unknown>;
    const cached: string[] = [];
    for (const [hash, val] of Object.entries(data)) {
      // RD returns either an empty array (not cached) or a non-empty object {rd: [{...}]}
      if (val && typeof val === 'object' && 'rd' in (val as object)) cached.push(hash);
    }
    return cached;
  }

  /** Add a magnet, then unrestrict the largest video file in it. Returns CDN URL. */
  async unrestrict(infoHash: string): Promise<string> {
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;
    const addBody = new URLSearchParams({ magnet });
    const addR = await this.req('/torrents/addMagnet', { method: 'POST', body: addBody });
    const { id } = (await addR.json()) as { id: string };

    // Select all files (RD requires a selection; pass "all")
    const selectBody = new URLSearchParams({ files: 'all' });
    await this.req(`/torrents/selectFiles/${id}`, { method: 'POST', body: selectBody });

    // Poll until ready (cached should be near-instant; cap at 8 seconds)
    let info: any;
    for (let i = 0; i < 16; i++) {
      const ir = await this.req(`/torrents/info/${id}`);
      info = await ir.json();
      if (info.status === 'downloaded') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (info.status !== 'downloaded') throw new Error('RD: torrent not cached or stalled');

    // Pick largest file's link
    const links: string[] = info.links;
    if (!links?.length) throw new Error('RD: no links returned');

    // unrestrict the largest link
    const unBody = new URLSearchParams({ link: links[0] });
    const unR = await this.req('/unrestrict/link', { method: 'POST', body: unBody });
    const { download } = (await unR.json()) as { download: string };
    return download;
  }
}
