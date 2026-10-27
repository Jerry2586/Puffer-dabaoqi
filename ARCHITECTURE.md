# 河豚打包器架构

## 固定职责

主题中心制作、保存并导出 hetun-skeleton v2 主题和本机素材。打包器管理基础 APK、设备档案、运行配置、版本和自有签名。客户端源码开发在独立流程中完成，首次编译生成已接入协议的基础 APK。日常出包不导入源码，不调用 Gradle，不回退到源码重编译。

Electron 的 main/preload/renderer 分离，渲染器无 Node 权限。公开 IPC 使用固定本地操作白名单，禁用云授权、云任务、在线更新、Mac 构建和源码导入。浏览器镜像仅用于本机访问，签名与打包由桌面进程执行。

## 真实 APK 重打包

core/base-apk.cjs 读取真实 APK 内的 assets/hetun-base.json、二进制 AndroidManifest.xml 和 DEX，核对包名及协议。导入时保存 SHA-256，构建前重新核对。core/package-contract.cjs 根据实际主题字段和取值检查原生能力，不信任主题自己提供的 packaging 字段；不支持的字段明确拒绝。

core/android-manifest.cjs 保持包名与原生资源引用，修改字面量应用名、versionName、versionCode。core/engine.cjs 注入当前应用和设备已上传的主题与 runtime.json，移除旧 ZIP 签名，用 zipalign 对齐，自有 JKS 签名，验证签名指纹、APK 身份、16KB 对齐、代码与资产哈希以及文件集合。产物与校验证据存于源码外。

当前已接入 Android APK。IPA、EXE 的二进制重打包未实现，入口明确禁止出包。自有协议客户端可接入；任意第三方 APK 不能自动获得主题渲染能力。更换包名、图标、权限或原生功能需要开发者重新制作基础 APK。

## 两个软件独立运行

主题中心与打包器分别管理数据和运行进程，通过 hetun-skeleton v2 主题 ZIP 手动交接。打包器不启动 ThemeReceiver，不发布心跳或基础包能力，不扫描共享目录、接收队列或自动更新已导入主题。IPC 与开发预览不暴露 localReceive、localLink 或 themeSync。

主题中心只导出文件。打包器的主题入口是当前应用、当前设备的单一上传面板，支持点击选文件或拖拽 ZIP/JSON，校验成功后直接生效，可替换或移除。不存在全局主题库、主题下拉选择和上传后的二次关联。构建检查仍以实际基础包和主题字段为准。历史主题、应用档案和旧共享目录保留；历史互连模块仅为源码兼容保留，不属于运行入口。

## 客户端和业务接口

runtime.json 使用 hetun-runtime-v1，后台地址只由打包器配置。客户端通过 HTTPS 河豚网关访问苹果 CMS v10；苹果 CMS 与 Apple iOS 是不同概念。主题编辑与 APK 重打包不依赖 CMS 在线。业务服务、支付、解析和真机运行需要独立联调。

仓库 Kotlin 基础渲染器目前只实现 native/android/theme-capabilities.json 列出的字段。完整编辑器主题包含更多效果，不能据此宣称原生已经全部适配。旧 native-project、desktop、Mac 和云端模块保留用于开发或历史兼容，不属于日常打包入口。

主题可用性同时验证 origin=import、appId 所有权和设备。公开状态只提供设备档案中的 uploadedTheme 元数据，不暴露全局 themes。只有上传和移除操作可修改主题引用；普通保存不能重绑或恢复旧引用。复制应用、导出和导入档案均不携带可复用主题引用。历史无 appId 的手动记录和同步记录保留但不可构建，需为当前应用重新上传。上传目标在打开文件选择前捕获，12MB 限制、设备校验和替换版本检查通过后原子提交档案；失败或取消保留当前主题。浏览器镜像通过同源鉴权传入文件内容，不能要求服务端读取任意本地路径。
