import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
const isWindows = process.platform === 'win32';

const print = (message = '') => process.stdout.write(`${message}\n`);
const printErr = (message = '') => process.stderr.write(`${message}\n`);

const formatError = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.stack || error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const isSpawnEperm = (error) => {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = /** @type {{ code?: unknown }} */ (error).code;
  if (maybeCode === 'EPERM') return true;
  const message = String(/** @type {{ message?: unknown }} */ (error).message || '');
  return message.includes('spawn EPERM');
};

const resolveWindowsEsbuildExe = () => {
  if (!isWindows) return null;
  const arch = process.arch;
  const pkg =
    arch === 'x64'
      ? '@esbuild/win32-x64'
      : arch === 'arm64'
        ? '@esbuild/win32-arm64'
        : arch === 'ia32'
          ? '@esbuild/win32-ia32'
          : null;
  if (!pkg) return null;
  try {
    return require.resolve(`${pkg}/esbuild.exe`);
  } catch {
    return null;
  }
};

let hasError = false;

print('NavHub doctor');
print('-----------');
print(`Node: ${process.version} (${process.platform} ${process.arch})`);
print(`OS: ${os.type()} ${os.release()}`);
print(`CWD: ${process.cwd()}`);

if (nodeMajor !== 20) {
  printErr(
    `Warning: CI uses Node 20 (see .github/workflows/ci.yml). You are on Node ${nodeMajor}.`,
  );
}

const envEsbuildBinaryPath = (process.env.ESBUILD_BINARY_PATH || '').trim();
if (envEsbuildBinaryPath) {
  print(`ESBUILD_BINARY_PATH: ${envEsbuildBinaryPath}`);
}

print('');

if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
  hasError = true;
  printErr('Missing node_modules. Run: npm ci  (or npm install)');
} else {
  print('Dependencies: OK (node_modules present)');
}

print('');

// 1) Quick sanity: can import esbuild at all?
/** @type {import('esbuild') | null} */
let esbuild = null;
try {
  esbuild = await import('esbuild');
  print(`esbuild: OK (package version ${esbuild.version})`);
} catch (error) {
  hasError = true;
  printErr('esbuild: FAILED to import');
  printErr(formatError(error));
}

// 2) Windows-only: check esbuild.exe execution in "pipe" vs "inherit" mode
if (isWindows) {
  const exe = resolveWindowsEsbuildExe();
  if (!exe) {
    printErr('esbuild.exe: not found for this Windows architecture');
  } else {
    print(`esbuild.exe: ${exe}`);
    try {
      const version = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim();
      print(`esbuild.exe (capture stdout): OK (${version})`);
    } catch (error) {
      hasError = true;
      printErr('esbuild.exe (capture stdout): FAILED');
      printErr(formatError(error));
      if (isSpawnEperm(error)) {
        printErr(
          'Hint: this often means your environment blocks spawning native binaries with piped stdio. Vite build may fail.',
        );
      }
    }

    try {
      execFileSync(exe, ['--version'], { stdio: 'inherit' });
      print('esbuild.exe (inherit stdio): OK');
    } catch (error) {
      hasError = true;
      printErr('esbuild.exe (inherit stdio): FAILED');
      printErr(formatError(error));
    }
  }

  print('');
}

// 3) Most relevant check: can esbuild JS API start its service and build?
if (esbuild) {
  try {
    await esbuild.build({
      stdin: {
        contents: 'export default 1',
        resolveDir: process.cwd(),
        sourcefile: 'doctor-input.ts',
      },
      write: false,
      bundle: true,
      platform: 'node',
      format: 'esm',
    });
    print('esbuild JS API build: OK');
  } catch (error) {
    hasError = true;
    printErr('esbuild JS API build: FAILED');
    printErr(formatError(error));
    if (isSpawnEperm(error)) {
      printErr('');
      printErr('Next steps (Windows):');
      printErr(
        '- Move the repo out of sync/managed folders (e.g. BaiduNetdisk/OneDrive) to a normal path.',
      );
      printErr(
        '- Add antivirus/Defender exclusions for this repo (and esbuild.exe) if your policy allows.',
      );
      printErr('- If on a managed/corporate machine, ask admin to allow child process execution.');
      printErr('- Use WSL2/Linux for local builds (CI already runs on Linux).');
    }
  }
}

if (hasError) process.exit(1);
