# scripts/ss-konsep/ekspor-pdf.ps1 — ekspor PDF lewat Word (sementara)
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'ekspor.log'
function Catat($m) { "$((Get-Date).ToString('HH:mm:ss'))  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

$root = Join-Path $PSScriptRoot '..\..\docs\konsep-sistem'
$dok  = (Resolve-Path (Join-Path $root 'PRIMA-Dokumen-Konsep-Sistem.docx')).Path
$pdf  = Join-Path (Resolve-Path $root).Path '.pdf-baru.pdf'
if (Test-Path $pdf) { Remove-Item $pdf -Force }

Catat 'mulai Word'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
try {
  $doc = $word.Documents.Open($dok, $false, $false)
  Catat ('terbuka — halaman: ' + $doc.ComputeStatistics(2) + ' | daftar gambar: ' + $doc.TablesOfFigures.Count)
  Catat 'ekspor PDF…'
  $doc.SaveAs2($pdf, 17)          # wdFormatPDF
  Catat ('PDF ditulis: ' + [math]::Round((Get-Item $pdf).Length / 1MB, 2) + ' MB')
  $doc.Close($false)
  Catat 'selesai'
} catch {
  Catat ('GAGAL: ' + $_.Exception.Message)
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
