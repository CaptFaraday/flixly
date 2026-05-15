// Minimal typed wrapper around PalmServiceBridge — webOS's native Luna RPC.
// Available on every webOS device (no library to vendor). Lets a web app
// talk to system services like com.webos.media for hardware subtitles,
// audio track selection, and finer-grained playback events than the
// HTMLMediaElement spec exposes.
//
// Why not webOSTV.js: that's just a friendlier wrapper around the same
// PalmServiceBridge below. We don't need its extras (notifications, deep
// links) and shipping ~30 KB of vendored JS for "request()" feels silly.

declare global {
  // PalmServiceBridge is provided by the webOS web runtime. Not in lib.dom.
  interface PalmServiceBridge {
    subscribe: boolean;
    onservicecallback: ((msg: string) => void) | null;
    call(uri: string, params: string): void;
    cancel(): void;
  }
  const PalmServiceBridge: { new (): PalmServiceBridge } | undefined;
}

export function isLunaAvailable(): boolean {
  return typeof PalmServiceBridge === 'function';
}

/**
 * Single-shot Luna request. Resolves with the parsed response on success,
 * rejects with the response object on Luna-reported errors. Use for `load`,
 * `play`, `pause`, `seek`, `setSubtitleSource`, `selectTrack`, etc.
 */
export function lunaCall<TParams extends object, TResult = Record<string, unknown>>(
  uri: string,
  params: TParams,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    if (!isLunaAvailable()) { reject(new Error('Luna unavailable (not webOS or sandboxed)')); return; }
    const bridge = new (PalmServiceBridge as { new (): PalmServiceBridge })();
    bridge.onservicecallback = (msg: string) => {
      try {
        const resp = JSON.parse(msg) as { returnValue?: boolean; errorCode?: number; errorText?: string } & Record<string, unknown>;
        if (resp.returnValue === false || (resp.errorCode != null && resp.errorCode !== 0)) {
          reject(resp);
          return;
        }
        resolve(resp as unknown as TResult);
      } catch (e) {
        reject(e);
      }
    };
    bridge.call(uri, JSON.stringify(params));
  });
}

export interface LunaSubscription {
  cancel(): void;
}

/**
 * Open a long-lived Luna subscription. The callback fires for each event
 * the service sends. Returns a handle whose .cancel() tears down the
 * subscription. Use for `com.webos.media/subscribe` (currentTime,
 * bufferingStart/End, sourceInfo, audioInfo, error, endOfStream events).
 */
export function lunaSubscribe<TEvent = Record<string, unknown>>(
  uri: string,
  params: object,
  onEvent: (event: TEvent) => void,
): LunaSubscription {
  if (!isLunaAvailable()) {
    return { cancel: () => { /* no-op outside webOS */ } };
  }
  const bridge = new (PalmServiceBridge as { new (): PalmServiceBridge })();
  bridge.subscribe = true;
  bridge.onservicecallback = (msg: string) => {
    try {
      const ev = JSON.parse(msg) as TEvent;
      onEvent(ev);
    } catch { /* malformed event — ignore */ }
  };
  bridge.call(uri, JSON.stringify(params));
  return {
    cancel: () => {
      try { bridge.cancel(); } catch { /* */ }
      bridge.onservicecallback = null;
    },
  };
}
