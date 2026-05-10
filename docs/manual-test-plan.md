# Manual Test Plan — WebOS

Walk this list after each `npm run deploy`.

## Cold start
- [ ] App launches in under 2 seconds from app menu
- [ ] Home screen renders within 1 second of launch
- [ ] No flash of unstyled content; no console errors

## Spatial nav
- [ ] D-pad arrows move focus to a sensible nearest neighbor
- [ ] Focus glow is clearly visible (red outline + slight scale)
- [ ] OK/Enter activates the focused element
- [ ] Back button returns to the previous screen
- [ ] Holding D-pad in one direction keeps moving (not just one step)

## Home screen
- [ ] Hero auto-loads with a backdrop and title
- [ ] Brand shelf renders correctly
- [ ] Two rows are visible
- [ ] Posters lazy-load images smoothly

## Detail screen
- [ ] Backdrop, title, metadata, cast, overview render
- [ ] Watchlist toggle persists across cold restart
- [ ] Play button is initially focused

## Settings
- [ ] RD API key prompt accepts text via remote keyboard
- [ ] Toggles flip on activate
- [ ] Language cycles through options
- [ ] Settings persist across cold restart

## Playback (with valid RD key)
- [ ] "probing → fetching → checking RD → unrestricting" status updates flow
- [ ] Video starts within 10 seconds for a popular cached title
- [ ] English subtitles appear (small text, white)
- [ ] Resume: close mid-movie, relaunch → resumes within 5s of where you left
- [ ] Back during playback returns to Detail; resume saved

## Error paths
- [ ] No RD key → clear error: "Set your Real-Debrid API key in Settings"
- [ ] Invalid RD key → clear error: "Real-Debrid request failed"
- [ ] Obscure movie with no streams → "No sources found"
- [ ] H.265-only movie on H.265-unsupported TV → "All cached versions use a video codec your TV can't play"

## TODOs to verify on first deploy
- [ ] Verify `instantAvailability` endpoint still works on first deploy; community reports it may be deprecated. If RD has removed it, swap `RDClient.checkCache` for an "add magnet, poll info" probe.
