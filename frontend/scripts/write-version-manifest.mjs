import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptsDir, '..');
const packageJsonPath = resolve(frontendRoot, 'package.json');
const versionJsonPath = resolve(frontendRoot, 'public', 'version.json');
const environmentTsPath = resolve(frontendRoot, 'src', 'environments', 'environment.ts');

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = String(pkg.version ?? '').trim();

if (!version) {
  throw new Error('Missing version in frontend/package.json');
}

const manifestContent = `${JSON.stringify({ version }, null, 2)}\n`;
writeFileSync(versionJsonPath, manifestContent, 'utf8');

const envSource = readFileSync(environmentTsPath, 'utf8');
const updatedEnvSource = envSource.replace(
  /appVersion:\s*'[^']*'/,
  `appVersion: '${version}'`,
);
if (updatedEnvSource !== envSource) {
  writeFileSync(environmentTsPath, updatedEnvSource, 'utf8');
}
