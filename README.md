# 河豚打包器 0.3.1

独立 Windows 桌面软件。应用档案、手机/平板/电视/电脑独立配置、主题管理、真实服务检测、资源编译、原生构建适配、签名和日志在一个工作台完成。高级环境与签名放在设置抽屉。

## 使用流程
1. 创建应用，选择自己的河豚 uni-app 客户端源码。
2. 填写河豚影视中心地址；它负责连接苹果 CMS。点“检测”验证真实服务。
3. 选择手机、平板、电视或电脑，各端分别保存主题与版本身份。电视只支持 Android TV。
4. 导入 hetun-skeleton v2 JSON/ZIP 主题，或“读取已发布主题”。读取是只读请求，不保存/发布影视中心配置。选择主题 ID 必须与后台该端当前发布主题相同。
5. 点“构建检查”查看缺项。资源 ZIP 经过实际 uni-app 编译；它不能直接安装。APK/IPA 必须完成原生工程与签名配置。
6. 构建记录显示实时日志、取消状态、产物和 SHA-256。重启后未完成任务标记中断。

## 文件位置
- 本目录：源码、设计文档、测试源码和接入示例。
- Windows 外部工作根：%LOCALAPPDATA%/Programs/UniAppTools/projects/hetun-packer。
- development：Electron/打包工具依赖；state：档案与系统加密凭据；themes：主题包；signatures：JKS；builds：独立构建副本；outputs：产物；logs：构建日志；release：桌面成品。
- uni-app 编译依赖、Node、JDK、Android SDK 使用工具设置中的公共路径。依赖通过外部工作副本链接，不写入客户端源目录。
- 临时副本会替换应用名称、版本、AppID、服务地址和设备入口；原始客户端与影视中心保持独立。

## Android 离线原生工程
本软件不携带第三方购买软件的专有原生底包，也不把资源 ZIP 改名成 APK。需要你自己的 uni-app Android 离线原生 Gradle 工程和对应 SDK，以及自有 DCloud AppID/AppKey。首次 Gradle 构建可能下载依赖，编译与签名在本机执行。

复制 native-adapter/hetun-base.example.json 到自己的原生工程根目录，命名 hetun-base.json。适配文件必须声明：
- format=hetun-native-base、version=1、os=android、contract=hetun-config-v1。
- id/name 与支持的 devices（mobile/tablet/tv）。
- wrapperJar、assetsDir、apk 都是工程内相对路径。assetsDir 可使用 {appid}。
- task 如 :app:assembleRelease。没有任意 shell 命令入口。

引擎复制原生工程后将编译资源放入 assetsDir，再用 Java 调用该工程 Gradle Wrapper。传入 -PhetunConfig=/external/task/native-config.json。原生工程的 Gradle 配置需要读取此 JSON，应用 packageName、name、versionName、versionCode、appId、appKey、device、backend、icon 和 advanced。工程应将 AppKey 写入 SDK 要求的 manifest metadata，设置品牌资源，并对 TV 配置遥控器焦点、电视入口与 Leanback 启动能力。高级隐私、唤起和统计字段只有该工程支持时生效。

不要在 Gradle 输出中打印 AppKey。构建引擎对记录中的密钥进行隐藏，任务结束删除临时配置文件。签名密码通过进程环境提供，不拼进命令。最终执行 zipalign、自有 JKS 签名、apksigner verify，并检查 APK 包名、版本与签名指纹；不匹配直接失败。

## iOS / iPadOS 自有 Mac 节点
代理源码在 mac-agent/agent.cjs。把 mac-agent 与 core 文件夹复制到自己的 Mac（Node 22+）。按 agent-config.example.json 在源码外创建真实配置，填写至少24位随机节点 Key、自己的 Xcode 工程、Scheme、资源目录、工作根和 exportOptions.plist。

启动：node mac-agent/agent.cjs /absolute/path/agent-config.json。
代理默认只监听 127.0.0.1。网络监听必须配置 tlsKey/tlsCert（有效 HTTPS）。在 Windows 工具设置填写节点地址和同一 Key。工程需要支持 HETUN_CONFIG_FILE 中的 hetun-config-v1 配置，包括 DCloud AppKey、品牌和设备设置。

代理通过 xcodebuild archive/exportArchive 使用 Mac 上已有证书导出 IPA，核对 Bundle ID、版本、构建号、Team ID，并执行 codesign 验证。未连接 Mac 或未配置匹配工程时显示缺项；本机 Windows 不会直接生成 IPA。

本次交付包含代理源码和客户端任务协议，尚无真实 Mac／Apple 证书进行端到端 IPA 验收。

## 云授权与云构建
当前源码包含 Ed25519 签名租约验证、后台域名绑定和云端源码目录、下载、构建及产物校验接口。本地桌面界面的构建检查和构建启动均要求有效的 packer 授权；仅健康接口返回成功不能通过授权。需要配置自己的授权服务 URL、Key 和可信公钥。

