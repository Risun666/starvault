<#
.SYNOPSIS
  Build a signed, installable StarVault APK on Windows.

.DESCRIPTION
  No Gradle, no Android Studio project, no network downloads. Only the Android
  SDK build-tools (aapt2 / d8 / zipalign / apksigner) and a JDK are needed.

  powershell -ExecutionPolicy Bypass -File .\android\build-apk.ps1

  Override detection with $env:ANDROID_SDK_ROOT and $env:JAVA_HOME.
#>
param()
$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root = Split-Path -Parent $Here
$Src = Join-Path $Here 'app\src\main'
$Work = Join-Path $Here 'build'
$Out = Join-Path $Root 'dist'
$ApkName = 'StarVault-v1.0.0.apk'
$StorePass = 'starvault2026'

function Invoke-Step {
    param([string]$Label, [string]$Exe, [string[]]$Argv)
    Write-Host $Label
    # PowerShell 5.1 treats native stderr as an error when $ErrorActionPreference
    # is 'Stop'; javac/d8 write harmless notes there, so relax it temporarily.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Exe @Argv
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    if ($code -ne 0) { throw "$Label failed with exit code $code" }
}

# ------------------------------------------------------------------ SDK ---
$Sdk = $null
$SdkCandidates = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
if ($env:LOCALAPPDATA) { $SdkCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk') }
foreach ($c in $SdkCandidates) {
    if ($c -and (Test-Path (Join-Path $c 'build-tools'))) { $Sdk = $c; break }
}
if (-not $Sdk) { throw 'Android SDK not found. Set $env:ANDROID_SDK_ROOT to your SDK path.' }

$Bt = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory |
      Sort-Object Name -Descending | Select-Object -First 1
$Platform = Get-ChildItem (Join-Path $Sdk 'platforms') -Filter 'android.jar' -Recurse |
            Sort-Object FullName -Descending | Select-Object -First 1
if (-not $Bt -or -not $Platform) { throw "SDK is missing build-tools or a platform: $Sdk" }

$Aapt2 = Join-Path $Bt.FullName 'aapt2.exe'
$Zipalign = Join-Path $Bt.FullName 'zipalign.exe'
$D8Jar = Join-Path $Bt.FullName 'lib\d8.jar'
$SignerJar = Join-Path $Bt.FullName 'lib\apksigner.jar'

# ------------------------------------------------------------------ JDK ---
$Jdk = $null
$JdkCandidates = @()
if ($env:JAVA_HOME) { $JdkCandidates += $env:JAVA_HOME }
$JdkCandidates += @('C:\Program Files\Java\jdk-17', 'C:\Program Files\Java\jdk-21',
                    'C:\Program Files\Java\jdk-11')
foreach ($dir in @('C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium')) {
    if (Test-Path $dir) { $JdkCandidates += (Get-ChildItem $dir -Directory | ForEach-Object { $_.FullName }) }
}
foreach ($c in $JdkCandidates) {
    if ($c -and (Test-Path (Join-Path $c 'bin\javac.exe'))) { $Jdk = $c; break }
}
if (-not $Jdk) {
    $javacCmd = Get-Command javac -ErrorAction SilentlyContinue
    if ($javacCmd) { $Jdk = Split-Path -Parent (Split-Path -Parent $javacCmd.Source) }
}
if (-not $Jdk) { throw 'JDK 11+ not found. Set $env:JAVA_HOME (JDK 17 recommended).' }

$Java = Join-Path $Jdk 'bin\java.exe'
$Javac = Join-Path $Jdk 'bin\javac.exe'
$Keytool = Join-Path $Jdk 'bin\keytool.exe'

Write-Host "SDK      : $Sdk ($($Bt.Name), $($Platform.Directory.Name))"
Write-Host "JDK      : $Jdk"

# -------------------------------------------------------------- staging ---
if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $Work 'res'),
    (Join-Path $Work 'classes'), (Join-Path $Work 'dex'),
    (Join-Path $Work 'assets\www'), $Out | Out-Null
