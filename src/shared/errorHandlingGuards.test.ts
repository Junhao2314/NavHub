// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const srcRoot = fileURLToPath(new URL('../', import.meta.url));

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

type OffendingCatch = {
  file: string;
  line: number;
  column: number;
};

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (SOURCE_EXTENSIONS.has(ext)) acc.push(entryPath);
  }
  return acc;
};

const getScriptKind = (filePath: string): ts.ScriptKind => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.ts':
    case '.mts':
    case '.cts':
    default:
      return ts.ScriptKind.TS;
  }
};

const isEmptyCatchBlock = (sourceFile: ts.SourceFile, catchClause: ts.CatchClause): boolean => {
  const block = catchClause.block;
  const blockText = sourceFile.text.slice(block.getStart(sourceFile), block.end);
  return /^\{\s*\}$/.test(blockText);
};

const findEmptyCatchBlocks = (): OffendingCatch[] => {
  const files = collectSourceFiles(srcRoot);
  const offenders: OffendingCatch[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    if (!content.includes('catch')) continue;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.ESNext,
      true,
      getScriptKind(filePath),
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isTryStatement(node) &&
        node.catchClause &&
        isEmptyCatchBlock(sourceFile, node.catchClause)
      ) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.catchClause.getStart(sourceFile),
        );
        offenders.push({
          file: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
          line: line + 1,
          column: character + 1,
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return offenders;
};

describe('error handling guards', () => {
  it('avoids empty catch blocks', () => {
    const offenders = findEmptyCatchBlocks();
    if (offenders.length === 0) return;

    const formatted = offenders
      .map((item) => `${item.file}:${item.line}:${item.column}`)
      .join('\n');

    throw new Error(
      `Disallowed empty catch block detected.\n` +
        `Add handling (rethrow/log/recover) or an explicit comment explaining why it's safe to ignore.\n\n` +
        formatted,
    );
  });
});
