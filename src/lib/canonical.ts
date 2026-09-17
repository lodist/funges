// /species 301s to /species/ on GitHub Pages; canonical must name the served URL.
export function canonicalHref(path: string, origin: string): string {
  const url = new URL(path, origin);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}
