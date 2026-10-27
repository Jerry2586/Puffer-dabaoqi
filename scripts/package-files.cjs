'use strict';
// 发行入口的唯一清单；原生源码生成器和构建脚本仅供开发使用。
const applicationFiles=[
  "main.cjs",
  "preload.cjs",
  "core/android-manifest.cjs",
  "core/base-apk.cjs",
  "core/domain.cjs",
  "core/engine.cjs",
  "core/package-contract.cjs",
  "core/preview.cjs",
  "core/process.cjs",
  "core/runtime.cjs",
  "core/service-directory.cjs",
  "core/services.cjs",
  "core/signatures.cjs",
  "core/store.cjs",
  "core/themes.cjs",
  "core/vault.cjs",
  "core/zip.cjs",
  "README.md",
  "ARCHITECTURE.md",
  "PACKAGE-CONTRACT.md",
  "原生构建说明.md",
  "package.json"
];
const applicationDirectories=['renderer','assets'];
module.exports={applicationFiles,applicationDirectories};
