# 河豚原生打包器架构

Electron 仅承载打包工作台。main/preload/renderer 分离，渲染器无 Node 权限；固定 IPC 方法校验来源。客户端分别由 Kotlin Android、SwiftUI iOS、C# WPF Windows 实现，不依赖 uni-app 页面或 DCloud SDK。

core/native-project.cjs 将选定设备的主题、runtime.json 与用户导入的原生源码复制到独立构建目录。未导入源码时拒绝构建。自有工程必须包含 hetun-native.json v1 和匹配平台固定入口，不允许自定义构建命令。源目录禁止符号链接，输入输出不允许重叠。导出工程不携带 JKS 密码、AppKey 或 Apple 节点令牌。

core/engine.cjs 区分源码导出与安装包构建。Android 使用本地 Gradle --offline，随后 zipalign、apksigner 并核验包名、版本和证书指纹。Windows 用无源 NuGet 配置运行 dotnet publish，输出依赖 .NET Desktop Runtime 的单文件 EXE。iOS 将原生工程发送给自有 Mac agent v2，以固定 Xcode 工程执行 Archive，验证身份后返回 IPA 与摘要。当前 Windows 环境未验证 Xcode 编译。

主题采用 hetun-skeleton v2 数据协议，不执行主题代码。原生渲染仅覆盖已声明的基础能力，具体 limitations 写入 hetun-native.json。后台统一为 HTTPS 网关，禁止配置中夹带账号参数；登录 token 仅留在客户端内存。CMS、会员和播放功能仍需后端实际联调。

R007 本机交接保留：hetun-local-theme v1 原子文件队列、摘要校验、去重、回执、按设备绑定；构建期间暂停自动接收。浏览器预览复用 Electron Store，限制 loopback Host、Origin、会话和方法；构建与签名通过桌面入口执行。

本地入口禁用授权、云构建和在线更新。历史 desktop、native-adapter、updates 模块仅为旧档案兼容保留，不被新构建入口调用。公共环境和工作根在源码之外，正式打包器发行另行验收。
