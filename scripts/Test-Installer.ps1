param([ValidatePattern('^[a-z0-9-]+$')][string]$QaRun='installer-local-v01')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskInstall=[IO.Path]::GetFullPath((Join-Path $taskRoot ('.local\installed-app\'+$QaRun)))
if(-not $taskInstall.StartsWith((Join-Path $taskRoot '.local\installed-app\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Test install escaped its isolated directory'}
if(Test-Path -LiteralPath $taskInstall){throw 'Existing installed test output is protected'}
$taskAncestor=[IO.Path]::GetDirectoryName($taskInstall)
while($taskAncestor -ne $taskRoot){
 if((Test-Path -LiteralPath $taskAncestor)-and((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse point in installer target'}
 $taskAncestor=[IO.Path]::GetDirectoryName($taskAncestor)
}
$taskExisting=@(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' |
 ForEach-Object {Get-ItemProperty -LiteralPath $_.PSPath} | Where-Object {$_.DisplayName -eq 'QPet'})
if($taskExisting.Count){throw 'An existing QPet installation must be preserved; this isolated installer test did not run'}
foreach($taskLink in @(
 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'QPet.lnk'),
 (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\QPet.lnk')
)){
 if(Test-Path -LiteralPath $taskLink){throw 'An existing QPet shortcut must be preserved'}
}
$taskBuild=Get-Content -LiteralPath (Join-Path $taskRoot 'release\build-receipt.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskInstaller=@($taskBuild.artifacts | Where-Object {$_.name -like 'QPet-Setup-*.exe'})
if($taskInstaller.Count -ne 1){throw 'Expected one installer artifact'}
$taskSetup=Join-Path (Join-Path $taskRoot 'release') $taskInstaller[0].name
if((Get-FileHash -LiteralPath $taskSetup).Hash -ne $taskInstaller[0].sha256){throw 'Installer SHA mismatch'}
$taskBefore=@{}
foreach($taskName in @('settings.json','companion.json')){
 $taskFile=Join-Path (Join-Path $env:APPDATA 'QPet2D-Desktop') $taskName
 $taskBefore[$taskName]=if(Test-Path -LiteralPath $taskFile){(Get-FileHash -LiteralPath $taskFile).Hash}else{$null}
}
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskInstall)) -Force | Out-Null
# NSIS requires /D to be the final argument and without inner quotes.
$taskSetupProcess=Start-Process -FilePath $taskSetup -ArgumentList @('/S',('/D='+$taskInstall)) -WindowStyle Hidden -PassThru
$taskUntil=[DateTime]::UtcNow.AddMinutes(2)
while(-not $taskSetupProcess.WaitForExit(1000)){
 if([DateTime]::UtcNow -ge $taskUntil){throw 'Installer is still running; no process was terminated'}
}
$taskSetupProcess.Refresh()
if($taskSetupProcess.ExitCode -ne 0){throw 'Installer returned a nonzero exit code'}
$taskExe=Join-Path $taskInstall 'QPet.exe'
if(-not(Test-Path -LiteralPath $taskExe)){throw 'Installer did not create the app in the specified test directory'}
$taskRegistrations=@(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' |
 ForEach-Object {Get-ItemProperty -LiteralPath $_.PSPath} | Where-Object {$_.DisplayName -eq 'QPet'})
if($taskRegistrations.Count -ne 1){throw 'The expected uninstall registration was not found'}
if(-not $taskRegistrations[0].UninstallString.Contains($taskInstall)){throw 'Uninstaller registration points outside the isolated app'}
& (Join-Path $PSScriptRoot 'Test-Packaged.ps1') -Executable $taskExe -Suite expressions -QaRun ($QaRun+'-expressions')
$taskUninstaller=Join-Path $taskInstall 'Uninstall QPet.exe'
if(-not(Test-Path -LiteralPath $taskUninstaller)){throw 'Isolated app uninstaller is missing'}
$taskUninstallProcess=Start-Process -FilePath $taskUninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
$taskUntil=[DateTime]::UtcNow.AddMinutes(2)
while(Test-Path -LiteralPath $taskExe){
 if([DateTime]::UtcNow -ge $taskUntil){throw 'Uninstall did not finish removing the isolated test app'}
 Start-Sleep -Milliseconds 500
}
foreach($taskName in @('settings.json','companion.json')){
 $taskFile=Join-Path (Join-Path $env:APPDATA 'QPet2D-Desktop') $taskName
 $taskAfter=if(Test-Path -LiteralPath $taskFile){(Get-FileHash -LiteralPath $taskFile).Hash}else{$null}
 if($taskBefore[$taskName] -ne $taskAfter){throw 'Installer/uninstaller changed real user settings or memory'}
}
$taskEvidence=Join-Path $taskRoot ('.local\packaged-qa\'+$QaRun+'-installer.json')
if(Test-Path -LiteralPath $taskEvidence){throw 'Existing installer receipt protected'}
$taskReport=[pscustomobject]@{
 installer=[IO.Path]::GetFileName($taskSetup);installerSha256=$taskInstaller[0].sha256
 installedDirectory=$taskInstall;installerExitCode=$taskSetupProcess.ExitCode
 actualInstalledExeTested=$true;uninstallRemovedTestExe=$true
 realUserDataUnchanged=$true;crossMachineValidated=$false;passed=$true
}
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskEvidence -Encoding UTF8
$taskReport | ConvertTo-Json -Depth 5
