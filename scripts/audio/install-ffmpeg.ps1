$ErrorActionPreference = 'Stop'
$audioToolRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.cache/audio-tools'))
$audioBinary = Join-Path $audioToolRoot 'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe'
if (Test-Path -LiteralPath $audioBinary) { & $audioBinary -version; exit $LASTEXITCODE }
New-Item -ItemType Directory -Force -Path $audioToolRoot | Out-Null
$audioArchive = Join-Path $audioToolRoot 'ffmpeg-9.0.2.7z'
# Gyan is a Windows build provider linked from https://ffmpeg.org/download.html.
$audioArchiveUrl = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.7z'
& curl.exe --fail --location --max-time 600 --silent --show-error $audioArchiveUrl -o $audioArchive
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg download failed.' }
$audioArchiveHash = (Get-FileHash -LiteralPath $audioArchive -Algorithm SHA256).Hash
# Publisher checksum from ffmpeg-9.0.2-essentials_build.7z.sha256.
if ($audioArchiveHash -ne '4705843ccaaf54257c16ad90f3e952ece33c17df964ecf7bfdbb0f49c7171077') {
    throw 'FFmpeg checksum mismatch; archive was not installed.'
}
& tar.exe -xf $audioArchive -C $audioToolRoot
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg extraction failed.' }
& $audioBinary -version
exit $LASTEXITCODE
