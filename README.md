# duane — Custom Stremio for WebOS

A from-scratch Stremio replacement for the LG 86NANO75UPA. Sideloads via WebOS Developer Mode.

## Quick start

```bash
npm install
npm run dev          # browser dev at http://localhost:5173
npm run test         # vitest unit tests
npm run deploy       # build IPK + ares-install to TV
```

## TV setup (one-time)

```bash
npm install -g @webos-tools/cli
ares-setup-device --add tv \
  --info "host=10.0.0.238,port=9922,username=prisoner,privatekey=/path/to/webos_rsa_dec,passphrase=,description=Living room LG"
```

The TV must have Developer Mode enabled and the dev mode app started (it expires every ~50 hours).

## First-run on the TV

1. Launch "duane" from the WebOS app menu
2. Go to Settings → enter your Real-Debrid API key (https://real-debrid.com/apitoken)
3. Adjust audio language and subtitle settings if needed
4. Back to Home — pick something and press Play

## Tech stack

- Preact 10 + TypeScript + Vite (target: chrome79)
- @preact/signals for state
- Vitest + happy-dom for unit tests
- Real-Debrid REST API + Torrentio addon + OpenSubtitles addon (all baked in, no user config)
- Custom spatial focus engine (`src/nav/spatial.ts`)
- Adaptive stream picker (`src/sources/picker.ts`) — codec probe + bandwidth probe + audio-language + subtitle pre-flight

## Project layout

See `docs/superpowers/specs/2026-05-09-stremio-webos-redesign-design.md`.
