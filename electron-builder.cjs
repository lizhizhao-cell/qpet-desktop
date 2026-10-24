"use strict";
module.exports = {
  appId: "local.qpet.desktop",
  productName: "QPet",
  electronVersion: "43.8.3",
  directories: {app: "app", output: "release", buildResources: "assets"},
  asar: true,
  npmRebuild: false,
  files: ["**/*", "!vendor/README.md", "!**/*.test.cjs"],
  extraResources: [
    {from: "production-live2d/runtime/surprise-face-v04", to: "production-live2d/runtime/surprise-face-v04"},
    {from: "THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md"}
  ],
  artifactName: "QPet-${version}-win-${arch}.${ext}",
  win: {icon: "assets/icon.ico", target: [{target: "nsis", arch: ["x64"]}, {target: "zip", arch: ["x64"]}]},
  nsis: {
    artifactName: "QPet-Setup-${version}-win-${arch}.${ext}",
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    uninstallDisplayName: "QPet",
    installerIcon: "assets/icon.ico",
    uninstallerIcon: "assets/icon.ico"
  },
  publish: null
};
