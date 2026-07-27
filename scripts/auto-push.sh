#!/usr/bin/env bash

# Automatically commit and push workspace changes while this process is running.
set -u

REPO_DIR="$(git rev-parse --show-toplevel)"
cd "$REPO_DIR"

echo "자동 GitHub 업로드가 실행 중입니다. 멈추려면 Ctrl+C를 누르세요."

while true; do
  if [ -n "$(git status --porcelain)" ]; then
    # Give the editor a moment to finish a save and group nearby edits together.
    sleep 3

    if [ -n "$(git status --porcelain)" ]; then
      git add -A
      git commit -m "chore: 자동 저장"

      if git push origin main; then
        echo "$(date '+%H:%M:%S') GitHub 업로드 완료"
      else
        echo "$(date '+%H:%M:%S') 업로드 실패: 다음 변경 감지 때 다시 시도합니다." >&2
      fi
    fi
  fi

  sleep 2
done
