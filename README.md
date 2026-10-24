# QPet Desktop

Windows x64 Live2D桌面宠物，基于Electron与本地Cubism Core运行。角色有透明窗口、拖动/穿透、托盘菜单、动作、表情及本地陪伴。

这是干净的应用源码仓库。角色原画、模型、Cubism Core二进制、编辑器、历史工程及个人数据不在仓库内；它们有各自的来源和许可要求。

## 下载与使用

源码仓库为 **lizhizhao-cell/qpet-desktop**。下载安装包的公开入口将位于本仓库的 **Releases**：

- `QPet-Setup-版本-win-x64.exe`：安装版。
- `QPet-版本-win-x64.zip`：解压到可写目录后，双击`QPet.exe`。
- `SHA256SUMS.txt`：下载文件的SHA256。

当前安装版和ZIP为作者审阅的草稿预发布，尚未公开提供下载。跨机器验证、代码签名及素材/Core公开分发条件仍待确认；官方模型工程核验也尚未完成。已通过回归的原运行模型继续用于测试候选。源码公开不代表二进制发行包已经上架。

## 功能

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

构建输出在`release/`，已有输出拒绝覆盖。固定Electron为43.8.3，electron-builder为26.15.3。若已有相同版本本地Electron，可设置`QPET_ELECTRON_DIST`指向该目录以复用；否则构建工具按固定版本准备运行时。

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
