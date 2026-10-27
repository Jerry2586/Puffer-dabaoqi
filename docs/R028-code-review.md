# R028 代码审查与验证

日期：2026-10-28。范围：河豚打包器 0.7.3 的启动空白与应用 Logo 流程。

## 问题与修复

旧版恢复 workspace.selectedApp，渲染器也回退首个应用，造成打开即显示旧档案。Store.init 清空本次选择，档案仍保存在磁盘；工作台和删除逻辑不再自动选中其他应用。用户显式打开后恢复。浏览器与桌面共享当前会话，单次浏览器刷新不重新创建桌面会话。

Logo 原先没有工作台入口，prepare 拒绝所有自定义图标，基础包也没有应用图标资源。模块 03 现可上传、更换、移除；新底包固定声明 res/drawable/hetun_app_icon.png，Android Manifest 引用该资源，重打包只允许替换此路径。旧底包不支持时明确拒绝。

## 主线程审查

已阅读本次变更涉及的 app-icon、base-apk、package-contract、store、main、preview、preview-bridge、renderer 相关逻辑、create-base、发行文件清单及测试。核对图片大小与像素上限、PNG CRC/分块/压缩数据/过滤器、真实路径约束、浏览器内容上传白名单、取消和失败保留配置、导入基础包保留已选 Logo，以及 immutable/mutable/资产集合的最终校验。

未发现本次范围内发布阻塞问题。该结论只覆盖修改范围，不表示全仓逐行审计。独立代理审查曾两次因服务 429 未完成，最后一次请求被服务内容策略阻断；未取得独立审查结论，不能声称独立审查通过。

## 验证证据

- 108 项 Node 测试通过，失败 0、跳过 0。日志保存在本机 validation-r027/hardening-1793118788872/r028-tests-final.log。语法检查通过。
- 真实 Android release 基础包构建成功，完整用户主题兼容缺项 0；二次打包、zipalign、临时随机 JKS 签名和引擎最终校验成功。测试签名不进入仓库或正式附件。
- aapt2 dump badging 实际输出 application-icon-160 指向 res/drawable/hetun_app_icon.png。
- 隔离浏览器实际显示空白启动；档案页保留历史应用，明确打开后恢复；模块 03 实际 PNG 上传成功，显示“Logo 已保存，打包时应用”。取消和移除恢复由自动测试覆盖，未把它们记录为 GUI 实测。
- 最终发行文件须经 GitHub 标签 CI 构建及回下载验证；结果另记于本地交付记录，不提前将待执行的发布检查记为成功。

## 保留限制

AGP 9.4.1 默认资源路径优化会将 PNG 改名，当前通过 android.enableResourceOptimizations=false 保留固定资源路径，并由 create-base 校验缺失时拒绝生成底包。AGP 将该选项标记 deprecated，后续升级须重新验证或调整路径保留策略。

本版 APK 未安装到模拟器或真机，不能宣称设备桌面 Logo 已验收；生产 CMS、支付、播放和 iOS/EXE 不属于本次验证。AOCI 正式代码索引 0 项且治理未对齐，无法给出完整系统认知或治理完成结论。本次按源码和实测证据推进。
