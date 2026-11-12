// Save Slots' private identity display at the UI's screen sizes. Account snapshots are explicit fixtures here;
// the real OAuth/session boundaries and persistence are checked by server/saves/test/google.test.mjs.
import { CLOUD, cloudIdentityHTML } from '../../../src/ui/cloudSaves';
import { openSaves } from '../../../src/ui/saves';

const EMAIL = 'a.long.google.account.address.for.testing.wrapping@a.long.example.test';
export const CLOUD_IDENTITY_CANARY = { name: 'email missing', what: 'the Google email removed from the slot' };
let realFetch: typeof fetch;

export function openCloudIdentity(): void {
  realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
    if (path === '/saves/health') return Response.json({ ok: true, google: true });
    if (path.startsWith('/saves/')) throw new Error('lab: identity snapshots must not contact a live account');
    return realFetch(input, init);
  };
  openSaves(true);
  const header = document.querySelector('#saves .sv-pane .sv-head')!;
  header.insertAdjacentHTML('beforeend', `<div class="sv-cloud-info"><span class="sv-cloud-mark">${CLOUD}<span>Cloud</span></span><div class="sv-account">${cloudIdentityHTML({
    google: true, passkey: true, session: { via: 'google', email: EMAIL },
  })}</div></div>`);
}

export function closeCloudIdentity(): void {
  document.querySelector('#saves .sv-cloud-info')?.remove();
  openSaves(false);
  window.fetch = realFetch;
}

/** Current authentication, linked methods, safe text, and the real slot's wrapping/layout are checked separately. */
export function cloudIdentityChecked(canary: boolean): { lines: string[]; problems: string[] } {
  const problems: string[] = [];
  for (const via of ['passkey', 'code'] as const) {
    const box = document.createElement('div');
    box.innerHTML = cloudIdentityHTML({ google: true, passkey: true, session: { via } });
    if (box.querySelector('.sc-identity svg') || !box.textContent?.includes(`Signed in with a ${via}`)) {
      problems.push(`cloudIdentity: linked Google mislabels a ${via} session`);
    }
    if (!box.textContent?.includes('Linked: Google + Passkey')) problems.push('cloudIdentity: linked methods missing');
    if (!box.querySelector('.sc-methods svg')) problems.push('cloudIdentity: linked Google logo missing');
  }
  const unsafe = document.createElement('div');
  const text = '<img src=x onerror="throw 1">@example.test';
  unsafe.innerHTML = cloudIdentityHTML({ google: true, session: { via: 'google', email: text } });
  if (unsafe.querySelector('img') || !unsafe.textContent?.includes(text)) problems.push('cloudIdentity: email is interpreted as HTML');
  const legacy = cloudIdentityHTML({ google: true, session: { via: 'google' } });
  if (!legacy.includes('sign in again to show email')) problems.push('cloudIdentity: older Google session has no explanation');
  const panel = document.querySelector<HTMLElement>('#saves .sv-account')!;
  const button = document.querySelector<HTMLElement>('#saves .sc-google');
  if (!button?.querySelector('svg')) problems.push('cloudIdentity: Google sign-in button logo missing');
  if (button) {
    const box = button.getBoundingClientRect();
    if (!button.checkVisibility() || box.left < 0 || box.right > innerWidth || box.bottom > innerHeight) {
      problems.push('cloudIdentity: Google sign-in button is not visible within the window');
    }
  }
  const unknown = cloudIdentityHTML({ google: true });
  if (!unknown.includes('login details unavailable')) problems.push('cloudIdentity: missing session details unexplained');
  if (canary) panel.querySelector('b')!.textContent = '';
  if (!panel.textContent?.includes(EMAIL)) problems.push('cloudIdentity: email missing');
  if (!panel.querySelector('svg')?.checkVisibility()) problems.push('cloudIdentity: Google logo missing');
  const bounds = panel.getBoundingClientRect();
  const header = panel.closest('.sv-head');
  if (!header || bounds.right < header.getBoundingClientRect().right - 35) problems.push('cloudIdentity: identity is not at the right of the header');
  const privacy = document.querySelector('#saves .sc-privacy')!.getBoundingClientRect();
  const lastButton = document.querySelector('#saves .sc-code')!.getBoundingClientRect();
  if (privacy.top >= lastButton.bottom || privacy.bottom <= lastButton.top) problems.push('cloudIdentity: Privacy is on a separate line from the buttons');
  const pane = panel.closest('.sv-pane')!.getBoundingClientRect();
  for (const node of panel.querySelectorAll<HTMLElement>('span, b, svg')) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) {
      if (box.left < pane.left - 1 || box.right > pane.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) {
        problems.push('cloudIdentity: identity text overflows the cloud slot');
      }
    }
  }
  if (bounds.bottom > innerHeight || bounds.top < 0) problems.push('cloudIdentity: identity is outside the window');
  const body = panel.closest('.sv-pane')!.querySelector('.sv-body')!.getBoundingClientRect();
  if (body.top < bounds.bottom - 1 || body.height < 20) problems.push('cloudIdentity: identity overlaps the heroes');
  return { lines: ['  Google email/logo, Google + Passkey, passkey/code sessions, old sessions and escaped text checked',
    `  identity ${Math.round(bounds.width)} × ${Math.round(bounds.height)} px within its slot`], problems };
}
