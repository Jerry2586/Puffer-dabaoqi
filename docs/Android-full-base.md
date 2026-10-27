# Android 完整客户端基础包

适用于河豚打包器 0.7.2。本次正式发布同时提供 Hetun-Android-Full-Base-mobile-unsigned.apk、base-info.json 和 BASE-SHA256SUMS.txt，便于导入新版完整客户端。

该基础包适用 Android 手机（mobile），包名固定为 com.hetun.client，采用 hetun-local-client-v2；不包含生产后台地址或用户签名，不能直接安装。平板、电视或自定义包名、图标、权限需按原生构建说明重新制作对应基础包，不能仅修改设备标记。

1. 在主题中心 0.4.3 保存主题并导出 ZIP。
2. 在打包器的 Android 手机档案中导入此基础 APK。
3. 点击或拖拽上传主题 ZIP，确认实际底包兼容检查通过。
4. 设置后台 HTTPS 服务地址、应用版本和构建号，使用自己的 JKS 生成最终 APK。
5. 安装到目标设备，验收内容、权限、播放、会员及支付。

更新桌面软件不会替换旧底包或已经安装的旧应用。升级现有应用必须使用原有包名与签名并增加构建号；不要把本基础包作为已有不同包名应用的升级包。

基础包由当前发布提交中的 native/android 和 native/client 通过 scripts/create-base.cjs 构建。base-info.json 记录源码提交、APK SHA-256、初始应用身份和能力；BASE-SHA256SUMS.txt 单独校验基础包与其清单。桌面 Windows 附件仍由标签 GitHub Actions 构建，使用各自原有 SHA256SUMS.txt 与发行清单。

本批已执行模拟器与原生回归；生产 CMS、会员/支付、真实媒体解码及物理设备验收范围见 RELEASE-NOTES.md。临时测试签名和用户主题演示包不作为正式附件发布。
