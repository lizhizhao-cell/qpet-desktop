param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [ValidateSet('companion','expressions')][string]$Suite='companion',
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$QaRun
)
$ErrorActionPreference='Stop'
$taskExecutable=[IO.Path]::GetFullPath($Executable)
if(-not(Test-Path -LiteralPath $taskExecutable -PathType Leaf)){throw 'Packaged executable is missing'}
$taskCategory=if($Suite -eq 'companion'){'companion-20261021'}else{'expressions-20261021'}
$taskFlag=if($Suite -eq 'companion'){'--companion-test'}else{'--expression-integration-test'}
$taskQaBase=Join-Path ([IO.Path]::GetTempPath()) 'QPet2D-Desktop-QA'
$taskReportDirectory=Join-Path $taskQaBase ('qa\'+$taskCategory+'\'+$QaRun)
$taskProfile=Join-Path $taskQaBase ('.qa-'+$taskCategory+'\'+$QaRun)
if((Test-Path -LiteralPath $taskReportDirectory)-or(Test-Path -LiteralPath $taskProfile)){throw 'Existing test evidence is protected'}
$taskBefore=@{}
foreach($taskName in @('settings.json','companion.json')){
 $taskPath=Join-Path (Join-Path $env:APPDATA 'QPet2D-Desktop') $taskName
 $taskBefore[$taskName]=if(Test-Path -LiteralPath $taskPath -PathType Leaf){(Get-FileHash -LiteralPath $taskPath).Hash}else{$null}
}
$taskProcess=Start-Process -FilePath $taskExecutable -ArgumentList @($taskFlag,('--qa-run='+$QaRun)) -WorkingDirectory ([IO.Path]::GetDirectoryName($taskExecutable)) -WindowStyle Hidden -PassThru
$taskIdentity=Get-CimInstance Win32_Process -Filter ('ProcessId='+$taskProcess.Id)
if(-not $taskIdentity -or $taskIdentity.ExecutablePath -ne $taskExecutable){throw 'Unexpected packaged process identity'}
$taskUntil=[DateTime]::UtcNow.AddSeconds(180)
$taskExited=$false
while([DateTime]::UtcNow -lt $taskUntil){
 if($taskProcess.WaitForExit(1000)){$taskExited=$true;break}
}
if(-not $taskExited){throw 'Packaged regression is still running; no process was terminated'}
$taskProcess.Refresh()
$taskReportPath=Join-Path $taskReportDirectory 'report.json'
if(-not(Test-Path -LiteralPath $taskReportPath)){throw 'Packaged app did not write its isolated QA report'}
$taskReport=Get-Content -LiteralPath $taskReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($taskName in @('settings.json','companion.json')){
 $taskPath=Join-Path (Join-Path $env:APPDATA 'QPet2D-Desktop') $taskName
 $taskAfter=if(Test-Path -LiteralPath $taskPath -PathType Leaf){(Get-FileHash -LiteralPath $taskPath).Hash}else{$null}
 if($taskBefore[$taskName] -ne $taskAfter){throw 'Real user settings or memory changed during isolated test'}
}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskEvidence=Join-Path $taskRoot ('.local\packaged-qa\'+$QaRun)
if(Test-Path -LiteralPath $taskEvidence){throw 'Existing copied QA protected'}
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskEvidence)) -Force | Out-Null
Copy-Item -LiteralPath $taskReportDirectory -Destination $taskEvidence -Recurse
$taskReceipt=[pscustomobject]@{
 executable=$taskExecutable;launchedPid=$taskProcess.Id;commandLine=$taskIdentity.CommandLine
 actualPackagedExe=$true;settingsOutsideAsar=$true;qaUserDataIsolated=$true;realUserDataUnchanged=$true
 checks=@($taskReport.checks.PSObject.Properties).Count;actions=@($taskReport.actions).Count
 exitCode=$taskProcess.ExitCode;passed=($taskReport.passed -and $taskProcess.ExitCode -eq 0)
}
$taskReceipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskEvidence 'packaged-receipt.json') -Encoding UTF8
$taskReceipt | ConvertTo-Json -Depth 5
if(-not $taskReceipt.passed){throw 'Packaged regression failed'}
