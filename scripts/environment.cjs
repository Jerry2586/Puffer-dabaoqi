'use strict';
const path = require('node:path');
const os = require('node:os');
function external(source, target, label) {
  const resolved = path.resolve(target);
  const relative = path.relative(source, resolved);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
    throw new Error(label + '必须在源码目录之外');
  }
  return resolved;
}
function environment() {
  const source = path.resolve(__dirname, '..');
  const shared = external(source, process.env.HETUN_TOOLS_ROOT || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'UniAppTools'), '公共环境目录');
  const root = external(source, process.env.HETUN_PACKER_BUILD_ROOT || path.join(shared, 'projects', 'hetun-packer'), '构建目录');
  const development = external(source, process.env.HETUN_PACKER_DEV || path.join(root, 'development'), '打包依赖目录');
  return { source, shared, root, development };
}
module.exports = { environment, external };
