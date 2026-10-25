param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')][string]$Repository,
    [switch]$Public,
    [switch]$UploadRelease,
    [switch]$ConfirmAssetDistributionRights,
    [switch]$ConfirmCoreDistributionTerms
)
$ErrorActionPreference='Stop'
$taskRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRepo
try {
    & gh auth status
    if($LASTEXITCODE -ne 0){throw 'Log into GitHub locally first with: gh auth login'}
    & node scripts/check-source.cjs
    if($LASTEXITCODE -ne 0){throw 'Source audit failed'}
    if($UploadRelease -and (-not $ConfirmAssetDistributionRights -or -not $ConfirmCoreDistributionTerms)){
        throw 'Confirm the character/model distribution rights and Core terms before uploading downloadable binaries.'
    }
    $taskAssets=@()
    if($UploadRelease){
        $taskVersion=(Get-Content -LiteralPath (Join-Path $taskRepo 'app/package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
        if($taskVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$'){throw 'Invalid application version'}
        $taskOutput=& node -p "require('./electron-builder.cjs').directories.output"
        if($LASTEXITCODE -ne 0 -or -not $taskOutput){throw 'Cannot read the configured build output'}
        $taskReleaseRoot=[IO.Path]::GetFullPath((Join-Path $taskRepo $taskOutput))
        if(-not $taskReleaseRoot.StartsWith($taskRepo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Build output escaped repository'}
        $taskReceipt=Get-Content -LiteralPath (Join-Path $taskReleaseRoot 'build-receipt.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if($taskReceipt.version -ne $taskVersion){throw 'Build receipt version differs from application version'}
        if(@($taskReceipt.artifacts).Count -ne 2){throw 'Expected one tested installer and one ZIP'}
        foreach($taskArtifact in $taskReceipt.artifacts){
            if([IO.Path]::GetFileName($taskArtifact.name) -ne $taskArtifact.name){throw 'Artifact must be a filename'}
            $taskArtifactPath=[IO.Path]::GetFullPath((Join-Path $taskReleaseRoot $taskArtifact.name))
            if(-not $taskArtifactPath.StartsWith($taskReleaseRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact escaped release directory'}
            if((Get-FileHash -LiteralPath $taskArtifactPath -Algorithm SHA256).Hash -ne $taskArtifact.sha256){throw 'Release artifact SHA does not match its build receipt'}
            $taskAssets+=$taskArtifactPath
        }
        $taskAssets+=Join-Path $taskReleaseRoot 'SHA256SUMS.txt'
        foreach($taskAsset in $taskAssets){if(-not(Test-Path -LiteralPath $taskAsset -PathType Leaf)){throw 'A release artifact is missing'}}
    }
    $taskDirty=& git status --porcelain
    if($taskDirty){throw 'Review and commit the intended source before uploading.'}
    $taskRemotes=@(& git remote)
    if($taskRemotes -notcontains 'origin'){
        $taskVisibility=if($Public){'--public'}else{'--private'}
        & gh repo create $Repository $taskVisibility --source . --remote origin --push
        if($LASTEXITCODE -ne 0){throw 'Repository creation/push failed'}
    }else{
        $taskOrigin=& git remote get-url origin
        if($taskOrigin -notmatch ([regex]::Escape($Repository)+'(?:\.git)?$')){throw 'Existing origin does not match the requested repository'}
        & git push -u origin main
        if($LASTEXITCODE -ne 0){throw 'Source push failed'}
    }
    if($UploadRelease){
        $taskNotes=Join-Path $taskRepo 'RELEASE_NOTES.md'
        $taskTag='v'+$taskVersion
        & gh release create $taskTag @taskAssets --repo $Repository --draft --prerelease --title ('QPet '+$taskTag) --notes-file $taskNotes
        if($LASTEXITCODE -ne 0){throw 'Draft release upload failed'}
    }
}finally{Pop-Location}
