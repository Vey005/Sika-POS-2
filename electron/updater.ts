import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  UPDATE_FEED_URL,
  UPDATES_ENABLED,
  USE_GITHUB_RELEASES,
} from './update-config';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string;
  percent?: number;
  message?: string;
  error?: string;
}

let mainWindow: BrowserWindow | null = null;
let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};

function sendState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:state', { ...state });
  }
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  sendState();
}

export function attachUpdateWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function getUpdateState(): UpdateState {
  return { ...state };
}

export function initAutoUpdater() {
  if (!app.isPackaged || !UPDATES_ENABLED) {
    console.log('[Updates] Skipped (dev or disabled)');
    return;
  }

  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (USE_GITHUB_RELEASES) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    });
    console.log(`[Updates] GitHub feed: ${GITHUB_OWNER}/${GITHUB_REPO}`);
  } else {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: UPDATE_FEED_URL,
    });
    console.log(`[Updates] Generic feed: ${UPDATE_FEED_URL}`);
  }

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined, message: 'Checking for updates…' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      status: 'available',
      availableVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      message: `Version ${info.version} is available.`,
      percent: undefined,
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:available', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      availableVersion: undefined,
      message: 'You are on the latest version.',
    });
  });

  autoUpdater.on('download-progress', progress => {
    setState({
      status: 'downloading',
      percent: progress.percent,
      message: `Downloading… ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({
      status: 'downloaded',
      availableVersion: info.version,
      message: 'Update ready. Restart to install.',
      percent: 100,
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', err => {
    console.error('[Updates]', err);
    setState({
      status: 'error',
      error: formatUpdateError(err),
      message: 'Could not check for updates.',
    });
  });
}

function formatUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (/sending request for url|network|econnrefused|etimedout|enotfound/i.test(raw)) {
    return 'Could not reach the update server. Check your internet connection, VPN, or firewall.';
  }
  if (
    /404|not found|no published versions|releases feed|cannot find/i.test(lower) ||
    (lower.includes('github') && lower.includes('release'))
  ) {
    return `No release found on GitHub (${GITHUB_OWNER}/${GITHUB_REPO}). Publish a version tag with an installer first.`;
  }
  if (/latest\.yml|invalid.*yaml|parse/i.test(lower)) {
    return 'The update feed on GitHub is invalid or incomplete. Re-publish the release with latest.yml and the installer.';
  }
  if (/sha512 checksum mismatch|checksum mismatch/i.test(lower)) {
    return 'The installer on the update server does not match latest.yml. In the admin portal, upload the installer again, then latest.yml (same build folder), or republish after deploying the server fix.';
  }

  return raw || 'Unknown update error.';
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    setState({
      status: 'error',
      error: 'dev',
      message: 'Updates are only available in the installed app.',
    });
    return getUpdateState();
  }
  if (!UPDATES_ENABLED) {
    setState({
      status: 'error',
      error: 'disabled',
      message: 'Updates are disabled on this build.',
    });
    return getUpdateState();
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    setState({
      status: 'error',
      error: formatUpdateError(err),
      message: 'Could not check for updates.',
    });
  }
  return getUpdateState();
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) return getUpdateState();
  try {
    setState({ status: 'downloading', message: 'Starting download…', percent: 0 });
    await autoUpdater.downloadUpdate();
  } catch (err: any) {
    setState({
      status: 'error',
      error: err?.message || String(err),
      message: 'Download failed.',
    });
  }
  return getUpdateState();
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}

/** Background check shortly after launch */
export function scheduleStartupUpdateCheck(delayMs = 45_000) {
  if (!app.isPackaged || !UPDATES_ENABLED) return;
  setTimeout(() => {
    checkForUpdates().catch(() => {});
  }, delayMs);
}
