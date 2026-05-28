/**
 * Stop running SikaPOS/Electron instances and remove locked build output
 * so electron-builder can repackage win-unpacked.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryKillWindows(imageName) {
  if (process.platform !== 'win32') return;
  try {
    execSync(`taskkill /IM ${imageName} /F`, { stdio: 'ignore' });
    console.log(`[dist:prepare] stopped ${imageName}`);
  } catch {
    // not running
  }
}

if (process.platform === 'win32') {
  tryKillWindows('SikaPOS.exe');
  tryKillWindows('electron.exe');
  await sleep(1500);
}

const outputDir = process.env.SIKAPOS_DIST_OUTPUT || 'release-staging';
const releaseDir = path.join(process.cwd(), outputDir);
const winUnpacked = path.join(releaseDir, 'win-unpacked');

if (fs.existsSync(winUnpacked)) {
  try {
    fs.rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
    console.log(`[dist:prepare] removed ${outputDir}/win-unpacked`);
  } catch (err) {
    console.error(
      `[dist:prepare] Could not remove ${outputDir}/win-unpacked. Close SikaPOS, dev terminals, and Explorer windows on that folder, then retry.\n`,
      err.message
    );
    process.exit(1);
  }
}

console.log('[dist:prepare] ready for electron-builder');
