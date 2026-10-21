param([switch]$SkipChecks)
$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$started = Get-Date
$previousProject = $env:FIREBASE_PROJECT_ID
Push-Location $repositoryRoot
try {
    foreach ($file in @('apps/web/src/features/auth/auth.api.ts', 'apps/web/src/features/patient-monitoring/hooks.ts', 'apps/api/src/scripts/monitoring-fixtures.ts')) {
        if (!(Test-Path -LiteralPath $file)) { throw 'Faltan las implementaciones de Auth/monitoreo de #41/#42. Esta prueba no integra ni fusiona ramas.' }
    }
    if (!$SkipChecks) {
        & './tools/firebase/verify-gerson.ps1'
        if ($LASTEXITCODE -ne 0) { throw 'Fallaron las comprobaciones de API.' }
        npm run test --workspace=apps/web
        if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas web.' }
    }
    foreach ($port in @(18080, 19099, 13001, 15173)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "El puerto de verificación $port está ocupado. No se reutiliza ningún servicio existente."
        }
    }
    $env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
    npx -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'node tools/firebase/verify-patient-browser.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'Falló la prueba integrada de navegador.' }
} finally {
    # Firebase CLI can leave its Java child on Windows. Only clean a child
    # started by this run for the expected disposable project and port.
    $listeners = Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $child = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
        if ($child.CreationDate -ge $started -and $child.CommandLine -like '*cloud-firestore-emulator*--port 18080*--project_id demo-pulsolink*') {
            Stop-Process -Id $child.ProcessId
        }
    }
    $env:FIREBASE_PROJECT_ID = $previousProject
    Pop-Location
}
