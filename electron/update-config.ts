/**
 * GitHub Releases (recommended) — set your repo, then publish with the guide in scripts/release-github.ps1
 * Railway /generic fallback — set USE_GITHUB_RELEASES = false and UPDATE_FEED_URL instead.
 */
export const GITHUB_OWNER = 'Vey005';
export const GITHUB_REPO = 'Sika-POS-2';

/** Set false to use Railway/generic URL below instead of GitHub */
export const USE_GITHUB_RELEASES = false;

export const UPDATE_FEED_URL =
  process.env.SIKAPOS_UPDATE_URL?.replace(/\/?$/, '/') ||
  'https://sikapos-api-production.up.railway.app/updates/';

/** Skip auto-check in development unpackaged builds */
export const UPDATES_ENABLED = process.env.SIKAPOS_UPDATES !== '0';
