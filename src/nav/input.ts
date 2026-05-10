import { navInstance } from './useFocusable';

const KEY_MAP: Record<number, 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  461: 'back',  // WebOS Back button (most common)
  10009: 'back', // Tizen Back (harmless on LG)
  27: 'back',   // Esc — browser fallback
  8: 'back',    // Backspace — some remotes
};

// Some WebOS keyboards report via KeyboardEvent.key instead of keyCode (older Chromium
// inconsistencies). Map those too.
const KEY_NAME_MAP: Record<string, 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Back: 'back',          // WebOS sometimes dispatches this name
  GoBack: 'back',
  Escape: 'back',
  Backspace: 'back',
};

let installed = false;

export function installInputListener(onBack?: () => void): () => void {
  // Push a sentinel history state so the WebView's native "back" navigation stays
  // inside our SPA. WebOS's Back button can otherwise unload the page and close the
  // app, especially on the first navigation level.
  if (!installed) {
    try { window.history.pushState({ flixly: true }, ''); } catch { /* no-op */ }
    installed = true;
  }

  const handler = (e: KeyboardEvent) => {
    // Lookup by keyCode first (most reliable on WebOS), then by event.key.
    const action = KEY_MAP[e.keyCode] ?? KEY_NAME_MAP[e.key];
    if (!action) return;

    // Block the system-default behavior for ALL handled keys. For Back specifically,
    // this is what prevents WebOS from closing the app.
    e.preventDefault();
    e.stopPropagation();

    switch (action) {
      case 'up': case 'down': case 'left': case 'right':
        navInstance.move(action);
        break;
      case 'enter':
        navInstance.activate();
        break;
      case 'back':
        onBack?.();
        // Re-arm the history sentinel so subsequent Back presses still get caught
        try { window.history.pushState({ flixly: true }, ''); } catch { /* no-op */ }
        break;
    }
  };

  // popstate fires when the system / remote triggers history.back() directly,
  // which some WebOS variants do for the Back button instead of a keydown.
  const onPopState = () => {
    onBack?.();
    try { window.history.pushState({ flixly: true }, ''); } catch { /* no-op */ }
  };

  // Capture phase + window-level listener so we run BEFORE any inner element's
  // default handlers (notably the native <video controls> on the player screen).
  window.addEventListener('keydown', handler, true);
  window.addEventListener('popstate', onPopState);

  return () => {
    window.removeEventListener('keydown', handler, true);
    window.removeEventListener('popstate', onPopState);
  };
}
