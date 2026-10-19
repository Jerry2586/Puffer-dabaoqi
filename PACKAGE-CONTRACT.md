# 河豚主题与基础 APK 固定接口 v1

此文档描述本地已实现的协议。主题作者不管理证书和构建环境；打包器不编辑主题 UI；客户端开发者实现原生渲染能力。

## 数据责任

| 内容 | 唯一负责方 |
|---|---|
| 主题布局、颜色、图片、主题 ZIP | 主题中心 |
| 主题渲染、设备输入、原生功能、权限 | 原生客户端源码 |
| 基础 APK、版本、后台地址、JKS、签名成品 | 打包器 |
| CMS 数据、会员、收费、播放鉴权和解析 | 独立业务后台 |

主题 ZIP 使用 hetun-skeleton v2，manifest.json 中包含 theme、platform、id、name；素材使用 assets/ 下的本地相对路径。packaging 字段提供需求摘要，但打包器必须重新遍历 theme 检查。导出剥离旧 integration 后台配置，主题包不能覆盖打包器后台地址或签名。

## 基础 APK

assets/hetun-base.json 必须声明：format=hetun-base-apk、version=1、contract=hetun-package-v1、runtime=hetun-runtime-v1、theme=hetun-skeleton-v2、os=android、assetRoot=assets/、packageName、devices、renderer、themeFields；可选 themeValues 声明字段允许的枚举。

实际字段声明示例（不是自动适配承诺）：brand.name、colors.background、navigation、navigation[].label、navigation[].page。数组容器与子字段分别检查，不允许通配符。完整已实现能力见打包器 native/android/theme-capabilities.json。新增字段必须先实现原生行为再声明。

基础 APK 必须有二进制 AndroidManifest.xml 和 DEX，实际包名与协议声明一致，应用 label 和版本为可修改的字面量。基础包被修改必须重新导入。版本构建号不得低于基础包。

成品保留基础包原生代码与资源，写入 assets/manifest.json、assets/assets/ 中的主题素材、assets/runtime.json。runtime 使用 hetun-runtime-v1，包含设备、平台、包名、名称、版本和 apiBase；不包含私钥、签名密码或用户登录令牌。

必须用自己的 JKS 对最终 APK 签名。升级已安装应用时需保持相同包名与签名证书；更换签名通常不能覆盖原安装。

## 两软件本机通信

默认共享目录：%LOCALAPPDATA%/Programs/UniAppTools/local-link，可用 HETUN_LOCAL_LINK_ROOT 为开发测试显式隔离。

- theme-center.json、packer.json：protocol=1，updatedAt；超过 8 秒失效。
- packer-capabilities.json：hetun-local-capabilities v1，updatedAt，app 显示信息，base 协议，baseDigest，error。仅有效心跳和新鲜能力声明可参与检查。
- inbox/<UUID>.json：hetun-local-theme v1，主题 ZIP 的 Base64、SHA-256、名称、时间与编号。
- receipts/<UUID>.json：真实接收结果；排队、接收和兼容状态独立。

主题中心本机服务 GET /api/admin/local-packer 返回连接和基础包能力；GET 同路径加 id 查询回执。POST {template,action:"check"} 导出已保存主题并返回 report、baseDigest、app，不产生交接队列。POST {template} 真实导出并排队，返回回执和 compatibility。检查失败不删除或修改主题。

以上 HTTP 接口要求本机 HttpOnly 会话；POST 必须同源 Origin、X-Hetun-Client: studio 和 application/json。不接受云端匿名调用。端口由本机服务启动后分配，不写死端口。

## 验收范围

Android 链路验证包括：真实基础 APK 编译，脱离源码和 Gradle 的主题注入、对齐、JKS 签名、apksigner 校验、aapt 身份检查、原生文件与资产完整性检查。自动化测试不替代真机界面、遥控器、真实 CMS 和播放验证。

当前 Kotlin 核心渲染器能力小于主题编辑器完整功能集，完整默认主题会报告缺失字段，不能标为全部适配。iOS/Windows 共享数据协议可以复用，但二进制重打包尚未实现，不允许据目标列表显示为可用。
