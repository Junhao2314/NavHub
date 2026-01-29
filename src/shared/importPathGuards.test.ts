// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.wrangler',
  '.vscode',
  '.idea',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

type OffendingImport = {
  file: string;
  specifier: string;
  line: number;
  column: number;
};

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
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

const findOffendingSyncApiDirectoryImports = (): OffendingImport[] => {
  const files = collectSourceFiles(repoRoot);
  const offenders: OffendingImport[] = [];

  const record = (
    filePath: string,
    sourceFile: ts.SourceFile,
    specifierNode: ts.StringLiteralLike,
  ) => {
    const specifier = specifierNode.text;
    if (!/(^|\/)shared\/syncApi\/$/.test(specifier)) return;

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      specifierNode.getStart(sourceFile),
    );
    offenders.push({
      file: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
      specifier,
      line: line + 1,
      column: character + 1,
    });
  };

  const visit = (filePath: string, sourceFile: ts.SourceFile) => {
    const walk = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        record(filePath, sourceFile, node.moduleSpecifier);
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        record(filePath, sourceFile, node.moduleSpecifier);
      } else if (ts.isCallExpression(node)) {
        const [arg] = node.arguments;
        if (arg && ts.isStringLiteralLike(arg)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            record(filePath, sourceFile, arg);
          } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
            record(filePath, sourceFile, arg);
          }
        }
      }

      ts.forEachChild(node, walk);
    };

    walk(sourceFile);
  };

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    if (!content.includes('shared/syncApi/')) continue;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.ESNext,
      true,
      getScriptKind(filePath),
    );
    visit(filePath, sourceFile);
  }

  return offenders;
};

describe('import path guards', () => {
  it('avoids directory-style imports for shared/syncApi.ts', () => {
    const offenders = findOffendingSyncApiDirectoryImports();
    if (offenders.length === 0) return;

    const formatted = offenders
      .map((item) => `${item.file}:${item.line}:${item.column} -> "${item.specifier}"`)
      .join('\n');

    throw new Error(
      `Disallowed directory-style import for syncApi detected.\n` +
        `Use "shared/syncApi" (file) without a trailing slash.\n\n` +
        formatted,
    );
  });
});
