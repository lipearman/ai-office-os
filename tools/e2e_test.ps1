# End-to-end smoke test for AI Office OS backend
$base = "http://localhost:8000/api/v1"
$script:pass = 0; $script:fail = 0

function Req($method, $path, $token, $obj) {
  $r = [System.Net.WebRequest]::Create("$base$path")
  $r.Method = $method
  if ($token) { $r.Headers.Add("Authorization", "Bearer $token") }
  if ($null -ne $obj) {
    $body = ($obj | ConvertTo-Json -Compress -Depth 10)
    $r.ContentType = "application/json"
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $r.ContentLength = $bytes.Length
    $s = $r.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  }
  $resp = $r.GetResponse()
  return ([IO.StreamReader]::new($resp.GetResponseStream()).ReadToEnd() | ConvertFrom-Json)
}

function Check($name, $cond) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green; $script:pass++ }
  else       { Write-Host "  FAIL  $name" -ForegroundColor Red;   $script:fail++ }
}

Write-Host "`n=== AI Office OS - E2E Smoke Test ===`n"

$h = Req GET "/health/full" $null $null
Check "health: db+redis ok" ($h.database -eq "ok" -and $h.redis -eq "ok")

$login = Req POST "/auth/login" $null @{ email = "admin@example.com"; password = "Admin1234!" }
$token = $login.access_token
Check "auth: login token" ($token.Length -gt 20)

$me = Req GET "/auth/me" $token $null
Check "auth: /me" ($me.email -eq "admin@example.com")

$ws = Req GET "/workspaces" $token $null
$wsId = $ws[0].id
Check "workspace: list" ($wsId.Length -gt 10)

$agents = Req GET "/agents/workspace/$wsId" $token $null
Check "agents: seeded >=7" ($agents.Count -ge 7)

$tools = Req GET "/tools" $token $null
Check "tools: catalog 7" ($tools.tools.Count -eq 7)

$calc = Req POST "/tools/run" $token @{ workspace_id = $wsId; tool_name = "calculator"; params = @{ expression = "6*7" } }
Check "tools: calculator = 42" ($calc.result.result -eq 42)

$doc = Req POST "/knowledge/documents" $token @{ workspace_id = $wsId; title = "E2E Doc"; content = "The capital of France is Paris. Python is a programming language." }
Check "knowledge: doc indexed" ($doc.chunk_count -ge 1)

$search = Req POST "/knowledge/search" $token @{ workspace_id = $wsId; query = "What is the capital of France" }
Check "knowledge: search hit" ($search.results.Count -ge 1)

$mem = Req POST "/memories" $token @{ workspace_id = $wsId; content = "E2E memory note"; kind = "fact" }
Check "memory: add" ($mem.id.Length -gt 10)

$wf = Req POST "/workflows" $token @{
  workspace_id = $wsId; name = "E2E WF"
  nodes = @(@{ id = "s"; data = @{ kind = "start" } }, @{ id = "e"; data = @{ kind = "end" } })
  edges = @(@{ source = "s"; target = "e" })
}
Check "workflow: create" ($wf.id.Length -gt 10)

$run = Req POST "/workflows/$($wf.id)/run" $token @{ input = @{ text = "hi" } }
Check "workflow: run success" ($run.status -eq "success")

$obs = Req GET "/observability/summary/workspace/$wsId" $token $null
Check "observability: totals" ($null -ne $obs.totals)

$role = Req GET "/audit/role/workspace/$wsId" $token $null
Check "rbac: role OWNER" ($role.role -eq "OWNER")

$audit = Req GET "/audit/workspace/$wsId" $token $null
Check "audit: has tool.run" (($audit.logs | Where-Object { $_.action -eq "tool.run" }).Count -ge 1)

$members = Req GET "/workspaces/$wsId/members" $token $null
Check "team: >=1 member" ($members.members.Count -ge 1)

$col = if ($script:fail -eq 0) { "Green" } else { "Red" }
Write-Host "`n=== Result: $($script:pass) passed, $($script:fail) failed ===`n" -ForegroundColor $col
