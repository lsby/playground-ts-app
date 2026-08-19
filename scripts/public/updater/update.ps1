param(
  [string]$ZipUrl = '',
  [string]$LocalZip = '',
  [string]$ExpectedSha256 = '',
  [string]$GitHubToken = '',
  [switch]$UseDefaultRepository,
  [switch]$AllowSameOrDowngrade,
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$AppDir = Join-Path $Root 'app'
$DataDir = Join-Path $Root 'data'
$DbDir = Join-Path $DataDir 'db'
$BackupsDir = Join-Path $DataDir 'backups'
$StagingDir = Join-Path $DataDir 'update-staging'
$WorkDir = Join-Path $DataDir 'update-work'
$PreviousRootDir = Join-Path $WorkDir 'previous-root'
$PreviousRootManifestPath = Join-Path $WorkDir 'previous-root-entries.json'
$DbBackupDir = Join-Path $WorkDir 'db.backup'
$MarkerPath = Join-Path $DataDir 'update-in-progress'
$PackagePath = Join-Path $AppDir 'package.json'
$AppExeName = 'lsby-playground-ts-app.exe'
$AppProcessName = 'lsby-playground-ts-app'
$script:DownloadSha256 = $ExpectedSha256
$script:ResolvedGitHubToken = if ($GitHubToken -ne '') { $GitHubToken } else { [string]$env:GITHUB_TOKEN }

function Assert-ChildPath([string]$Parent, [string]$Child) {
  $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $fullChild = [System.IO.Path]::GetFullPath($Child)
  if (-not $fullChild.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "路径越过允许目录: $Child"
  }
}

function Remove-SafePath([string]$Path) {
  Assert-ChildPath $Root $Path
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
}

function Get-RootEntriesExceptData([string]$Directory) {
  if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return @() }
  return @(Get-ChildItem -LiteralPath $Directory -Force | Where-Object { $_.Name -ine 'data' })
}

function Get-RepositoryUrl($Package) {
  if ($null -eq $Package.repository) { return '' }
  if ($Package.repository -is [string]) { return [string]$Package.repository }
  if ($null -ne $Package.repository.url) { return [string]$Package.repository.url }
  return ''
}

