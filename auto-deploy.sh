#!/bin/bash
# -----------------------------------------------------------------------------
# UnHarnesedYU RAG Auto-Deployment Daemon
# 10초 간격으로 GitHub 원격 리포지토리의 main 브랜치 변경 사항을 감시하여,
# 새로운 커밋이 발견될 시 git pull 및 docker-compose 재빌드를 자동 수행합니다.
# -----------------------------------------------------------------------------

# ── 중복 실행 방지 (PID lock) ──────────────────────────────────────────────
LOCK_FILE="/tmp/auto-deploy.lock"

if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(date)] 이미 실행 중인 데몬이 있습니다. (PID: $OLD_PID) 종료합니다."
    exit 1
  fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE; exit" INT TERM EXIT
# ──────────────────────────────────────────────────────────────────────────────

REPO_DIR="$HOME/google-ai-agent"
cd "$REPO_DIR" || { echo "오류: 리포지토리 디렉토리를 찾을 수 없습니다: $REPO_DIR"; exit 1; }

echo "[$(date)] 자동 배포 감시 데몬이 실행되었습니다. (PID: $$, DIR: $REPO_DIR)"

while true; do
  # 1. 원격 서버에서 최신 브랜치 상태 fetch
  git fetch origin main &>/dev/null
  
  # 2. 로컬 헤드와 원격 main의 커밋 ID 비교
  LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
  REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null)
  
  if [ -n "$LOCAL_COMMIT" ] && [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "======================================================="
    echo "[$(date)] 새로운 커밋 발견! ($LOCAL_COMMIT -> $REMOTE_COMMIT)"
    echo "[$(date)] 자동 갱신 및 컨테이너 재빌드 배포를 시작합니다..."
    echo "======================================================="
    
    # 원격 코드 병합
    git pull origin main
    
    # 이전 구형 컨테이너 클리어 및 재빌드
    sudo docker-compose down
    sudo docker-compose up -d --build
    
    echo "-------------------------------------------------------"
    echo "[$(date)] 자동 재적재 및 배포 갱신이 완료되었습니다."
    echo "======================================================="
  fi
  
  # 10초 동안 대기 후 반복 실행
  sleep 10
done
