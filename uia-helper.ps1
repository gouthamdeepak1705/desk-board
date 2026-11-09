# Long-running helper that reads and operates app controls through Windows UI Automation.
# Protocol: one JSON request per line on stdin, one JSON reply per line on stdout.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Native {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
[Native]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null   # report real pixels, not scaled ones
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$UIA = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

$InteractiveTypes = 'Button','CheckBox','ComboBox','Edit','Hyperlink','ListItem','MenuItem','RadioButton','TabItem','TreeItem','Slider','SplitButton','DataItem','Spinner'
$script:last = @()    # elements from the most recent read; indexes in later commands refer to this list

function Get-Root($title) {
  if ($title) {
    $kids = $UIA::RootElement.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $hit = $null
    foreach ($k in $kids) { $n = $k.Current.Name; if ($n -and $n.IndexOf($title, [StringComparison]::OrdinalIgnoreCase) -ge 0) { if ($n -ieq $title) { return $k }; if (-not $hit) { $hit = $k } } }
    if ($hit) { return $hit }
    throw "no window matches '$title'"
  }
  $h = [Native]::GetForegroundWindow()
  return $UIA::FromHandle($h)
}

function Read-Controls($req) {
  $root = Get-Root $req.window
  $max = if ($req.max) { [int]$req.max } else { 60 }
  $cr = New-Object System.Windows.Automation.CacheRequest
  foreach ($p in @($UIA::NameProperty, $UIA::ControlTypeProperty, $UIA::BoundingRectangleProperty, $UIA::IsEnabledProperty, $UIA::IsOffscreenProperty, $UIA::AutomationIdProperty)) { $cr.Add($p) }
  $cr.TreeScope = $Scope::Element
  $cr.AutomationElementMode = [System.Windows.Automation.AutomationElementMode]::Full
  $all = $null
  [void]$cr.Activate()
  try { $all = $root.FindAll($Scope::Descendants, [System.Windows.Automation.Automation]::ControlViewCondition) } finally { $cr.Pop() }
  $rows = New-Object System.Collections.ArrayList
  foreach ($e in $all) {
    $c = $e.Cached
    if ($c.IsOffscreen) { continue }
    $r = $c.BoundingRectangle
    if ($r.IsEmpty -or $r.Width -le 1 -or $r.Height -le 1) { continue }
    $type = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    $name = [string]$c.Name
    $keep = ($InteractiveTypes -contains $type) -or ($req.text -and $type -eq 'Text' -and $name.Length -gt 0)
    if (-not $keep) { continue }
    if (-not $name -and $type -ne 'Edit' -and $type -ne 'ComboBox') { $name = [string]$c.AutomationId }
    [void]$rows.Add([pscustomobject]@{ el = $e; type = $type; name = $name; id = [string]$c.AutomationId; x = [int]($r.X + $r.Width / 2); y = [int]($r.Y + $r.Height / 2); en = [bool]$c.IsEnabled; top = [int]$r.Y; left = [int]$r.X })
  }
  # reading order: rows top to bottom, then left to right
  $sorted = @($rows | Sort-Object @{ Expression = { [math]::Floor($_.top / 20) } }, left)
  if ($sorted.Count -gt $max) { $sorted = $sorted[0..($max - 1)] }
  $script:last = $sorted
  $out = for ($i = 0; $i -lt $sorted.Count; $i++) { $s = $sorted[$i]; [pscustomobject]@{ i = $i; type = $s.type; name = $s.name; x = $s.x; y = $s.y; enabled = $s.en } }
  return @{ ok = $true; window = $root.Current.Name; total = $all.Count; shown = $sorted.Count; elements = @($out) }
}

function Find-Index($req) {
  if ($null -ne $req.index) { $i = [int]$req.index; if ($i -ge 0 -and $i -lt $script:last.Count) { return $i }; throw "index $i is not in the last list; call read again" }
  if ($req.name) {
    for ($i = 0; $i -lt $script:last.Count; $i++) { if ($script:last[$i].name -ieq $req.name) { return $i } }
    for ($i = 0; $i -lt $script:last.Count; $i++) { if ($script:last[$i].name -and $script:last[$i].name.IndexOf($req.name, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $i } }
    throw "no control named '$($req.name)' in the last list"
  }
  throw 'need an index or a name'
}

function Invoke-Control($req) {
  $i = Find-Index $req; $s = $script:last[$i]; $e = $s.el
  foreach ($pat in @(@([System.Windows.Automation.InvokePattern]::Pattern, 'Invoke'), @([System.Windows.Automation.SelectionItemPattern]::Pattern, 'Select'), @([System.Windows.Automation.TogglePattern]::Pattern, 'Toggle'), @([System.Windows.Automation.ExpandCollapsePattern]::Pattern, 'Expand'))) {
    $p = $null
    if ($e.TryGetCurrentPattern($pat[0], [ref]$p)) { $p.($pat[1])(); return @{ ok = $true; clicked = $s.name; method = $pat[1] } }
  }
  return @{ ok = $true; clicked = $s.name; method = 'needs_mouse'; x = $s.x; y = $s.y }   # the caller clicks the centre
}

function Set-Control($req) {
  $i = Find-Index $req; $s = $script:last[$i]; $e = $s.el
  $p = $null
  if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p) -and -not $p.Current.IsReadOnly) { $p.SetValue([string]$req.text); return @{ ok = $true; set = $s.name; method = 'value' } }
  try { $e.SetFocus() } catch {}
  return @{ ok = $true; set = $s.name; method = 'needs_typing' }   # focused; the caller types the text
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $id = 0
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $res = switch ($req.cmd) {
      'read'  { Read-Controls $req }
      'click' { Invoke-Control $req }
      'set'   { Set-Control $req }
      'ping'  { @{ ok = $true } }
      default { throw "unknown command $($req.cmd)" }
    }
  } catch { $res = @{ ok = $false; error = $_.Exception.Message } }
  $res['id'] = $id
  [Console]::Out.WriteLine(($res | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
