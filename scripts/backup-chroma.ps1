# ================================================
# ChromaDB Docker 볼륨 백업 스크립트 (로컬 → GCP 배포용)
# 사용법: .\scripts\backup-chroma.ps1
# ================================================

$VOLUME_NAME = "google-ai-agent_chroma_data"
$BACKUP_FILE = "chroma_backup.tar"
$BACKUP_PATH = "$PSScriptRoot\..\$BACKUP_FILE"

Write-Host "🔍 ChromaDB 볼륨 백업 시작..." -ForegroundColor Cyan
Write-Host "📦 볼륨 이름: $VOLUME_NAME" -ForegroundColor Yellow

# 볼륨 존재 여부 확인
$volumeExists = docker volume ls --format "{{.Name}}" | Where-Object { $_ -eq $VOLUME_NAME }
if (-not $volumeExists) {
    Write-Host "❌ 볼륨 '$VOLUME_NAME'이 존재하지 않습니다." -ForegroundColor Red
    Write-Host "   먼저 'docker compose up chromadb -d' 후 'npm run ingest'를 실행하세요." -ForegroundColor Red
    exit 1
}

# 임시 컨테이너로 볼륨 내용을 tar로 압축 (busybox는 1MB짜리 경량 리눅스)
Write-Host "⚙️  볼륨 데이터를 $BACKUP_FILE 로 압축 중..." -ForegroundColor Cyan
docker run --rm `
    -v "${VOLUME_NAME}:/chroma_db" `
    -v "${PSScriptRoot}\..:/ backup" `
    busybox `
    tar czf "/backup/$BACKUP_FILE" -C /chroma_db .

if ($LASTEXITCODE -eq 0) {
    $fileSize = (Get-Item $BACKUP_PATH).Length / 1MB
    Write-Host "✅ 백업 완료!" -ForegroundColor Green
    Write-Host "   파일: $BACKUP_PATH" -ForegroundColor Green
    Write-Host "   크기: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Green
    Write-Host ""
    Write-Host "📤 GCP 서버로 전송하려면:" -ForegroundColor Yellow
    Write-Host "   gcloud compute scp $BACKUP_FILE [VM_NAME]:~/ --zone=[ZONE]" -ForegroundColor White
    Write-Host "   또는 Docker Volume을 통해:" -ForegroundColor Yellow
    Write-Host "   scp $BACKUP_FILE user@your-gcp-ip:~/" -ForegroundColor White
} else {
    Write-Host "❌ 백업 실패! Docker 로그를 확인하세요." -ForegroundColor Red
    exit 1
}