function Get-GitHubRepository([string]$RepositoryUrl) {
  $cleanUrl = $RepositoryUrl.Trim() -replace '^git\+', '' -replace '\.git$', ''
  $match = [regex]::Match($cleanUrl, 'github\.com[/:]([^/]+)/([^/#]+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $match.Success) { throw "无法从地址识别 GitHub 仓库: $RepositoryUrl" }
  return "$($match.Groups[1].Value)/$($match.Groups[2].Value)"
}

function Get-Architecture {
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { return 'arm64' }
  return 'x64'
}

function Read-GitHubToken {
  if ($script:ResolvedGitHubToken -ne '' -or $NonInteractive) { return }
  Write-Host '如果这是私有 GitHub 仓库，请输入有仓库读取权限的 Token；公开仓库直接回车。'
  $secureToken = Read-Host 'GitHub Token' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { $script:ResolvedGitHubToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-GitHubHeaders([string]$Accept) {
  $headers = @{
    Accept = $Accept
    'User-Agent' = 'lsby-electron-manual-updater'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  if ($script:ResolvedGitHubToken -ne '') { $headers.Authorization = "Bearer $($script:ResolvedGitHubToken)" }
  return $headers
}

function Download-File([string]$Url, [string]$Destination) {
  Write-Host "正在下载: $Url"
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -Headers @{ 'User-Agent' = 'lsby-electron-manual-updater' }
}

function Download-LatestGitHubRelease($CurrentPackage, [string]$RepositoryUrl, [string]$Destination) {
  Read-GitHubToken
  $repository = Get-GitHubRepository $RepositoryUrl
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" -Headers (Get-GitHubHeaders 'application/vnd.github+json')
  $architecture = Get-Architecture
  $asset = @($release.assets | Where-Object { $_.name -match "-electron-.*-win32-$architecture\.zip$" }) | Select-Object -First 1
  if ($null -eq $asset) { throw "最新 Release 中没有找到 win32-$architecture Electron 完整便携 ZIP" }

  $latestVersionStr = [string]$release.tag_name
  if ($latestVersionStr -eq '' -or $null -eq $latestVersionStr) {
    if ([string]$asset.name -match "-electron-(.*?)-win32-") {
      $latestVersionStr = $Matches[1]
    }
  }
  if ($latestVersionStr -ne '' -and $null -ne $latestVersionStr) {
    try {
      $latestVersion = Convert-ToVersion $latestVersionStr
      $currentVersion = Convert-ToVersion ([string]$CurrentPackage.version)
      if (-not $AllowSameOrDowngrade -and $latestVersion -le $currentVersion) {
        Write-Host "当前已是最新版本 (v$($CurrentPackage.version))，无需更新。"
        Remove-SafePath $StagingDir
        Remove-SafePath $WorkDir
        exit 0
      }
    } catch {
      # 忽略版本转换异常，退回后置校验
    }
  }

  if ($null -eq $asset.digest -or -not ([string]$asset.digest).StartsWith('sha256:')) {
    throw 'GitHub Release Asset 没有 SHA-256 摘要，拒绝更新'
  }
  $script:DownloadSha256 = ([string]$asset.digest).Substring(7)
  Write-Host "正在下载 GitHub Release Asset: $($asset.name)"
  Invoke-WebRequest -UseBasicParsing -Uri ([string]$asset.url) -OutFile $Destination -Headers (Get-GitHubHeaders 'application/octet-stream')
}

function Require-ManualSha256 {
  if ($script:DownloadSha256 -ne '') { return }
  if ($NonInteractive) { throw '使用 ZIP URL 或本地 ZIP 时必须指定 -ExpectedSha256' }
  $script:DownloadSha256 = Read-Host '请输入发布方提供的 ZIP SHA-256'
  if ($script:DownloadSha256 -eq '') { throw '未提供 SHA-256，拒绝更新' }
}

function Select-UpdateZip($Package, [string]$Destination) {
  if ($LocalZip -ne '') {
    Require-ManualSha256
    Copy-Item -LiteralPath ([System.IO.Path]::GetFullPath($LocalZip)) -Destination $Destination
    return
  }
  if ($ZipUrl -ne '') {
    Require-ManualSha256
    Download-File $ZipUrl $Destination
    return
  }

  $defaultRepository = Get-RepositoryUrl $Package
  if ($UseDefaultRepository) {
    if ($defaultRepository -eq '') { throw 'package.json 没有 repository，无法使用默认仓库' }
    Download-LatestGitHubRelease $Package $defaultRepository $Destination
    return
  }
  if ($NonInteractive) { throw '非交互模式必须指定 -LocalZip、-ZipUrl 或 -UseDefaultRepository' }

  Write-Host ''
  if ($defaultRepository -ne '') { Write-Host "1. 使用默认 GitHub 仓库最新 Release: $defaultRepository" }
  Write-Host '2. 输入其他 GitHub 仓库地址'
  Write-Host '3. 输入 ZIP 下载地址'
  Write-Host '4. 使用本地 ZIP 文件'
  $choice = Read-Host '请选择更新来源'
  switch ($choice) {
    '1' {
      if ($defaultRepository -eq '') { throw 'package.json 没有 repository' }
      Download-LatestGitHubRelease $Package $defaultRepository $Destination
    }
    '2' { Download-LatestGitHubRelease $Package (Read-Host 'GitHub 仓库地址') $Destination }
    '3' {
      Require-ManualSha256
      Download-File (Read-Host 'ZIP 下载地址') $Destination
    }
    '4' {
      Require-ManualSha256
      Copy-Item -LiteralPath ([System.IO.Path]::GetFullPath((Read-Host '本地 ZIP 路径'))) -Destination $Destination
    }
    default { throw '无效选择' }
  }
}

function Assert-ZipSha256([string]$ZipPath) {
  $expected = $script:DownloadSha256.Trim().ToLowerInvariant() -replace '^sha256:', ''
  if ($expected -notmatch '^[0-9a-f]{64}$') { throw 'SHA-256 格式无效' }
  $actual = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "更新包 SHA-256: $actual"
  if ($actual -ne $expected) { throw '更新包 SHA-256 校验失败' }
}

function Get-PrismaMigrationNames([string]$ProgramDir) {
  $migrationsDir = Join-Path $ProgramDir 'prisma\migrations'
  if (-not (Test-Path -LiteralPath $migrationsDir -PathType Container)) { return @() }
  return @(Get-ChildItem -LiteralPath $migrationsDir -Directory | Sort-Object Name | ForEach-Object { $_.Name })
}

function Expand-ValidatedZip([string]$ZipPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('\', '/')
      if ($name -eq '' -or $name.StartsWith('/') -or $name.Contains('../')) { throw "ZIP 包含不安全路径: $name" }
      $target = Join-Path $StagingDir $name
      Assert-ChildPath $StagingDir $target
      if ($entry.Name -eq '') {
        [System.IO.Directory]::CreateDirectory($target) | Out-Null
      } else {
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
      }
    }
  } finally {
    $archive.Dispose()
  }
  foreach ($requiredPath in @('app\package.json', "app\$AppExeName", 'app\.env\.env.production.electron', 'update.cmd', 'scripts\update.ps1', 'lsby-playground-ts-app-start.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $StagingDir $requiredPath) -PathType Leaf)) { throw "ZIP 缺少 $requiredPath" }
  }
  $stagedAppDir = Join-Path $StagingDir 'app'
  if (@(Get-PrismaMigrationNames $stagedAppDir).Count -gt 0) {
    if (-not (Test-Path -LiteralPath (Join-Path $stagedAppDir 'resources\app\node_modules\prisma\build\index.js') -PathType Leaf)) {
      throw 'ZIP 缺少 Prisma CLI'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $stagedAppDir 'resources\app\node_modules\@prisma\studio-core\dist\data\bff\index.cjs') -PathType Leaf)) {
      throw 'ZIP 中的 Prisma CLI 依赖不完整'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $stagedAppDir 'prisma.config.ts') -PathType Leaf)) { throw 'ZIP 缺少 prisma.config.ts' }
  }
}

