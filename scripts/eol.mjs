import fs from 'node:fs';
import path from 'node:path';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseBadEolFiles(lsFilesEolOutput) {
  const lines = lsFilesEolOutput.split(/\r?\n/).filter(Boolean);

  const bad = [];
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;

    const worktreeEol = match[2];
    const filePath = match[5];
    if (worktreeEol === 'w/crlf' || worktreeEol === 'w/mixed') bad.push(filePath);
  }

  return bad;
}

function normalizeToLf(filePath) {
  const before = fs.readFileSync(filePath);
  let after = before.toString('binary').replaceAll('\r\n', '\n');
  if (!after.endsWith('\n')) after += '\n';
  const afterBuf = Buffer.from(after, 'binary');

  const changed = Buffer.compare(before, afterBuf) !== 0;
  if (changed) fs.writeFileSync(filePath, afterBuf);
  return changed;
}

async function main() {
  const command = process.argv[2];
  if (!command || (command !== 'check' && command !== 'fix')) {
    console.error('Usage: node scripts/eol.mjs <check|fix>');
    process.exit(2);
  }

  const input = process.stdin.isTTY ? '' : await readStdin();
  if (!input) {
    console.error('No input received. Run via: git ls-files --eol | node scripts/eol.mjs check');
    process.exit(2);
  }

  const repoRoot = process.cwd();
  const bad = parseBadEolFiles(input);

  if (command === 'check') {
    if (bad.length === 0) {
      console.log('EOL OK (LF everywhere)');
      return;
    }

    console.error('Found CRLF/mixed line endings in:');
    for (const rel of bad) console.error(`- ${rel}`);
    process.exit(1);
  }

  let changedCount = 0;
  for (const rel of bad) {
    const abs = path.join(repoRoot, rel);
    if (normalizeToLf(abs)) changedCount += 1;
  }

  console.log(`Normalized ${changedCount} file(s) to LF`);
}

main();
