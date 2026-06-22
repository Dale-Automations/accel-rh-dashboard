declare const __BUILD_VERSION__: string;

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_URL = '/version.json';
const loadedVersion = typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'dev';
let reloading = false;

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

async function checkAndReload() {
  if (reloading) return;
  const remote = await fetchRemoteVersion();
  if (!remote || remote === loadedVersion) return;
  reloading = true;
  console.info(`[versionCheck] new version ${remote} (loaded ${loadedVersion}). Reloading...`);
  window.location.reload();
}

export function startVersionCheck() {
  if (loadedVersion === 'dev') return;
  setInterval(checkAndReload, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAndReload();
  });
}
