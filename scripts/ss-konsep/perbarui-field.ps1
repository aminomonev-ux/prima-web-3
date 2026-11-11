# scripts/ss-konsep/perbarui-field.ps1 — perbarui field lalu simpan docx (temporary)
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'field.log'
function Catat($m) { "$((Get-Date).ToString('HH:mm:ss'))  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

$root = Join-Path $PSScriptRoot '..\..\docs\konsep-sistem'
$dok  = (Resolve-Path (Join-Path $root 'PRIMA-Dokumen-Konsep-Sistem.docx')).Path

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($dok, $false, $false)
  Catat ('terbuka — halaman: ' + $doc.ComputeStatistics(2) + ' | gambar: ' + $doc.InlineShapes.Count)
  $doc.Fields.Update() | Out-Null
  Catat 'field isi diperbarui'
  foreach ($t in $doc.TablesOfContents) { $t.Update(); Catat 'daftar isi diperbarui' }
  foreach ($f in $doc.TablesOfFigures) { $f.Update(); Catat 'daftar gambar diperbarui' }
  $doc.Repaginate()
  Catat ('halaman akhir: ' + $doc.ComputeStatistics(2))
  $doc.Save()
  Catat 'docx disimpan'
  $doc.Close($false)
} catch {
  Catat ('GAGAL: ' + $_.Exception.Message)
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
