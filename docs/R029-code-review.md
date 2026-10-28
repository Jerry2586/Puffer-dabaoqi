# R029 源码审查与验证

日期：2026-10-28。交付：主题中心 0.4.4、打包器 0.7.4、新版 Android 手机完整基础包。

## 问题与处理

旧主题工作台 ReferenceSkeleton 与 Android AppExperience 使用不同的页面模板，导入主题只能替换数据，不能替换 APK 中编译好的旧渲染器。本次抽取共享 MobileExperience，分别接入工作台和客户端，删除独立旧参考组件，通过 provenance 的 30 项摘要固定共享快照。

Android UniApp 对相对本机素材路径的重写使 brand.logo 失效。assetUrl 对合法哈希素材返回 https://appassets.androidplatform.net/assets/...，由 LocalAssets 服务；仍拒绝任意路径和非 HTTPS 外链。启动图标仍使用模块 03 原生图标流程。

## 主线程审查范围与结论

- 已逐段核对 MobileExperience 的计算属性、事件、模板和样式，以及 MobileEpisodeList 的剧集选择行为。
- 核对 AppExperience 与真实 controller 的线路、剧集、播放结束、历史和收藏事件连接；核对 ThemeWorkbench 的 SkeletonPage/AppExperience 页面分工。
- 核对 native/client/src/services/api.ts 与 Android LocalAssets.kt 的路径及安全边界。
- 核对官方完整底包 mobile-experience-v1 能力检查、新旧迁移提示、第三方底包规则及共享源码摘要。
- 审查中修复：有自定义分区时重复追加默认分区、分类/手动内容缺失时错误回退其他影片、分类数据过滤、页面配色应用及本机 Logo 路径。
- 本轮修改范围未发现未解决的发布阻断问题；这不是全仓无缺陷声明。

独立代理审查请求因服务 429 未完成，已停止重试；本报告为主线程源码审查和实际测试证据，不冒充独立审查。AOCI 两仓均为 0 条正式代码 Entry，正文交付确认但治理 dirty/stale；不得将空索引称为治理完成。

## 已执行测试

| 检查 | 结果 |
|---|---|
| 主题中心自动测试 | 43/43，零失败、零跳过 |
| 打包器自动测试 | 110/110，零失败、零跳过 |
| 打包器脚本语法 | 60 个通过 |
| 主题中心前端 | 类型检查、实际 H5 编译、独立运行资源检查通过 |
| Android 完整底包 | release 构建、主题兼容、重新打包、临时签名及完整性通过 |
| 安装后 APK | Android 模拟器 8 项通过 |

安装后 8 项分别为：新版首页空态；目录和品牌图加载；我的页面及头像；详情和线路选集；选择第二集请求 nid=2；换线路请求 sid=2/nid=1；WebView 视频实际 ready/play；播放器水印图片加载。目录、播放响应和 187587 字节 H264/AAC MP4 为仓库外受控测试资源，未将固定成功响应或影片写入产品。视频验证使用实际媒体解码事件。

## 发布与边界

仅桌面升级或主题 ZIP 无法替换旧渲染器，必须使用本版完整 Android 基础包并重新生成 APK。两个中心仍仅手动 ZIP 交接。新版保留打包器默认空白和原生启动图标更换。

用户生产 CMS、授权媒体、会员支付、物理手机/平板/TV、全部媒体格式及 iOS/EXE 未在本轮验证。不把受控 API、模拟器或 Windows 编辑器测试扩大为这些能力已完成。正式 Windows 包由同版本 Git 标签的 CI 生成；提交、标签、CI、附件哈希和本机安装证据在发布后单独核对，不预先宣称成功。
