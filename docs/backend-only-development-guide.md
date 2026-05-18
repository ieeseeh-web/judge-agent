# Judge Agent Backend 단독 실행 개발 가이드

이 문서는 `judge-agent` 프로젝트에서 frontend 없이 backend API만 별도로 실행하는 방법을 정리합니다.

## 파일 위치

- 실행 스크립트: `scripts/run-backend.sh`
- Markdown 문서: `docs/backend-only-development-guide.md`
- HTML 문서: `docs/backend-only-development-guide.html`

## Backend 구성

현재 backend 앱은 FastAPI/uvicorn 기반입니다.

- 앱 모듈: `judgeagent.backend.api:app`
- 기본 포트: `19001`
- 기본 host: `0.0.0.0`
- 로그 경로: `.logs/backend.log`
- PID 파일: `.logs/backend.pid`

루트의 기존 `start.sh`는 backend와 frontend를 함께 실행합니다. backend만 실행하려면 새로 만든 스크립트를 사용합니다.

## 기본 실행

프로젝트 루트에서 실행합니다.

```bash
./scripts/run-backend.sh
```

실행 후 접속 주소:

```text
Backend:  http://localhost:19001
API Docs: http://localhost:19001/docs
```

## 포트 변경

```bash
BACKEND_PORT=19002 ./scripts/run-backend.sh
```

스크립트는 `BACKEND_PORT` 환경변수를 uvicorn 실행 환경에도 전달합니다.

## Host 변경

로컬에서만 접근하게 하려면 다음처럼 실행합니다.

```bash
BACKEND_HOST=127.0.0.1 ./scripts/run-backend.sh
```

같은 네트워크의 다른 장치에서도 접근해야 하면 기본값 `0.0.0.0`을 사용합니다.

## Python 실행 파일 지정

가상환경을 쓰는 경우:

```bash
PYTHON=.venv/bin/python ./scripts/run-backend.sh
```

또는 이미 가상환경을 활성화했다면 기본 실행으로 충분합니다.

```bash
source .venv/bin/activate
./scripts/run-backend.sh
```

## 의존성 설치

`uvicorn`이 없으면 스크립트가 실행을 멈추고 설치 안내를 출력합니다.

권장 설치:

```bash
python3 -m pip install -e '.[api]'
```

agent 관련 의존성까지 함께 설치해야 한다면:

```bash
python3 -m pip install -e '.[api,agent]'
```

## 로그 확인

```bash
tail -f .logs/backend.log
```

## 중지 방법

스크립트는 `.logs/backend.pid`에 backend PID를 저장합니다.

```bash
kill $(cat .logs/backend.pid)
```

프로젝트의 기존 `./stop.sh`도 `.logs/backend.pid`를 사용하므로 함께 사용할 수 있습니다.

```bash
./stop.sh
```

## reload 끄기

기본값은 개발 편의를 위해 `--reload`를 켭니다. reload 없이 실행하려면:

```bash
RELOAD=0 ./scripts/run-backend.sh
```

## 앱 모듈 변경

기본 앱 모듈은 `judgeagent.backend.api:app`입니다. 테스트용 앱이나 다른 entrypoint를 실행해야 하면:

```bash
APP_MODULE=some.module:app ./scripts/run-backend.sh
```

## 정상 동작 확인

1. backend 실행

   ```bash
   ./scripts/run-backend.sh
   ```

2. docs 페이지 확인

   ```bash
   open http://localhost:19001/docs
   ```

3. 로그 확인

   ```bash
   tail -f .logs/backend.log
   ```

## 문제 해결

### 이미 실행 중이라고 나오는 경우

```bash
cat .logs/backend.pid
kill $(cat .logs/backend.pid)
```

프로세스가 이미 종료됐는데 PID 파일만 남았다면 스크립트가 자동으로 정리합니다.

### `uvicorn`이 없다고 나오는 경우

```bash
python3 -m pip install -e '.[api]'
```

가상환경을 쓰는 경우 설치한 Python과 실행하는 Python이 같은지 확인하세요.

```bash
which python3
python3 -m pip show uvicorn
```

### 포트 충돌이 나는 경우

```bash
BACKEND_PORT=19002 ./scripts/run-backend.sh
```

### frontend가 같이 실행되는 경우

`./start.sh`가 아니라 아래 스크립트를 사용했는지 확인하세요.

```bash
./scripts/run-backend.sh
```

## 개발 체크리스트

- [ ] `python3 -m pip install -e '.[api]'` 또는 필요한 의존성 설치 완료
- [ ] `./scripts/run-backend.sh`로 backend만 실행
- [ ] `http://localhost:19001/docs` 접근 확인
- [ ] `.logs/backend.log`에서 에러 확인
- [ ] 작업 후 `./stop.sh` 또는 `kill $(cat .logs/backend.pid)`로 종료
