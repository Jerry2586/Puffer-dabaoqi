# 河豚打包器架构

## 固定职责

主题中心制作、保存并导出 hetun-skeleton v2 主题和本机素材。打包器管理基础 APK、设备档案、运行配置、版本和自有签名。客户端源码开发在独立流程中完成，首次编译生成已接入协议的基础 APK。日常出包不导入源码，不调用 Gradle，不回退到源码重编译。

Electron 的 main/preload/renderer 分离，渲染器无 Node 权限。公开 IPC 使用固定本地操作白名单，禁用云授权、云任务、在线更新、Mac 构建和源码导入。浏览器镜像仅用于本机访问，签名与打包由桌面进程执行。

## 真实 APK 重打包

core/base-apk.cjs 读取真实 APK 内的 assets/hetun-base.json、二进制 AndroidManifest.xml 和 DEX，核对包名及协议。导入时保存 SHA-256，构建前重新核对。core/package-contract.cjs 根据实际主题字段和取值检查原生能力，不信任主题自己提供的 packaging 字段；不支持的字段明确拒绝。

core/android-manifest.cjs 保持包名与原生资源引用，修改字面量应用名、versionName、versionCode。core/engine.cjs 注入本机主题与 runtime.json，移除旧 ZIP 签名，用 zipalign 对齐，自有 JKS 签名，验证签名指纹、APK 身份、16KB 对齐、代码与资产哈希以及文件集合。产物与校验证据存于源码外。

当前已接入 Android APK。IPA、EXE 的二进制重打包未实现，入口明确禁止出包。自有协议客户端可接入；任意第三方 APK 不能自动获得主题渲染能力。更换包名、图标、权限或原生功能需要开发者重新制作基础 APK。

## 本机互联

hetun-local-theme v1 使用本机共享目录、原子队列、SHA-256、去重和接收回执，按设备绑定。双方使用有效期 8 秒的心跳显示连接。打包器发布当前选定基础包的 hetun-local-capabilities v1；只包含应用显示信息、基础包协议与摘要，不包含证书密码、后台凭据或本机基础包路径。

主题中心实际导出已保存主题后执行兼容检查；连接、接收与可打包是独立状态。允许保存和传递不兼容主题，实际打包严格拒绝。构建期间暂停自动接收，避免主题切换影响当前任务。

## 客户端和业务接口

runtime.json 使用 hetun-runtime-v1，后台地址只由打包器配置。客户端通过 HTTPS 河豚网关访问苹果 CMS v10；苹果 CMS 与 Apple iOS 是不同概念。主题编辑与 APK 重打包不依赖 CMS 在线。业务服务、支付、解析和真机运行需要独立联调。

仓库 Kotlin 基础渲染器目前只实现 native/android/theme-capabilities.json 列出的字段。完整编辑器主题包含更多效果，不能据此宣称原生已经全部适配。旧 native-project、desktop、Mac 和云端模块保留用于开发或历史兼容，不属于日常打包入口。
