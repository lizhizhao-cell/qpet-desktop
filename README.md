# QPet Desktop

Windows x64 Live2D桌面宠物，基于Electron与本地Cubism Core运行。角色有透明窗口、拖动/穿透、托盘菜单、动作、表情及本地陪伴。

这是干净的应用源码仓库。角色原画、模型、Cubism Core二进制、编辑器、历史工程及个人数据不在仓库内；它们有各自的来源和许可要求。

## 下载与使用

普通用户请到 [v0.2.0-beta.5 下载页](https://github.com/lizhizhao-cell/qpet-desktop/releases/tag/v0.2.0-beta.5) 选择下面的文件，**无需下载源码或安装开发工具**：

- [Windows x64 安装版](https://github.com/lizhizhao-cell/qpet-desktop/releases/download/v0.2.0-beta.5/QPet-Setup-0.2.0-beta.5-win-x64.exe)：下载后双击安装。
- [Windows x64 免安装 ZIP](https://github.com/lizhizhao-cell/qpet-desktop/releases/download/v0.2.0-beta.5/QPet-0.2.0-beta.5-win-x64.zip)：完整解压到可写目录，再双击其中的`QPet.exe`，保留其他文件。
- [SHA256SUMS.txt](https://github.com/lizhizhao-cell/qpet-desktop/releases/download/v0.2.0-beta.5/SHA256SUMS.txt)：下载文件的SHA256。

这是测试预发布版，包含运行需要的原模型与运行时，已完成本机运行、互动、动作与原用户数据保持检查。安装器机制沿用旧版，本轮未重复安装/卸载。应用未签名，其他电脑兼容性仍待验证；官方模型工程核验尚未完成，使用现有正常运行模型。源码许可和第三方/素材说明见文末及`THIRD_PARTY_NOTICES.md`，不宣称获得额外素材授权。

升级前先退出旧桌宠，再运行新版安装程序；ZIP用户请完整解压到新目录运行。原位置设置与陪伴记忆继续沿用，旧版安装包仍可在历史Release中下载。

Windows可能因应用未签名显示提示，请先核对来源和SHA256，自行决定是否运行。退出请使用角色右键或托盘菜单。

## 功能

当前源码与公开下载版本为 **0.2.0-beta.5**，新增功能与验证见[更新说明](RELEASE_NOTES.md)。

- 头顶窄输入气泡，带少量装饰、随文字长度伸缩；单击宠物打开、回车发送、Esc收起。支持动作口令和JSON扩展，见[互动指令说明](INTERACTION_COMMANDS.md)。
- 自然/活泼/安静三档自主活动、短散步和更多本地互动；输入、专注、免打扰和手动操作优先。
- 透明置顶、鼠标拖动、透明区穿透、大小和位置保存。
- 左右行走、跳跃、高兴、打招呼等组合动作，捂嘴与月牙眼。
- 右键“互动一下…”：给我打气、夸夸她、一起放松，以及后续选择。
- 25/50分钟专注、暂停/继续、休息提醒、免打扰。
- 本地记忆，不上传点击/专注记录；没有在线聊天或自动更新。

位置设置和陪伴记忆在`%APPDATA%\QPet2D-Desktop\`，升级沿用原记录。退出用角色或托盘菜单；安装版卸载保留个人记录。

## 本地开发与构建

安装Node.js 24和Git，然后在仓库根执行：

```powershell
npm ci
npm run assets:import -- "D:\AuthorizedQPetResources"
npm start
npm test
npm run check
npm run dist:win
```

资源导入路径应是你有权使用的QPet原工程或便携目录，包含匹配的`production-live2d/runtime/surprise-face-v04/`和`desktop-pet/vendor/live2dcubismcore.min.js`。导入器核验`asset-lock.json`中的SHA，不接受不同模型，不自动从不明来源下载资源。导入文件均被Git忽略。

当前构建输出在`release-v0.2.0-beta.5-autonomy-final/`，已有输出拒绝覆盖，旧`release/`及beta.1至beta.4候选保留。固定Electron为43.8.3，electron-builder为26.15.3。若已有相同版本本地Electron，可设置`QPET_ELECTRON_DIST`指向该目录以复用；否则构建工具按固定版本准备运行时。

源码CI只跑不依赖角色素材的检查与测试。当前没有自动公开发布工作流。

## 发到GitHub

先检查下面的文件与权限，确认后再运行命令：

1. `npm run check`确认没有个人路径、凭据、历史文件和角色/Core二进制进入跟踪。
2. 阅读`THIRD_PARTY_NOTICES.md`与`PUBLISH_CHECKLIST.md`，确认公开下载资源的授权范围。
3. 在本机登录GitHub；凭据不要写进聊天、源码或脚本：

```powershell
gh auth login
git config user.name "你的GitHub用户名"
git config user.email "你的GitHub公开邮箱或noreply邮箱"
git add .
git commit -m "Prepare QPet desktop application"
.\scripts\Publish-GitHub.ps1 -Repository "OWNER/qpet-desktop" -Public
```

源码上传与发行包上传分开。确认角色/模型和Core可分发后，以下命令上传**草稿预发布**，不会自动公开发行包：

```powershell
.\scripts\Publish-GitHub.ps1 -Repository "OWNER/qpet-desktop" -Public -UploadRelease `
  -ConfirmAssetDistributionRights -ConfirmCoreDistributionTerms
```

到GitHub检查草稿中的安装包、ZIP、说明和校验文件，最后手动发布。不要把`node_modules`、`release`、模型编辑源、原画和个人设置直接提交到Git。

## 许可

项目源码许可证尚未由作者选定，见`LICENSE.md`。角色/模型与Cubism Core不属于项目源码许可；公开仓库本身不授予这些资源的再分发权。Electron及构建依赖保留各自许可证。
