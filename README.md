Docker 이미지 사용 및 배포 가이드

1. GitHub Container Registry(GHCR)란?

GitHub에서 도커 이미지를 저장하고 배포하는 서비스입니다.
본 프로젝트의 도커 이미지는 GHCR에 푸시되어 관리됩니다.

2. 이미지 Pull (다운로드)

아래 명령어로 이미지를 로컬에 내려받아 사용합니다.

# GHCR 로그인 (처음 한 번만)
echo $CR_PAT | docker login ghcr.io -u FallGuysz --password-stdin

# Backend 이미지 Pull
docker pull ghcr.io/fallguysz/backend:latest

# Front 이미지 Pull
docker pull ghcr.io/fallguysz/front:latest
CR_PAT는 GitHub Personal Access Token (read:packages 권한 필요)
FallGuysz는 GitHub 사용자명입니다.
3. 이미지 실행 방법

Backend 컨테이너 실행
docker run -d -p 8080:8080 ghcr.io/fallguysz/backend:latest
Front 컨테이너 실행
docker run -d -p 80:80 ghcr.io/fallguysz/front:latest
각 포트는 필요에 따라 조절하세요.
4. 이미지 빌드 및 푸시 방법

# Backend 이미지 빌드 및 태그
docker build -t backend ./backend
docker tag backend ghcr.io/fallguysz/backend:latest

# Front 이미지 빌드 및 태그
docker build -t front ./front
docker tag front ghcr.io/fallguysz/front:latest

# GHCR 로그인 (처음 한 번만)
echo $CR_PAT | docker login ghcr.io -u FallGuysz --password-stdin

# 이미지 푸시
docker push ghcr.io/fallguysz/backend:latest
docker push ghcr.io/fallguysz/front:latest
5. 배포 팁

Kubernetes, Docker Compose 등에서 ghcr.io/fallguysz/backend:latest 및 ghcr.io/fallguysz/front:latest 이미지를 그대로 사용 가능
GitHub Actions로 자동 빌드 및 푸시 설정 추천
