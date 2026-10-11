'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { environment } = require('./environment.cjs');
function run(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('环境安装失败：' + code)));
  });
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('请使用包含 npm 的 Node.js 22 环境');
  const { source, shared, development } = environment();
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  let npm;
  for (const file of candidates) { try { await fs.access(file); npm = file; break; } catch {} }
  if (!npm) throw new Error('未找到 npm，请使用完整 Node.js 22 安装包');
  await fs.mkdir(development, { recursive: true });
  for (const [from, to] of [['electron.package.json', 'package.json'], ['electron.package-lock.json', 'package-lock.json']]) {
    await fs.copyFile(path.join(source, 'scripts', 'dependencies', from), path.join(development, to));
  }
  const env = { ...process.env, npm_config_cache: path.join(shared, 'cache', 'npm'), electron_config_cache: path.join(shared, 'cache', 'electron') };
  console.log('安装外部依赖：' + development);
  await run([npm, 'ci', '--no-audit', '--no-fund'], development, env);
  await run([path.join(development, 'node_modules', 'electron', 'install.js')], development, env);
  console.log('环境准备完成。依赖及缓存均在源码目录之外。');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
