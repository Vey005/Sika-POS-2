/**
 * Verify latest.yml sha512 matches the installer in a release folder.
 * Usage: node scripts/verify-update-artifacts.mjs [folder]
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dir = path.resolve(process.argv[2] || 'release-staging');
const ymlPath = path.join(dir, 'latest.yml');

if (!fs.existsSync(ymlPath)) {
  console.error(`Missing ${ymlPath}`);
  process.exit(1);
}

const yml = fs.readFileSync(ymlPath, 'utf8');
const pathMatch = yml.match(/^path:\s*['"]?([^'"\n]+)['"]?/m);
const shaMatch = yml.match(/^sha512:\s*([A-Za-z0-9+/=]+)/m);
const installerName = pathMatch?.[1]?.trim();
const expectedSha = shaMatch?.[1]?.trim();

if (!installerName || !expectedSha) {
  console.error('Could not parse path/sha512 from latest.yml');
  process.exit(1);
}

const candidates = [
  path.join(dir, installerName),
  path.join(dir, installerName.replace(/-/g, ' ')),
  path.join(dir, installerName.replace(/\s+/g, '-')),
].filter((p, i, a) => a.indexOf(p) === i);

let installerPath = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    installerPath = p;
    break;
  }
}

if (!installerPath) {
  console.error('Installer not found. Tried:', candidates.join(', '));
  process.exit(1);
}

const hash = crypto.createHash('sha512');
hash.update(fs.readFileSync(installerPath));
const actualSha = hash.digest('base64');

if (actualSha === expectedSha) {
  console.log('OK — sha512 matches:', path.basename(installerPath));
  process.exit(0);
}

console.error('MISMATCH');
console.error('  file:', installerPath);
console.error('  expected (yml):', expectedSha);
console.error('  actual (file): ', actualSha);
process.exit(1);
