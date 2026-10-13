$content = Get-Content src\app.js -Raw
$old = "'<span>'+esc(m.name)+'<small>'+(position?'Schemavecka '+position:isHome?'Timvikarie':'Gästande ersättare')+'</small></span>'"
$new = "'<span>'+esc(m.name)+'</span>'"
if ($content.Contains($old)) {
    ($content -replace [regex]::Escape($old), $new) | Set-Content src\app.js -NoNewline
    Write-Host "Done."
} else {
    Write-Host "NOT FOUND"
}
