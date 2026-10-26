# 河豚打包器 0.6.0

本地工作链：原生源码首次编译为协议基础 APK → 主题中心制作主题 → 打包器导入基础 APK 和主题 → 写入配置、自有签名 → 成品 APK。

本版将日常出包调整为协议基础 APK 二次打包。桌面界面保留 Electron，日常二次打包不使用 uni-app、DCloud、源码编译或 Gradle。

## 使用边界

- 主题中心负责主题及素材，后台地址不从主题包导入。
- 打包器负责基础 APK、主题兼容检查、版本、后台地址和自有 JKS 签名。
- 基础 APK 必须接入 hetun-package-v1，包含真实原生主题渲染器。任意 APK 不能直接换肤。
- 包名固定为基础 APK 的实际包名。图标、权限、原生代码及新主题能力变更应重新制作基础包。
- 已实现 Android APK 二进制重打包；IPA 和 EXE 尚未实现，软件会阻止构建。

## 本地启动与环境

使用 Node.js 22，运行 npm run dev。Electron 依赖位于源码外；npm run setup 首次下载依赖需要网络。两个软件各自独立运行，手动导出和导入主题包，不要求云授权或云任务。

日常 APK 打包只需要本机 JDK 和 Android Build Tools（zipalign、aapt、apksigner），以及自己的 JKS。工具不自动下载。只有开发者首次制作或更新基础 APK 时才需要 Gradle、Android 编译 SDK 和已缓存依赖，该流程使用 scripts/create-base.cjs，与工作台日常出包分离。

在主题中心导出主题 ZIP，在打包器点击“导入主题包”，再为对应设备选择主题。保存主题不会自动修改打包器的列表或当前配置。只有在打包器手动导入的主题可供选择和构建；旧自动同步记录不会显示或继续用于构建，原文件保留，可手动重新导入。打包器在导入和构建时检查实际协议与能力；导入成功不代表原生端实现了所有主题效果。

Kotlin 基础渲染器只支持 native/android/theme-capabilities.json 的字段。完整编辑器的复杂轮播、广告、节日装饰和逐像素布局尚未全部映射，不兼容的主题会明确拒绝。源码编译通过、签名成功与真机业务可用分别验收。

## 接口与测试

固定接口及数据责任见 PACKAGE-CONTRACT.md，架构见 ARCHITECTURE.md。业务客户端统一调用 HTTPS 河豚网关，由后台对接苹果 CMS v10；本地主题服务不充当运营后台。

npm run check 检查脚本语法；npm test 执行本地测试。npm run build 构建打包器自身的 Windows 软件，与产出客户端 APK 是两条流程。正式发布、推送及覆盖安装需按本轮用户指令执行。

公共开发环境默认位于 %LOCALAPPDATA%/Programs/UniAppTools。依赖、运行状态、签名和 APK 产物均存于源码外。开发模式使用隔离的 local-development 档案。
