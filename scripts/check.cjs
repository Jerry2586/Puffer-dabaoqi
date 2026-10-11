'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'development', 'dist', 'release', 'build', 'builds', 'state', 'outputs', 'logs', 'cache']);
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.(cjs|js|mjs)$/.test(entry.name) ? [file] : [];
  });
}
const targets = files(source);
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(path.relative(source, file));
    console.error(result.error?.message || result.stderr);
    process.exit(1);
  }
}
console.log('源码语法检查通过：' + targets.length + ' 个文件');
