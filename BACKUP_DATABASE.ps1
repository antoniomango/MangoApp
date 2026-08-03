# ================================================================
# MANGO SRL — Backup automatico database Supabase
# Salva un dump SQL giornaliero e mantiene gli ultimi 30 giorni
# ================================================================

$DB_HOST     = "aws-0-eu-west-1.pooler.supabase.com"
$DB_PORT     = "5432"
$DB_NAME     = "postgres"
$DB_USER     = "postgres.mtpzfxnyfkzikzlkomwz"

$BACKUP_DIR  = "C:\Users\RoverA\Desktop\MangoApp\backups"
$KEEP_DAYS   = 30

# ── Password: MAI hardcoded qui (era in chiaro nel repository pubblico dal 2026-06-19 al 2026-08-03,
#    vedi nota d'incidente nel vault — rotazione ancora da completare da parte di Antonio).
#    Fonte 1: variabile d'ambiente MANGO_DB_PASSWORD
#    Fonte 2: file locale fuori dal repository (permessi ristretti)
$DB_PASSWORD = $env:MANGO_DB_PASSWORD
if (!$DB_PASSWORD) {
    $pwFile = "$HOME\.mangoapp-db-password"
    if (Test-Path $pwFile) {
        $DB_PASSWORD = (Get-Content $pwFile -Raw).Trim()
    }
}
if (!$DB_PASSWORD) {
    Write-Host "ERRORE: password DB non trovata. Imposta la variabile d'ambiente MANGO_DB_PASSWORD" -ForegroundColor Red
    Write-Host "        oppure crea il file $HOME\.mangoapp-db-password (una riga, solo la password)." -ForegroundColor Red
    exit 1
}

# ── Crea cartella backup se non esiste ──
if (!(Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

# ── Nome file con data e ora ──
$timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupFile = "$BACKUP_DIR\mango_backup_$timestamp.sql"

# ── Cerca pg_dump (PostgreSQL client tools) ──
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (!$pgDump) {
    # Prova percorsi comuni
    $candidates = @(
        "C:\Users\RoverA\Desktop\MangoApp\pgsql\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $pgDump = $c; break }
    }
}

if (!$pgDump) {
    Write-Host "ERRORE: pg_dump non trovato. Installa PostgreSQL client tools da https://www.postgresql.org/download/windows/" -ForegroundColor Red
    exit 1
}

# ── Esegui backup ──
Write-Host "Backup in corso: $backupFile" -ForegroundColor Cyan
$env:PGPASSWORD = $DB_PASSWORD
& "$pgDump" -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -F plain -f $backupFile 2>&1

if ($LASTEXITCODE -eq 0) {
    $sizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
    Write-Host "Backup completato: $backupFile ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "ERRORE durante il backup! Controlla la connessione e la password." -ForegroundColor Red
    exit 1
}

# ── Elimina backup più vecchi di $KEEP_DAYS giorni ──
$cutoff = (Get-Date).AddDays(-$KEEP_DAYS)
$vecchi = Get-ChildItem "$BACKUP_DIR\mango_backup_*.sql" | Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($f in $vecchi) {
    Remove-Item $f.FullName -Force
    Write-Host "Eliminato vecchio backup: $($f.Name)" -ForegroundColor Yellow
}

$totale = (Get-ChildItem "$BACKUP_DIR\mango_backup_*.sql").Count
Write-Host "Backup presenti: $totale (ultimi $KEEP_DAYS giorni)" -ForegroundColor Cyan
$env:PGPASSWORD = ""