AppKey、JKS 密码、Mac 节点 Key 和云授权 Key 分别管理，使用 Windows 系统凭据加密。档案导出不包含 AppKey、签名私钥、密码和原生工程绑定；导入后需要在本机重新配置。

云授权及云构建目前属于待联调代码，尚未完成独立集成验收和服务器部署。仓库上传及现有测试通过不代表云端功能已可正式交付。

## 获取源码与准备外部环境
使用 Git 克隆本仓库，进入源码目录，使用完整的 Node.js 22（包含 npm）：

```powershell
git clone https://github.com/Jerry2586/Puffer-dabaoqi.git
cd Puffer-dabaoqi
npm run setup
npm run check
npm test
```

setup 按仓库锁文件安装 Electron 44.7.0 和 electron-builder 26.15.3，并安装 Electron 运行程序。依赖和下载缓存放在源码目录之外。源码根目录不需要执行 npm install。

可选环境变量：HETUN_TOOLS_ROOT 指定公共环境根；HETUN_PACKER_BUILD_ROOT 指定工作根；HETUN_PACKER_DEV 指定打包依赖目录。构建目录和依赖目录必须在源码目录之外。setup 的 npm ci 会重新安装指定依赖目录，应为打包器保留专用目录。

默认 Windows 开发启动方式：

```powershell
$electron = Join-Path $env:LOCALAPPDATA 'Programs/UniAppTools/projects/hetun-packer/development/node_modules/electron/dist/electron.exe'
& $electron .
```

更换外部环境路径后，使用对应 development 目录下的 electron.exe 启动。打包器软件本身的 Windows 构建命令为 `npm run build`，生成便携 EXE 和 NSIS 安装包，输出到外部工作根的 release/v0.3.1。构建软件不需要相邻客户端项目；使用软件构建影视客户端时需自行配置客户端源码、主题、后台及对应平台工具。

## 自动检查与验收范围
main 推送、拉取请求及手动触发会运行 Windows / Node.js 22 CI，检查全部 JS/CJS 源码语法并执行现有自动测试。CI 执行测试和 Windows 桌面构建，上传安装包、便携版和校验文件作为工作流附件。正式 Release 由已验证的版本单独发布；CI 不部署服务器。

现有 23 项测试覆盖档案与端配置、主题格式、ZIP 与路径校验、原生适配检查、真实本机 HTTP、进程取消、日志脱敏、系统加密不可用处理、电脑版业务代理，以及更新缓存和安装包来源/哈希校验。更新测试使用受控请求数据，不代表在线 GitHub 更新下载已完成端到端验收。

Windows 0.3.1 安装与卸载流程单独验收；云端服务、苹果 CMS、正式 Android 原生工程和 DCloud 配置、真实 Mac 与 Apple 证书均未完成本版本端到端联调。APK/IPA 和支付业务不能据此宣称已联通。本次仓库更新交付源码和自动检查结果。

## Windows 电脑版
电脑版使用独立 desktop.windows 档案，保存包名、版本号和构建号。主题独立安装，兼容 platform=web 的河豚主题包；后台检测对应 web 端发布主题。缺少匹配模板时锁定构建。

电脑版实际编译 uni-app H5 客户端，去除影视中心管理页面，再使用公共 Electron / electron-builder 环境生成 Windows x64 EXE。不需要 Android 或 Apple 签名。后台地址在构建副本写入，运行时通过本机随机端口代理业务 API；管理 API 被禁止。不同包名使用独立桌面数据目录。macOS/Linux 客户端未实现。

## 打包器更新
启动和定时检测固定 GitHub 仓库，手动检查立即访问。源码提交变更提示与可下载安装的 Release 分开显示。安装包命名 Hetun-Packer-{version}-x64-Setup.exe，要求 GitHub asset 的 SHA-256 digest，下载与启动安装前均验证大小和哈希。安装时不删除外部工作目录。仓库尚无正式 Release 时不会提供虚假的下载按钮。

构建脚本可生成便携 EXE 与 NSIS 安装程序，成品放在外部 release/v0.3.1。构建不会推送代码或自动发布 Release。

## 正式安装与卸载
下载 Release 中的 Hetun-Packer-0.3.1-x64-Setup.exe，完成 Windows 安装向导。免安装版单独提供，免安装版不会登记系统卸载项。正式安装版支持覆盖更新。

卸载入口：Windows 设置 → 应用 → 已安装的应用 → 河豚打包器；开始菜单 → 河豚打包器 → 卸载河豚打包器；软件更新面板 → 卸载软件。软件内卸载先保存当前应用编辑，构建中阻止卸载。

卸载只移除安装程序、桌面/开始菜单入口和系统登记。外部 UniAppTools 中的档案、主题、密钥、签名、构建记录与公共开发环境保留；重新安装继续读取原数据。退出与更新前请先保存设置抽屉中的编辑。源码和成品仍未使用商业代码签名证书。

每次构建生成 SHA256SUMS.txt 与 release-manifest.json，记录源码提交、文件大小和 SHA-256；发布包可按这些文件核对。软件更新只接受固定仓库的正式 Release 与有效 SHA-256 digest。
