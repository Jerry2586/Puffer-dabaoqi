# 河豚打包器：原生构建开发版

保留 Electron 工作台界面，客户端构建改为 Kotlin Android、SwiftUI iOS、C# WPF Windows。当前构建入口不再编译 uni-app，也不需要 DCloud AppID/AppKey。软件版本仍为 0.3.1，本轮未发布正式版。

## 本地运行

使用 Node.js 22，运行 npm run dev。Electron 依赖位于源码之外的公共环境。npm run setup 用锁文件安装桌面开发依赖，首次安装需要网络；已备齐环境后，制作主题、传递主题、导出原生源码及 Android/Windows 构建均使用本地文件和缓存。构建本身不自动下载缺失依赖。

主题中心通过 hetun-local-theme v1 本机文件队列发送，打包器校验摘要、资源路径和设备后绑定主题。当前不启动云授权、在线更新或云构建。界面保留已有应用档案和 R007 连接。旧源码路径不会自动执行；必须导入与当前平台匹配、接入统一协议的客户端源码目录或 ZIP。未导入源码时禁止构建。主题中心保存的主题自动出现在对应设备的列表中，两个软件均显示本机连接状态。

## 客户端技术与环境

| 设备 | 技术 | 产物与要求 |
|---|---|---|
| Android 手机、平板、TV | Kotlin + 原生 View | APK；JDK 21、SDK 36、Gradle 9.8.1、AGP 9.4.1 缓存、自有 JKS |
| iPhone、iPad | SwiftUI + AVKit | Swift 工程；IPA 需要自有 Mac、Xcode 26、Apple Team 与签名 |
| Windows | C# WPF / .NET 10 | EXE；构建需 .NET 10 SDK，运行需 .NET 10 Desktop Runtime |

“导出原生源码工程”不要求安装编译器，也不要求在线影视后台。导入自己的原生源码、填写包名并选择当前设备主题后，导出合并后的工程 ZIP，用于继续修改和二次编译。现成任意 APK 不具备本项目主题协议，不能直接导入换肤。

运行时统一使用 runtime.json 与 hetun-skeleton v2 主题包。仓库内示例原生渲染支持基础品牌、颜色、导航、分类、栏目标题、影片列表、搜索、会员登录和系统播放。复杂轮播、广告、节日装饰以及编辑器逐像素布局尚未完成映射；SwiftUI 当前栏目共用分类结果。后端为空时只显示基础离线主题。

## 后台与苹果 CMS

各端统一调用 HTTPS 河豚网关；苹果 CMS v10 位于网关后面，不等于 iOS。网关接口约定见“原生构建说明.md”。本次没有新增或部署 CMS 服务，没有验证真实站点的登录、解析、支付或播放兼容性。不要把原生工程成功编译理解为业务已经联通。

## 检查与发行

npm run check 检查 JS/CJS 语法；npm test 执行本地功能测试。原生客户端需另外运行编译验证，iOS 必须在 Mac 验证。npm run build 是打包器自身的正式 Windows 发行命令，本轮不执行。

公共环境默认位于 %LOCALAPPDATA%/Programs/UniAppTools，目录名为历史兼容名称。可用 HETUN_TOOLS_ROOT、HETUN_PACKER_BUILD_ROOT、HETUN_PACKER_DEV 指定外部位置；依赖、签名和产物都在源码之外。开发模式使用隔离的 local-development 档案。

本地演示 Android 模板关闭随 assembleRelease 执行的 Lint（本机尚未备齐 lint-gradle 依赖），不代表 Lint 验收通过。正式发行前必须补齐离线依赖并单独运行 lintRelease。
