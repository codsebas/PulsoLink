param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$started = Get-Date
$previousProject = $env:FIREBASE_PROJECT_ID
Push-Location $repositoryRoot
try {
    $nodeMajor = node -p 'process.versions.node.split(".")[0]'
    if ($LASTEXITCODE -ne 0 -or $nodeMajor -ne '24') { throw 'Esta verificación requiere Node.js 24 LTS.' }
    if (!(Get-Command java -ErrorAction SilentlyContinue)) { throw 'Se requiere Java 21 o posterior.' }
    foreach ($port in @(18080, 19099)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "El puerto de prueba $port está ocupado. Detenga su emulador antes de ejecutar esta suite desechable."
        }
    }
    $env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
    if (!$SkipBuild) {
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'Falló typecheck.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Falló build.' }
    }
    npx -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api -- --maxWorkers=2'
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas con emuladores.' }
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw 'Hay errores de espacios en el diff.' }
} finally {
    # Firebase CLI may leave its Java child alive on Windows. Only stop a child
    # created during this run, for this disposable project and the expected port.
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
