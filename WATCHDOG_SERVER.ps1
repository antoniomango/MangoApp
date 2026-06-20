# ================================================================
# MANGO SRL - Watchdog server locale
# Controlla se il server e' attivo sulla porta 3000.
# Se non risponde, lo avvia automaticamente.
# ================================================================

$APP_DIR  = "C:\Users\RoverA\Desktop\MangoApp"
$PORT     = 3000
$LOG_FILE = "$APP_DIR\watchdog.log"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Out-File -FilePath $LOG_FILE -Append -Encoding utf8
}

function Is-ServerRunning {
    $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port $PORT -WarningAction SilentlyContinue
    return $conn.TcpTestSucceeded
}

function Start-MangoServer {
    Write-Log "Server non trovato sulla porta $PORT - avvio in corso..."
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npx serve . --listen $PORT" `
        -WorkingDirectory $APP_DIR `
        -WindowStyle Minimized `
        -PassThru
    Write-Log "Server avviato (PID $($proc.Id))"
}

# Controllo principale
if (Is-ServerRunning) {
    Write-Log "OK - server attivo sulla porta $PORT"
} else {
    Start-MangoServer
    Start-Sleep -Seconds 10
    if (Is-ServerRunning) {
        Write-Log "Server avviato con successo"
    } else {
        Write-Log "ATTENZIONE: server avviato ma non risponde ancora - ricontrollo al prossimo ciclo"
    }
}

# Mantieni solo gli ultimi 500 log
$lines = Get-Content $LOG_FILE -ErrorAction SilentlyContinue
if ($lines -and $lines.Count -gt 500) {
    $lines | Select-Object -Last 500 | Set-Content $LOG_FILE -Encoding utf8
}
