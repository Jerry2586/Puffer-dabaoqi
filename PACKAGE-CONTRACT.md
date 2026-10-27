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

可选 appIcon 字段只能声明 res/drawable/hetun_app_icon.png，资源必须真实存在，AndroidManifest.xml 的应用图标引用由制作底包时固定。打包器只允许替换该声明的 PNG；无声明的历史底包仍可按原流程打包，但请求自定义图标时拒绝，提示升级基础包。图标为不超过 5MB、2048×2048 的正方形 8 位非交错 PNG，上传内容经结构、校验和及解压长度验证。

二次打包保留其余原生资源，证明文件将声明图标单独列为 mutable，并在签名后验证预期摘要与完整文件集合；移除自定义图标时恢复底包资源。底包导入、归档和变更校验继续执行，不能用 appIcon 声明放开任意路径。

必须用自己的 JKS 对最终 APK 签名。升级已安装应用时需保持相同包名与签名证书；更换签名通常不能覆盖原安装。

## 两软件独立与手动主题交接

主题中心和打包器分别启动、分别保存数据。主题中心导出 hetun-skeleton v2 主题 ZIP，用户在打包器当前应用和设备的面板中点击或拖拽上传后直接使用；不扫描共享目录、不自动接收主题、不发送心跳或基础包能力。

打包器只允许 origin=import 且 appId 和 platform 与当前应用、设备一致的上传记录参与构建。上传 ZIP/JSON 最大 12MB，支持替换和移除，无全局主题选择或自动关联。普通保存不能修改主题引用，复制应用与档案交接不继承主题。历史无归属手动记录以及 local-catalog、local-link 等自动同步记录不显示、不用于构建；旧记录及文件保留，用户需重新上传为独立副本。状态视图、档案保存、构建检查和实际出包入口统一执行此规则。

旧 theme-center.json、packer.json、packer-capabilities.json、inbox 和 receipts 协议停止用于运行流程，历史目录不自动删除。打包器不暴露 localReceive、localLink、themeSync；主题中心旧 /api/admin/local-packer 接口返回 HTTP 410。源代码中保留的历史互连模块不代表功能仍启用。

## 验收范围

Android 链路验证包括：真实基础 APK 编译，脱离源码和 Gradle 的主题注入、对齐、JKS 签名、apksigner 校验、aapt 身份检查、原生文件与资产完整性检查。自动化测试不替代真机界面、遥控器、真实 CMS 和播放验证。

新版基础包使用完整 Vue 客户端快照和 Kotlin 宿主，按 native/android/theme-capabilities.json 声明实际支持字段；旧有限渲染器继续拒绝超出自身能力的主题。当前完整主题已通过兼容检查及签名出包，但不能由此推断所有生产业务和真机效果已验收。iOS/Windows 共享数据协议可以复用，二进制重打包尚未实现，不允许据目标列表显示为可用。


## 本机 CMS 发现与服务域名切换

运营端安装完成后和首次启动时，在尚未配置 CMS 的情况下扫描同服务器 /www/wwwroot 下的苹果 CMS 公共站点配置，并实际请求采集分类及影片接口。只发现一个可用站点才自动连接；多个站点由管理员选择。不会创建 CMS、执行 PHP 或读取数据库密码。异机 CMS 仍可手填地址；会员和支付适配需要单独验证。

后台服务域名设置保存一个 HTTPS 主域名和最多四个备用域名；域名、TLS 和服务器反向代理需事先可访问。GET /api/service-directory 返回 payload、signature、publicKey，均为 Base64，RSA-SHA256 签名。payload 的 contract 为 hetun-service-directory-v1，含公钥 SHA256 keyId、独立递增 revision、addresses、recoveryUrls、issuedAt。普通业务发布不会增加地址目录版本。

打包器检测后台时验证目录签名，再将固定公钥、地址和版本写入 runtime.serviceDirectory。新版 Kotlin 底包声明 service-routing-v1，运行时校验目录后再向服务发送登录令牌；旧底包不能带着新目录出包。GET 网络故障可换地址，POST 不自动重发。签名有效不代表证书、DNS 或服务器已部署。

至少保留一个可访问备用域名，或预先配置独立 HTTPS 恢复文件地址，并在每次地址变更后将后台导出的签名目录同步到该地址。所有已知入口同时失联且没有独立恢复入口时，离线客户端无法接收新域名，需更新安装包。换服务器须迁移业务数据以及 dataDir/service-key.pem，保持服务身份。目录公开不含私钥；私钥不能放进 APK。主题中心继续完全离线，不承担域名配置和服务发现。

本次原生客户端实现限 Android；iOS 和 Windows 的原生域名切换与二进制重打包未实现。
