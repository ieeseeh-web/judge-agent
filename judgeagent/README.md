# judgeagent 패키지 구조

`judgeagent/`는 Judge Agent 프로젝트의 핵심 Python 패키지와 프론트엔드, reference agent 구현을 한곳에 모아둔 디렉터리입니다.

## 전체 구성

```text
judgeagent/
├── backend/              # FastAPI 기반 프론트엔드 API 서버와 CLI 진입점
├── frontend/             # React/Vite 기반 Judge Agent UI와 프론트엔드 문서
├── judge_agent/          # trace 분석, drift 탐지, 대화형 Judge Agent 핵심 로직
├── reference/            # Judge Agent가 평가할 reference web log agent
└── README.md             # 이 문서
```

## backend/

프론트엔드에서 호출하는 API 서버와 `judge-agent-simple` CLI 엔트리포인트가 들어 있습니다.

주요 파일:

- `api.py` — FastAPI 앱 생성 및 REST API 라우팅
- `api_models.py` — API 요청/응답 모델과 검증 로직
- `api_services.py` — reference run, analysis, judge session 처리 서비스
- `api_store.py` — `artifacts/frontend-api` 기반 파일 저장소
- `cli.py` — trace 분석, batch 분석, 대화형 judge chat CLI

주요 API:

- `GET /api/health`
- `GET /api/config`
- `GET /api/metrics`
- `GET /api/reference/fixtures`
- `POST /api/reference/runs`
- `POST /api/analyses`
- `POST /api/judge/sessions`
- `POST /api/judge/sessions/{session_id}/messages`

## frontend/

Judge Agent를 웹에서 실행/확인하기 위한 React 프론트엔드와 관련 설계 문서가 들어 있습니다.

주요 파일/폴더:

- `app/` — Vite + React + TypeScript UI
- `app/src/components/` — 분석 패널, reference agent 패널, 채팅 뷰 등 UI 컴포넌트
- `app/src/api/judgeClient.ts` — backend API client
- `API_REFERENCE.md` — 프론트엔드 API 명세
- `API_INTEGRATION_PLAN.md` — API 연동 계획
- `DESIGN.md` — UI/UX 설계 문서
- `CONVERSATIONAL_AGENT_FRONTEND_PLAN.md` — 대화형 agent 프론트엔드 계획

## judge_agent/

Judge Agent의 핵심 분석/판단 로직입니다. Reference agent가 만든 trace를 읽고 drift, 계약 위반, 이상 징후를 탐지하며 대화형 질의응답을 제공합니다.

주요 하위 모듈:

- `analysis/`
  - `analyzer.py` — 단일/복수 trace 분석
  - `detectors.py` — drift 및 이상 탐지 규칙
  - `reporter.py` — Markdown/JSON 리포트 생성
  - `tools.py` — 분석 보조 도구
- `conversation/`
  - `agent.py` — tool 기반/hybrid 대화형 agent
  - `graph.py` — graph 기반 대화 agent
  - `legacy.py` — 기존 deterministic chat agent
  - `state.py` — 대화 상태 저장/복원
- `core/`
  - `config.py` — 설정 로딩
  - `metrics.py` — metric 정의/계산
  - `schema.py` — 분석 결과 스키마
  - `session.py` — judge session 상태
- `adapters/`
  - `reference.py` — reference agent trace adapter
- `config/`
  - `app.json`, `conversation.json`, `metrics.json`, `detector_rules.json` 등 기본 설정
- `llm/`
  - `clients.py` — optional LLM client 생성
- `tests/` — 핵심 기능 테스트

## reference/

Judge Agent가 drift를 탐지할 기준 대상(reference target)인 web log analysis agent입니다.

주요 위치:

```text
reference/agent/weblog_agent/
```

주요 기능:

- web access log fixture 분석
- ReAct 스타일 `Thought -> Action -> Observation` 루프 시뮬레이션
- tool/MCP/RAG/LLM 이벤트 trace 기록
- drift fixture 실행 및 Markdown report 생성
- optional LangGraph/LangChain 구성과 호환 가능한 인터페이스 유지

주요 파일:

- `cli.py` — fixture 실행, custom analysis, chat mode CLI
- `graph.py`, `langgraph_app.py` — graph/runtime 구성
- `tools.py` — log parsing, metric 계산, anomaly detection 도구
- `mcp.py`, `rag.py` — MCP/RAG context 보강
- `trace.py` — trace event 기록
- `fixtures/` — 샘플 access log와 baseline fixture
- `README.md` — reference agent 상세 문서

## 실행 방법

프로젝트 루트 기준입니다.

### API + Frontend 동시 실행

```bash
./start.sh
```

기본 포트:

- Backend API: `http://localhost:19001`
- Frontend UI: `http://localhost:29173`

중지:

```bash
./stop.sh
```

### Backend API만 실행

```bash
BACKEND_PORT=19001 python -m uvicorn judgeagent.backend.api:app \
  --reload --host 0.0.0.0 --port 19001
```

필요 dependency:

```bash
pip install -e '.[api]'
```

### Frontend만 실행

```bash
cd judgeagent/frontend/app
npm install
npm run dev
```

### Judge Agent CLI

```bash
# 단일 trace 분석
python3 -m judgeagent.backend.cli analyze \
  --trace artifacts/weblog-reference/normal-login-error-spike.jsonl

# 여러 trace batch 분석
python3 -m judgeagent.backend.cli analyze-batch \
  --traces 'artifacts/weblog-reference/*.jsonl'

# 대화형 judge agent 시작
python3 -m judgeagent.backend.cli chat \
  --traces 'artifacts/weblog-reference/*.jsonl' \
  --mode deterministic-v2
```

설치 후 console script로도 실행할 수 있습니다.

```bash
judge-agent-simple analyze --trace artifacts/weblog-reference/normal-login-error-spike.jsonl
```

### Reference Weblog Agent CLI

```bash
# fixture 목록
python3 -m judgeagent.reference.agent.weblog_agent.cli list-fixtures

# 특정 fixture 실행
python3 -m judgeagent.reference.agent.weblog_agent.cli run-fixture normal-login-error-spike --no-llm

# 전체 fixture 실행
python3 -m judgeagent.reference.agent.weblog_agent.cli run-all --no-llm
```

설치 후 console script:

```bash
weblog-agent run-all --no-llm
```

## 출력물

실행 결과는 주로 프로젝트 루트의 `artifacts/` 아래에 저장됩니다.

- `artifacts/weblog-reference/` — reference agent trace/report
- `artifacts/frontend-api/reference-runs/` — API를 통해 실행한 reference run 결과
- `artifacts/frontend-api/analyses/` — Judge Agent 분석 결과
- `artifacts/frontend-api/judge-sessions/` — 대화형 judge session 상태

## 개발 참고

- Python package root는 프로젝트 루트이며, `pyproject.toml`의 `[tool.setuptools.packages.find] where = ["."]` 설정으로 `judgeagent` 패키지를 포함합니다.
- optional dependency:
  - `.[api]` — FastAPI/uvicorn API 서버
  - `.[agent]` — LangGraph/LangChain/MCP 계열 agent runtime
- LLM/API key는 코드에 넣지 말고 `.env` 또는 환경변수를 사용합니다.
- `judge_agent/config/*.json`에서 detector, metric, conversation 기본 동작을 조정할 수 있습니다.