function Convert-ToVersion([string]$Value) {
  $match = [regex]::Match($Value, '^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$')
  if (-not $match.Success) { throw "版本号不是有效的 SemVer: $Value" }
  return [version]::Parse("$($match.Groups[1].Value).$($match.Groups[2].Value).$($match.Groups[3].Value)")
}

function Assert-PackageIdentity($CurrentPackage, $NewPackage) {
  if ([string]$CurrentPackage.name -ne [string]$NewPackage.name) { throw '更新包的项目名称与当前程序不一致' }
  $currentVersion = Convert-ToVersion ([string]$CurrentPackage.version)
  $newVersion = Convert-ToVersion ([string]$NewPackage.version)
  if (-not $AllowSameOrDowngrade -and $newVersion -le $currentVersion) {
    Write-Host "目标版本 (v$($NewPackage.version)) 不高于当前版本 (v$($CurrentPackage.version))，无需更新。"
    Remove-SafePath $StagingDir
    Remove-SafePath $WorkDir
    exit 0
  }
}

function Invoke-Prisma([string]$ProgramDir, [string[]]$Arguments) {
  $electronPath = Join-Path $ProgramDir $AppExeName
  $prismaCliPath = Join-Path $ProgramDir 'resources\app\node_modules\prisma\build\index.js'
  $prismaConfigPath = Join-Path $ProgramDir 'prisma.config.ts'
  if (-not (Test-Path -LiteralPath $prismaCliPath -PathType Leaf)) { throw '新程序缺少 Prisma CLI' }
  if (-not (Test-Path -LiteralPath $prismaConfigPath -PathType Leaf)) { throw '新程序缺少 prisma.config.ts' }
  $oldElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
  $oldDatabaseUrl = $env:DB_PATH_PRISMA
  $oldNodePath = $env:NODE_PATH
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $env:DB_PATH_PRISMA = 'file:' + ([System.IO.Path]::GetFullPath((Join-Path $DbDir 'prod-electron.db')).Replace('\', '/'))
    $env:NODE_PATH = Join-Path $ProgramDir 'resources\app\node_modules'
    $processArguments = @($prismaCliPath) + $Arguments + @('--config', $prismaConfigPath) | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $prismaProcess = Start-Process -FilePath $electronPath -ArgumentList $processArguments -WorkingDirectory $ProgramDir -NoNewWindow -Wait -PassThru
    if ($prismaProcess.ExitCode -ne 0) { throw "Prisma 命令执行失败，退出码: $($prismaProcess.ExitCode)" }
  } finally {
    if ($null -eq $oldElectronRunAsNode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    else { $env:ELECTRON_RUN_AS_NODE = $oldElectronRunAsNode }
    if ($null -eq $oldDatabaseUrl) { Remove-Item Env:DB_PATH_PRISMA -ErrorAction SilentlyContinue }
    else { $env:DB_PATH_PRISMA = $oldDatabaseUrl }
    if ($null -eq $oldNodePath) { Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue }
    else { $env:NODE_PATH = $oldNodePath }
  }
}

function Restore-PreviousVersion {
  Write-Host '正在恢复更新前状态...'
  $previousRootNames = @()
  if (Test-Path -LiteralPath $PreviousRootManifestPath -PathType Leaf) {
    $manifestNames = Get-Content -LiteralPath $PreviousRootManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $previousRootNames = @($manifestNames | ForEach-Object { [string]$_ })
  }
  if (Test-Path -LiteralPath $PreviousRootDir -PathType Container) {
    foreach ($entry in Get-ChildItem -LiteralPath $PreviousRootDir -Force) {
      $currentPath = Join-Path $Root $entry.Name
      if (Test-Path -LiteralPath $currentPath) { Remove-SafePath $currentPath }
      Move-Item -LiteralPath $entry.FullName -Destination $Root
    }
  }
  if ($previousRootNames.Count -gt 0) {
    foreach ($entry in Get-RootEntriesExceptData $Root) {
      if ($previousRootNames -notcontains $entry.Name) { Remove-SafePath $entry.FullName }
    }
  }
  if (Test-Path -LiteralPath $DbBackupDir -PathType Container) {
    Remove-SafePath $DbDir
    Copy-Item -LiteralPath $DbBackupDir -Destination $DbDir -Recurse
  }
  if (Test-Path -LiteralPath $MarkerPath) { Remove-Item -LiteralPath $MarkerPath -Force }
  Remove-SafePath $StagingDir
  Remove-SafePath $WorkDir
  Write-Host '旧版本和数据库已经恢复。'
}

try {
  [System.IO.Directory]::CreateDirectory($DataDir) | Out-Null
  [System.IO.Directory]::CreateDirectory($BackupsDir) | Out-Null
  if (Test-Path -LiteralPath $MarkerPath) {
    Write-Host '检测到上次更新被中断。'
    Restore-PreviousVersion
    if (-not $NonInteractive) {
      $continue = Read-Host '是否继续开始一次新更新? (y/N)'
      if ($continue -ne 'y' -and $continue -ne 'Y') { exit 0 }
    }
  }

  if (@(Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue).Count -gt 0) { throw '应用仍在运行，请完全退出后再更新' }
  if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw '应用根目录缺少 app\package.json' }
  $package = Get-Content -LiteralPath $PackagePath -Raw -Encoding UTF8 | ConvertFrom-Json

  Remove-SafePath $StagingDir
  Remove-SafePath $WorkDir
  [System.IO.Directory]::CreateDirectory($StagingDir) | Out-Null
  [System.IO.Directory]::CreateDirectory($WorkDir) | Out-Null
  $downloadPath = Join-Path $WorkDir 'update.zip'
  Select-UpdateZip $package $downloadPath
  Assert-ZipSha256 $downloadPath
  Expand-ValidatedZip $downloadPath

  $stagedAppDir = Join-Path $StagingDir 'app'
  $newPackage = Get-Content -LiteralPath (Join-Path $stagedAppDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-PackageIdentity $package $newPackage
  if (Test-Path -LiteralPath $DbDir -PathType Container) { Copy-Item -LiteralPath $DbDir -Destination $DbBackupDir -Recurse }
  [System.IO.File]::WriteAllText($MarkerPath, (Get-Date).ToUniversalTime().ToString('o'))

  $prismaMigrationNames = @(Get-PrismaMigrationNames $stagedAppDir)
  if ($prismaMigrationNames.Count -gt 0) {
    $firstPrismaMigrationName = [string]$prismaMigrationNames[0]
    if ($null -eq $newPackage.prismaMigrationBaseline -or [string]$newPackage.prismaMigrationBaseline -ne $firstPrismaMigrationName) {
      throw '新程序的 app/package.json 与首个 Prisma migration 不一致'
    }
    if ($null -eq $package.prismaMigrationBaseline) {
      Write-Host '检测到首次引入 Prisma migrations，正在建立迁移基线...'
      Invoke-Prisma $stagedAppDir @('migrate', 'resolve', '--applied', $firstPrismaMigrationName)
    }
    Write-Host '正在执行 Prisma migrations...'
    Invoke-Prisma $stagedAppDir @('migrate', 'deploy')
  } else {
    Write-Host '更新包没有 Prisma migrations，跳过数据库迁移。'
  }

  $currentRootEntries = @(Get-RootEntriesExceptData $Root)
  [System.IO.File]::WriteAllText(
    $PreviousRootManifestPath,
    (ConvertTo-Json -InputObject @($currentRootEntries | ForEach-Object { $_.Name })),
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.Directory]::CreateDirectory($PreviousRootDir) | Out-Null
  foreach ($entry in $currentRootEntries) { Move-Item -LiteralPath $entry.FullName -Destination $PreviousRootDir }
  foreach ($entry in Get-RootEntriesExceptData $StagingDir) { Move-Item -LiteralPath $entry.FullName -Destination $Root }

  $timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  if (Test-Path -LiteralPath $DbBackupDir -PathType Container) {
    Copy-Item -LiteralPath $DbBackupDir -Destination (Join-Path $BackupsDir "before-update-$timestamp") -Recurse
  }
  Remove-Item -LiteralPath $MarkerPath -Force
  Remove-SafePath $StagingDir
  Remove-SafePath $WorkDir
  Write-Host '更新成功。现在可以运行 lsby-playground-ts-app-start.exe 启动新版本。'
  exit 0
} catch {
  Write-Host "更新失败: $($_.Exception.Message)" -ForegroundColor Red
  if (Test-Path -LiteralPath $MarkerPath) {
    try { Restore-PreviousVersion } catch { Write-Host "自动恢复失败: $($_.Exception.Message)" -ForegroundColor Red }
  } else {
    Remove-SafePath $StagingDir
    Remove-SafePath $WorkDir
  }
  exit 1
}
