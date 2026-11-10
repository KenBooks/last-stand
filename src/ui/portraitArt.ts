// URL strings only: importing this manifest neither fetches nor decodes the portrait pictures.
const pictures = import.meta.glob<string>([
  './portraits/mage/portrait-mage-{11,12,13,14,15}.webp',
  './portraits/warrior/portrait-warrior-{11,12,13,14,15}.webp',
  './portraits/ranger/portrait-ranger-{11,12,13,14,15}.webp',
], {
  eager: true, query: '?url&no-inline', import: 'default',
});
const urls = new Map(Object.entries(pictures).map(([path, url]) => [
  path.slice(path.lastIndexOf('/') + 1, -'.webp'.length).replace('portrait-', ''), url,
]));

/** A packaged portrait's URL. No external URL, eager Image or image preload is ever created here. */
export const portraitUrl = (id: string): string | undefined => urls.get(id);
