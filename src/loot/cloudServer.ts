// Cloud credentials go only to the server baked into the game. A co-op ?server= link must not redirect them.
// The lab may use a loopback saves service in a dev build; no public build passes that override.
export function cloudServerHttp(configured: string, devOverride: string | null): string {
  const built = configured.replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
  if (!devOverride) return built;
  try {
    const candidate = new URL(devOverride.replace(/^ws(s?):/, 'http$1:'));
    if (!['http:', 'https:'].includes(candidate.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname)
      || candidate.username || candidate.password || candidate.pathname !== '/' || candidate.search || candidate.hash) return built;
    return candidate.origin;
  } catch { return built; }
}
