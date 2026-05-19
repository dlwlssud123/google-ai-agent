#!/bin/bash
# ================================================
# ChromaDB Docker 볼륨 복원 스크립트 (GCP 서버에서 실행)
# 사용법: bash restore-chroma.sh chroma_backup.tar
# ================================================

BACKUP_FILE="${1:-chroma_backup.tar}"
VOLUME_NAME="google-ai-agent_chroma_data"

echo "🔍 ChromaDB 볼륨 복원 시작..."
echo "📦 백업 파일: $BACKUP_FILE"
echo "📦 볼륨 이름: $VOLUME_NAME"

# 백업 파일 존재 여부 확인
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ 백업 파일 '$BACKUP_FILE'이 존재하지 않습니다."
    echo "   scp로 백업 파일을 먼저 전송하세요:"
    echo "   scp chroma_backup.tar user@this-server:~/"
    exit 1
fi

# 기존 서비스 중지 (데이터 충돌 방지)
echo "⏹️  기존 서비스 중지 중..."
docker compose down

# 볼륨이 없으면 생성
docker volume create $VOLUME_NAME 2>/dev/null || true

# 임시 컨테이너로 tar 압축 해제하여 볼륨 복원
echo "⚙️  볼륨 데이터 복원 중..."
docker run --rm \
    -v "${VOLUME_NAME}:/chroma_db" \
    -v "$(pwd):/backup" \
    busybox \
    tar xzf "/backup/$BACKUP_FILE" -C /chroma_db

if [ $? -eq 0 ]; then
    echo "✅ 볼륨 복원 완료!"
    echo ""
    echo "🚀 서비스를 다시 시작하려면:"
    echo "   docker compose up -d"
    echo ""
    echo "🔎 복원된 데이터 확인:"
    echo "   curl http://localhost:8000/api/v1/collections"
else
    echo "❌ 복원 실패! 백업 파일을 확인하세요."
    exit 1
fi
