import { navInstance } from './useFocusable';

const KEY_MAP: Record<number, 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  461: 'back',  // WebOS Back button
  10009: 'back', // Tizen Back; harmless for LG, kept for safety
  27: 'back',   // Esc as in-browser fallback
};

export function installInputListener(onBack?: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.keyCode];
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'up': case 'down': case 'left': case 'right':
        navInstance.move(action);
        break;
      case 'enter':
        navInstance.activate();
        break;
      case 'back':
        onBack?.();
        break;
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
