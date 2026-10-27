# Android 完整客户端基础包

适用于河豚打包器 0.7.3。正式发布提供 Hetun-Android-Full-Base-mobile-unsigned.apk、base-info.json 和 BASE-SHA256SUMS.txt。

该基础包适用 Android 手机（mobile），包名固定 com.hetun.client，采用 hetun-local-client-v2，并声明可替换应用图标。未配置生产后台或用户签名，不能直接安装。平板、电视、自定义包名或权限需重新制作对应底包，不能仅修改设备标记。

1. 在主题中心 0.4.3 保存主题并导出 ZIP。
2. 打开打包器，新建应用或手动打开已有档案，在 Android 手机设备中导入本版基础 APK。
3. 点击或拖拽上传主题 ZIP，确认实际底包兼容检查通过。
4. 如需 Logo，在模块 03 上传正方形 PNG（8 位非交错，最大 2048×2048、5MB），保存应用版本和构建号。移除 Logo 后出包恢复底包图标。
5. 设置实际 HTTPS 后台，使用自己的 JKS 生成最终 APK。
6. 在目标设备验收安装、桌面图标、内容、权限、播放、会员和支付。

升级桌面程序不会替换旧底包或旧应用；旧底包没有图标声明时，须导入本版底包后才能更换 Logo。同一应用升级必须沿用原包名和签名并增加构建号，不要把此基础包作为其他包名应用的升级包。

基础包由发布提交中的 native/android 与 native/client 经 scripts/create-base.cjs 构建。base-info.json 记录源码提交、APK SHA-256、初始身份、能力及图标声明；BASE-SHA256SUMS.txt 校验基础包和清单。Windows 附件由对应标签 GitHub Actions 构建，使用独立的 SHA256SUMS.txt 和 release-manifest.json。

本版已验证真实基础包构建、完整主题兼容检查、Logo 资源替换、对齐、临时 JKS 签名及最终 APK 校验，aapt2 确认应用图标引用固定 PNG。未对本版 APK 进行安装或真机桌面图标验收；R027 的模拟器回归记录不视为本版设备复测。临时签名与用户主题演示包不发布。