Copy-Item (Join-Path $Src 'res\*') (Join-Path $Work 'res') -Recurse -Force
Copy-Item (Join-Path $Root 'index.html') (Join-Path $Work 'assets\www') -Force
Copy-Item (Join-Path $Root 'css') (Join-Path $Work 'assets\www') -Recurse -Force
Copy-Item (Join-Path $Root 'js') (Join-Path $Work 'assets\www') -Recurse -Force

$ResZip = Join-Path $Work 'res.zip'
$BaseApk = Join-Path $Work 'base.apk'
$Unsigned = Join-Path $Work 'unsigned.apk'
$Aligned = Join-Path $Work 'aligned.apk'
$Manifest = Join-Path $Src 'AndroidManifest.xml'
$Assets = Join-Path $Work 'assets'
$Classes = Join-Path $Work 'classes'
$DexDir = Join-Path $Work 'dex'

Invoke-Step '[1/6] aapt2 compile + link' $Aapt2 @(
    'compile', '--dir', (Join-Path $Work 'res'), '-o', $ResZip)
Invoke-Step '        ' $Aapt2 @(
    'link', '-o', $BaseApk, '-I', $Platform.FullName, '--manifest', $Manifest,
    '-A', $Assets, '-R', $ResZip, '--auto-add-overlay',
    '--min-sdk-version', '24', '--target-sdk-version', '34')

$JavaFiles = @(Get-ChildItem (Join-Path $Src 'java') -Filter '*.java' -Recurse |
               ForEach-Object { $_.FullName })
Invoke-Step '[2/6] javac' $Javac (@(
    '-J-Duser.language=en', '-J-Duser.country=US', '-encoding', 'UTF-8',
    '-source', '8', '-target', '8', '-Xlint:-options',
    '-classpath', $Platform.FullName, '-d', $Classes) + $JavaFiles)

$ClassFiles = @(Get-ChildItem $Classes -Filter '*.class' -Recurse |
                ForEach-Object { $_.FullName })
Invoke-Step '[3/6] d8 -> classes.dex' $Java (@(
    '-Xmx512m', '-cp', $D8Jar, 'com.android.tools.r8.D8',
    '--lib', $Platform.FullName, '--min-api', '24', '--output', $DexDir) + $ClassFiles)

# Inject classes.dex with .NET (no Python dependency on Windows).
Write-Host '[4/6] inject classes.dex'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Copy-Item $BaseApk $Unsigned -Force
$zip = [System.IO.Compression.ZipFile]::Open($Unsigned,
        [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $entry = $zip.CreateEntry('classes.dex',
        [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $dexBytes = [System.IO.File]::ReadAllBytes((Join-Path $DexDir 'classes.dex'))
    $stream.Write($dexBytes, 0, $dexBytes.Length)
    $stream.Dispose()
} finally { $zip.Dispose() }
$checkZip = [System.IO.Compression.ZipFile]::OpenRead($Unsigned)
Write-Host ('  {0} zip entries' -f $checkZip.Entries.Count)
$checkZip.Dispose()

Write-Host '[5/6] zipalign + sign'
& $Zipalign -f -p 4 $Unsigned $Aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed with exit code $LASTEXITCODE" }

$Keystore = Join-Path $Here 'starvault.keystore'
if (-not (Test-Path $Keystore)) {
    Write-Host '  generating release keystore (keep this file private)'
    & $Keytool -genkeypair -alias starvault -keyalg RSA -keysize 2048 `
        -validity 10950 -keystore $Keystore -storepass $StorePass `
        -keypass $StorePass `
        -dname 'CN=StarVault, OU=Open Source, O=StarVault, L=Shanghai, ST=Shanghai, C=CN' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}
$FinalApk = Join-Path $Out $ApkName
Invoke-Step '        ' $Java @(
    '-jar', $SignerJar, 'sign',
    '--ks', $Keystore, '--ks-key-alias', 'starvault',
    '--ks-pass', "pass:$StorePass", '--key-pass', "pass:$StorePass",
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
    '--out', $FinalApk, $Aligned)

Invoke-Step '[6/6] verify' $Java @('-jar', $SignerJar, 'verify', '--verbose', $FinalApk)
& $Aapt2 dump badging $FinalApk | Select-Object -First 4
$size = (Get-Item $FinalApk).Length
Write-Host ''
Write-Host ("OK -> {0} ({1:N0} bytes)" -f $FinalApk, $size)
