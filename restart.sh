#!/bin/bash
# 서버 재시작 스크립트

echo "====== 서버 재시작 시작 ======"
echo "1. 기존 서버 프로세스 찾기"

# Node.js 서버 프로세스 찾기
SERVER_PID=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')

if [ -n "$SERVER_PID" ]; then
    echo "2. 서버 프로세스 종료 (PID: $SERVER_PID)"
    kill -15 $SERVER_PID
    
    # 프로세스가 종료될 때까지 최대 5초 대기
    for i in {1..5}; do
        if ! ps -p $SERVER_PID > /dev/null; then
            break
        fi
        echo "   프로세스 종료 대기 중... ${i}초"
        sleep 1
    done
    
    # 그래도 종료되지 않으면 강제 종료
    if ps -p $SERVER_PID > /dev/null; then
        echo "   프로세스 강제 종료"
        kill -9 $SERVER_PID
    fi
else
    echo "2. 실행 중인 서버 프로세스 없음"
fi

echo "3. 서버 시작"
node server.js &

echo "4. 서버 재시작 완료"
echo "====== 서버 재시작 종료 ======" 