param(
    [Parameter(Mandatory=$true)][string]$InputDirectory,
    [Parameter(Mandatory=$true)][string]$Output,
    [string]$Language = 'en-US'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Receive-WinRt($operation, [type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    return $task.GetAwaiter().GetResult()
}

$ocr = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Language))
if (!$ocr) { throw "Windows OCR language is unavailable: $Language" }
$records = @{}
$processed = 0
foreach ($image in (Get-ChildItem -LiteralPath $InputDirectory -Filter '*.png' -File | Sort-Object Name)) {
    if ($image.BaseName -notmatch '^(ans-\d{4}\.\d+\.\d+)_(obv|rev)_(0|90|180|270)$') { continue }
    $specimen, $side, $angle = $Matches[1], $Matches[2], $Matches[3]
    $file = Receive-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($image.FullName)) ([Windows.Storage.StorageFile])
    $stream = Receive-WinRt ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    try {
        $decoder = Receive-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Receive-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $result = Receive-WinRt ($ocr.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            if (!$records.ContainsKey($specimen)) { $records[$specimen] = @{obv=@{};rev=@{}} }
            $records[$specimen][$side][$angle] = @($result.Lines | ForEach-Object { $_.Text })
        } finally { $bitmap.Dispose() }
    } finally { $stream.Dispose() }
    $processed++
}
if (!$processed) { throw 'No OCR inputs found' }
$document = @{engine="Windows.Media.Ocr $Language"; inputs=$processed; specimens=$records} | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Output), $document, [Text.UTF8Encoding]::new($false))
Write-Output "Read $processed image orientations with Windows OCR"
