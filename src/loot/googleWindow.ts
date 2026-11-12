// Google sign-in's separate window. Only a one-use landing code crosses the same-origin channel; the nonce
// and session stay in the game. BroadcastChannel survives OAuth pages severing the window's opener.
export interface GoogleReply { code?: string; error?: string }

/** Only the service's two fragment shapes can complete a sign-in. */
export function googleReply(fragment: string): GoogleReply | null {
  if (fragment.length > 512) return null;
  const values = new URLSearchParams(fragment.replace(/^#/, ''));
  const code = values.get('cloud-google');
  const error = values.get('cloud-google-error');
  if (code && /^[A-Za-z0-9_-]{16,128}$/.test(code) && !error) return { code };
  if (error && /^[a-z-]{1,40}$/.test(error) && !code) return { error };
  return null;
}

/** Opens synchronously inside the activating click, before requesting the OAuth address. Null means redirect. */
export function openGoogleWindow(signal: AbortSignal): {
  returnPath: string; result: Promise<GoogleReply | null>; navigate(url: string): void; focus(): void; close(): void;
} | null {
  let popup: Window | null = null;
  let channel: BroadcastChannel | null = null;
  try {
    const id = [...crypto.getRandomValues(new Uint8Array(24))].map((n) => n.toString(16).padStart(2, '0')).join('');
    channel = new BroadcastChannel(`last-stand.google.${id}`);
    popup = window.open('about:blank', '_blank', 'popup,width=520,height=700');
    if (!popup) { channel.close(); return null; }
    // Request foreground while the initiating click still has activation, including from fullscreen.
    try { popup.focus(); } catch { /* the browser owns whether a window may take focus */ }
    popup.opener = null;
    popup.document.title = 'Signing in to Last Stand';
    popup.document.body.textContent = 'Opening Google sign-in…';
    const callback = new URL('google-signin.html', location.href);
    callback.search = `attempt=${id}`;
    const bus = channel;
    const child = popup;
    let finish: (reply: GoogleReply | null) => void;
    let done = false;
    const result = new Promise<GoogleReply | null>((resolve) => { finish = resolve; });
    const focus = (): void => {
      if (done) return;
      try { child.focus(); } catch { /* COOP or the browser may refuse; the redirect fallback remains available */ }
    };
    const close = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      bus.postMessage({ type: 'close' });
      bus.close();
      try { child.close(); } catch { /* OAuth may have severed this window reference */ }
    };
    const settle = (reply: GoogleReply | null): void => { close(); finish(reply); };
    const cancel = (): void => settle(null);
    const timer = setTimeout(() => settle({ error: 'expired' }), 10 * 60_000);
    signal.addEventListener('abort', cancel, { once: true });
    bus.onmessage = (event: MessageEvent<unknown>) => {
      if (done || !event.data || typeof event.data !== 'object' || !('fragment' in event.data)) return;
      const fragment = event.data.fragment;
      const reply = typeof fragment === 'string' ? googleReply(fragment) : null;
      if (reply) settle(reply);
    };
    if (signal.aborted) cancel();
    return { returnPath: callback.pathname + callback.search, result,
      navigate: (url) => { if (!done) { child.location.replace(url); focus(); } }, focus, close: cancel };
  } catch {
    channel?.close();
    popup?.close();
    return null;
  }
}
