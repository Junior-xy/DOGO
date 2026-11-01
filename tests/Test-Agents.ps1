$ErrorActionPreference = 'Stop'
$documentPath = Join-Path $PSScriptRoot '..\AGENTS.md'
$content = Get-Content -LiteralPath $documentPath -Raw -Encoding utf8

if ($content -notmatch '(?m)^# 注意事项\r?$') {
    throw 'AGENTS.md must contain the precautions heading.'
}
if ($content -notmatch '(?m)^1\. 每次改动完成后，都必须创建一个对应的 Git commit，以便后续追踪和回滚。\r?$') {
    throw 'AGENTS.md must require a Git commit for every change.'
}
if ($content -notmatch '(?m)^2\. 每次改动后，都必须编写或更新相关测试，并在交付给用户前，确保所有测试和验证都通过。\r?$') {
    throw 'AGENTS.md must require tests and validation before delivery.'
}

Write-Output 'AGENTS.md validation passed.'
