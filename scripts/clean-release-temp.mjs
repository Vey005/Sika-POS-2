/**
 * Remove electron-builder temp artifacts that confuse a fresh dist
 * (leftover .7z / blockmap files, especially after AV quarantine).
 */
import fs from 'fs';
import path from 'path';

const outputDir = process.env.SIKAPOS_DIST_OUTPUT || 'release-staging';
const releaseDir = path.join(process.cwd(), outputDir);
if (!fs.existsSync(releaseDir)) {
  process.exit(0);
}

const TEMP_PATTERN = /\.(7z|blockmap)$/i;
const NSIS_TEMP_PATTERN = /\.nsis\.7z$/i;

let removed = 0;
for (const name of fs.readdirSync(releaseDir)) {
  const full = path.join(releaseDir, name);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;
  if (TEMP_PATTERN.test(name) || NSIS_TEMP_PATTERN.test(name)) {
    try {
      fs.unlinkSync(full);
      console.log(`[dist:clean] removed ${name}`);
      removed++;
    } catch (err) {
      console.warn(`[dist:clean] could not remove ${name}: ${err.message}`);
    }
  }
}

if (removed === 0) {
  console.log('[dist:clean] no temp artifacts to remove');
}
