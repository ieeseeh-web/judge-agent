# Judge Agent Backend 개발 가이드

> 이 문서는 단순 실행법이 아니라 `judge-agent` backend를 실제로 개발·확장·검증하기 위한 개발자 가이드입니다.
> 실행 스크립트 사용법은 하단의 “로컬 실행” 섹션에서만 다룹니다.

## 1. 개발 목표

`judge-agent` backend는 Reference Web Log Agent가 생성한 trace를 수집하고, Judge Agent 분석 엔진으로 drift/finding을 계산한 뒤, 분석 결과를 대화형 Judge Session으로 연결하는 API 계층입니다.

핵심 목표는 다음과 같습니다.

1. **Reference Agent 실행 관리**
   - fixture 또는 custom input으로 reference agent를 실행합니다.
   - 실행 결과 trace/report를 artifact로 저장합니다.
   - timeline preview와 event count를 만들어 frontend가 즉시 표시할 수 있게 합니다.

2. **Judge 분석 파이프라인 제공**
   - JSONL trace를 `ReferenceAgentJsonlAdapter`로 정규화합니다.
   - detector rule을 적용해 finding, severity, score, gate를 산출합니다.
   - Markdown/JSON 분석 결과를 저장합니다.

3. **대화형 Judge Session 제공**
   - 분석 결과를 `ConversationState`에 로드합니다.
   - deterministic/tool-based/hybrid/graph mode로 후속 질문에 답합니다.
   - session state와 evidence/tool call을 파일 기반으로 보존합니다.

4. **Frontend 연동 API 제공**
   - React frontend가 Python 내부 구조를 직접 알 필요 없도록 DTO boundary를 제공합니다.
   - 현재는 파일 기반 저장소를 사용하지만, 향후 DB로 교체 가능한 service/store boundary를 유지합니다.

## 2. 현재 구현 범위

### 구현된 기능

| 영역 | 구현 내용 | 주요 파일 |
| --- | --- | --- |
| API App | FastAPI app 생성, CORS, route 등록, error handler | `judgeagent/backend/api.py` |
| Request DTO | dataclass 기반 요청 모델 및 payload parser | `judgeagent/backend/api_models.py` |
| Service Layer | reference run, analysis, judge session orchestration | `judgeagent/backend/api_services.py` |
| File Store | registry/report/trace/session 파일 저장소 | `judgeagent/backend/api_store.py` |
| CLI | trace 분석, batch 분석, 대화형 chat CLI | `judgeagent/backend/cli.py` |
| Adapter | reference JSONL trace 정규화 | `judgeagent/judge_agent/adapters/reference.py` |
| Detector | drift/finding rule 적용 | `judgeagent/judge_agent/analysis/detectors.py` |
| Conversation | tool-based/hybrid/graph 대화 agent | `judgeagent/judge_agent/conversation/*` |
| LLM Client | OpenAI-compatible/mock/none client | `judgeagent/judge_agent/llm/clients.py` |

### 아직 MVP 성격인 부분

- API 작업은 대부분 synchronous로 실행됩니다.
- 저장소는 DB가 아니라 `artifacts/frontend-api` 아래 파일 기반 registry입니다.
- `api_models.py`는 Pydantic이 아니라 dataclass + 수동 parser입니다.
- background job, upload, auth, multi-user isolation은 아직 본격 구현 전입니다.
- CORS origin은 local frontend 포트 중심으로 고정되어 있습니다.

## 3. 시스템 구조

```text
Frontend / CLI
   │
   ▼
judgeagent.backend.api
   │  FastAPI routes, error mapping, CORS
   ▼
judgeagent.backend.api_services
   │  use-case orchestration
   ├─ Reference Agent runtime
   │    judgeagent.reference.agent.weblog_agent.*
   │
   ├─ Judge Analysis runtime
   │    judgeagent.judge_agent.adapters.reference
   │    judgeagent.judge_agent.analysis.analyzer
   │    judgeagent.judge_agent.analysis.detectors
   │    judgeagent.judge_agent.analysis.reporter
   │
   ├─ Conversation runtime
   │    judgeagent.judge_agent.conversation.*
   │    judgeagent.judge_agent.llm.clients
   │
   └─ ApiStore
        artifacts/frontend-api/**
```

### 데이터 흐름

```text
1. GET /api/reference/fixtures
   └─ fixtures()에서 실행 가능한 fixture 목록 조회

2. POST /api/reference/runs
   └─ WebLogAnalysisAgent 실행
      ├─ trace JSONL 저장
      ├─ report Markdown 저장
      ├─ eventCounts 계산
      └─ timelinePreview 생성

3. POST /api/analyses
   └─ trace path 또는 referenceRunId 입력
      ├─ ReferenceAgentJsonlAdapter.load()
      ├─ ReferenceWebLogDetector.detect()
      ├─ score_findings(), gate_for()
      ├─ Markdown report 생성
      └─ analysis registry 저장

4. POST /api/judge/sessions
   └─ Analysis를 ConversationState로 변환
      ├─ loadedTraces 세팅
      ├─ analysisResults 세팅
      └─ 첫 finding 기준 focus 초기화

5. POST /api/judge/sessions/{id}/messages
   └─ mode별 conversation agent 실행
      ├─ deterministic-v2: ToolBasedConversationAgent
      ├─ hybrid: HybridConversationAgent + LLM client
      └─ graph: GraphConversationAgent + LLM client
```

## 4. 디렉터리와 책임

```text
judgeagent/
├── backend/
│   ├── api.py              # HTTP route와 FastAPI app entrypoint
│   ├── api_models.py       # request parser, ApiError
│   ├── api_services.py     # business use-case orchestration
│   ├── api_store.py        # file-backed resource registry
│   └── cli.py              # backend 기능을 CLI로 실행
│
├── judge_agent/
│   ├── adapters/           # 외부 trace format -> 내부 schema 변환
│   ├── analysis/           # analyzer, detectors, reporter, tools
│   ├── config/             # app/metric/detector/conversation/llm 설정
│   ├── conversation/       # 대화형 judge agent runtime
│   ├── core/               # config, schema, session, metrics
│   ├── llm/                # OpenAI-compatible/mock/none LLM client
│   └── tests/              # judge agent/backend 테스트
│
├── reference/
│   └── agent/weblog_agent/ # Judge 대상 reference weblog agent
│
└── frontend/
    └── app/                # Vite/React frontend
```

## 5. 주요 API 기능 정리

### System / Config

| Method | Path | 기능 |
| --- | --- | --- |
| `GET` | `/api/health` | backend 상태 확인 |
| `GET` | `/api/config` | app/LLM/metric config snapshot 조회 |
| `GET` | `/api/metrics` | drift metric registry 조회 |

### Reference Agent

| Method | Path | 기능 |
| --- | --- | --- |
| `GET` | `/api/reference/fixtures` | 실행 가능한 fixture 목록 |
| `POST` | `/api/reference/runs` | fixture/custom analysis 실행 |
| `GET` | `/api/reference/runs` | 저장된 reference run 목록 |
| `GET` | `/api/reference/runs/{run_id}` | reference run 상세 + report excerpt |
| `GET` | `/api/reference/runs/{run_id}/trace` | JSONL trace event page 조회 |

### Judge Analysis

| Method | Path | 기능 |
| --- | --- | --- |
| `POST` | `/api/analyses` | trace 기반 judge 분석 생성 |
| `GET` | `/api/analyses` | 분석 목록 |
| `GET` | `/api/analyses/{analysis_id}` | 분석 상세 + report excerpt |

### Judge Session

| Method | Path | 기능 |
| --- | --- | --- |
| `POST` | `/api/judge/sessions` | analysis 기반 대화 session 생성 |
| `GET` | `/api/judge/sessions` | session 목록 |
| `GET` | `/api/judge/sessions/{session_id}` | session 상태 조회 |
| `POST` | `/api/judge/sessions/{session_id}/messages` | user message 처리 |

## 6. 저장소와 산출물 설계

현재 backend는 `ApiStore`를 통해 파일 기반 저장소를 사용합니다.

```text
artifacts/frontend-api/
├── reference-runs/
│   ├── registry.json
│   ├── traces/*.jsonl
│   └── reports/*.md
│
├── analyses/
│   ├── registry.json
│   ├── *.json
│   └── reports/*.md
│
└── judge-sessions/
    ├── registry.json
    └── *.conversation.json
```

### 개발 시 주의사항

- `registry.json` schema는 frontend DTO와 사실상 contract입니다. 필드명 변경 시 frontend와 테스트를 같이 수정해야 합니다.
- path는 현재 문자열로 노출됩니다. 외부 입력 path를 확대할 때는 path traversal 방어가 필요합니다.
- 동시 요청이 많아지면 registry write race가 발생할 수 있습니다. DB 도입 전까지는 file lock 또는 atomic write 보강이 필요합니다.
- artifact는 개발 산출물이므로 기본적으로 git commit 대상이 아닙니다.

## 7. 개발 환경 준비

### Python

- 권장: Python 3.10 이상
- 최소: `pyproject.toml` 기준 Python 3.9 이상

```bash
cd ~/workspaces/judge/judge-agent
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[api]'
```

Agent/graph/LLM 관련 기능까지 개발할 때:

```bash
python -m pip install -e '.[api,agent]'
```

### Frontend

```bash
cd judgeagent/frontend/app
npm install
npm run dev
```

### 환경변수

LLM 없이 deterministic 기능만 개발하면 별도 key가 필요 없습니다.

LLM/hybrid/graph mode를 개발할 때는 `.env` 또는 shell 환경변수를 사용합니다.

```bash
JUDGE_LLM_PROVIDER=openai
JUDGE_LLM_MODEL=gpt-4o-mini
JUDGE_LLM_API_KEY=...
```

OpenAI-compatible local server 예시:

```bash
JUDGE_LLM_PROVIDER=openai-compatible
JUDGE_LLM_BASE_URL=http://localhost:1234/v1
JUDGE_LLM_MODEL=local-model
JUDGE_LLM_API_KEY=local-dev-key
```

주의: API key를 코드나 문서 예시에 실제 값으로 남기지 않습니다.

## 8. 로컬 실행

Backend만 실행:

```bash
./scripts/run-backend.sh
```

기본값:

- Backend: `http://localhost:19001`
- Swagger UI: `http://localhost:19001/docs`
- 로그: `.logs/backend.log`

옵션:

```bash
BACKEND_PORT=19002 ./scripts/run-backend.sh
BACKEND_HOST=127.0.0.1 ./scripts/run-backend.sh
PYTHON=.venv/bin/python ./scripts/run-backend.sh
RELOAD=0 ./scripts/run-backend.sh
```

전체 실행:

```bash
./start.sh
```

중지:

```bash
./stop.sh
```

## 9. 개발 단계별 작업 가이드

### 9.1 API endpoint 추가

1. `api_models.py`에 request dataclass/parser 추가
2. `api_services.py`에 use-case 함수 추가
3. `api.py`에 route 추가
4. `api_store.py`에 저장 경로/registry가 필요하면 method 추가
5. frontend DTO/API client 갱신
6. 테스트 추가

권장 규칙:

- route 함수에는 HTTP 처리만 둡니다.
- 실제 로직은 `api_services.py`에 둡니다.
- 저장소 접근은 `ApiStore` method를 통해 처리합니다.
- 오류는 `ApiError(code, message, detail, status_code)`로 통일합니다.

### 9.2 Detector rule 추가

1. `judgeagent/judge_agent/config/detector_rules.json`에 threshold/tool/section 등 설정 추가
2. `analysis/detectors.py`에 check method 추가
3. `ReferenceWebLogDetector.detect()`의 checks 목록에 등록
4. `config/metrics.json`에 metric metadata 추가
5. 관련 trace fixture 또는 synthetic JSONL 추가
6. analyzer test 추가

Finding 작성 기준:

- `category`: prompt/tool/graph/context/completion 등 원인 영역
- `metric`: metric registry의 name과 일치
- `severity`: low/medium/high/critical
- `confidence`: 0~1 실수
- `evidence`: trace에서 확인 가능한 근거 문자열
- `expected`: 기대 동작
- `actual`: 실제 관측
- `recommendation`: 수정 방향

### 9.3 Trace adapter 확장

다른 agent runtime trace를 지원하려면 adapter를 추가합니다.

1. `judge_agent/adapters/{name}.py` 생성
2. 외부 event를 `SimpleAgentRun`, `SimpleEvent`로 정규화
3. `analysis/analyzer.py`에서 adapter 선택 로직 확장
4. API request의 `adapter` allow-list 갱신
5. sample trace와 test 추가

주의사항:

- raw event는 가능한 한 보존합니다.
- detector가 필요한 canonical field를 안정적으로 채워야 합니다.
- final output, validation result, tool call/result, graph node/edge, chat event는 우선 정규화 대상입니다.

### 9.4 Conversation mode 개발

현재 mode:

- `deterministic-v2`: LLM 없이 tool 기반으로 응답
- `hybrid`: tool/evidence 기반 context + LLM synthesis
- `graph`: graph runtime 사용, optional LangGraph

개발 순서:

1. `ConversationState` schema 확인
2. `ToolBasedConversationAgent`에서 deterministic behavior 작성/검증
3. LLM synthesis가 필요한 경우 `HybridConversationAgent`에 추가
4. graph orchestration이 필요한 경우 `GraphConversationAgent`에 반영
5. session 저장/복원 test 추가

LLM 기능은 실패해도 deterministic fallback이 가능해야 합니다.

### 9.5 Store를 DB로 교체할 때

현재 `ApiStore` public method를 유지하는 방향으로 DB store를 추가합니다.

유지해야 할 대표 method:

- `ensure()`
- `upsert(kind, item)`
- `get(kind, item_id)`
- `list(kind)`
- `reference_trace_path(run_id)`
- `reference_report_path(run_id)`
- `analysis_json_path(analysis_id)`
- `analysis_report_path(analysis_id)`
- `session_dir()`

단계:

1. file store contract test 작성
2. DB store 구현
3. `api_services.py`의 store 주입 구조 유지
4. migration/export/import 전략 설계
5. frontend DTO 변경 없이 교체

## 10. 테스트와 검증

### Python 테스트

```bash
python -m pytest judgeagent/judge_agent/tests
python -m pytest judgeagent/reference/agent/weblog_agent/tests
```

특정 영역만 실행:

```bash
python -m pytest judgeagent/judge_agent/tests/test_api_services.py
python -m pytest judgeagent/judge_agent/tests/test_conversation_agent.py
python -m pytest judgeagent/reference/agent/weblog_agent/tests/test_tools.py
```

### Frontend build

```bash
cd judgeagent/frontend/app
npm run build
```

### API smoke test

```bash
curl http://localhost:19001/api/health
curl http://localhost:19001/api/reference/fixtures
```

Reference run → analysis → session 흐름:

```bash
RUN_ID=$(curl -s -X POST http://localhost:19001/api/reference/runs \
  -H 'Content-Type: application/json' \
  -d '{"mode":"fixture","fixtureId":"normal-login-error-spike","useLlm":false}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["run"]["id"])')

ANALYSIS_ID=$(curl -s -X POST http://localhost:19001/api/analyses \
  -H 'Content-Type: application/json' \
  -d "{\"source\":{\"kind\":\"reference-run\",\"referenceRunId\":\"$RUN_ID\"},\"adapter\":\"reference-weblog-jsonl\"}" \
  | python -c 'import json,sys; print(json.load(sys.stdin)["analysis"]["id"])')

curl -s -X POST http://localhost:19001/api/judge/sessions \
  -H 'Content-Type: application/json' \
  -d "{\"analysisId\":\"$ANALYSIS_ID\",\"sessionId\":\"dev-session\",\"mode\":\"deterministic-v2\"}"
```

## 11. 품질 기준

개발 PR 또는 커밋 전 최소 기준:

- [ ] backend route/service/model/store 책임이 분리되어 있는가?
- [ ] API response 필드가 frontend DTO와 호환되는가?
- [ ] `ApiError` 형식으로 실패가 반환되는가?
- [ ] 새 detector는 trace 기반 evidence를 포함하는가?
- [ ] artifact path 또는 user input path 처리에 안전성 검토가 되었는가?
- [ ] Python test 또는 API smoke test를 수행했는가?
- [ ] frontend 영향이 있으면 `npm run build`를 수행했는가?
- [ ] `.env`, `.logs`, generated artifacts를 commit하지 않았는가?

## 12. 개발 일정 예시

프로젝트를 제품 수준으로 다듬기 위한 권장 일정입니다. 실제 우선순위에 맞춰 조정 가능합니다.

### Phase 0 — 현행 안정화 (1~2일)

- backend-only 실행 스크립트 정리
- API guide와 frontend API reference의 포트/DTO 불일치 정리
- generated artifact gitignore 보강
- 현재 test suite 기준선 확인

산출물:

- local smoke test 문서화
- 깨진 테스트/known issue 목록

### Phase 1 — API contract 안정화 (3~5일)

- dataclass request parser를 Pydantic 모델로 전환 검토
- response DTO schema 명시
- `API_REFERENCE.md`와 실제 구현 동기화
- frontend client error handling 개선
- OpenAPI schema 확인

산출물:

- API contract test
- endpoint별 success/failure fixture

### Phase 2 — 분석 기능 확장 (1주)

- detector rule 추가/정교화
- metric registry와 finding metric 일치성 검증
- trace adapter 확장 구조 정리
- report JSON/Markdown schema 안정화

산출물:

- detector regression test
- sample drift trace set

### Phase 3 — 대화형 Judge 고도화 (1주)

- deterministic-v2 응답 품질 개선
- hybrid/graph mode fallback 강화
- evidence citation 품질 개선
- session resume/list/delete 정책 설계

산출물:

- conversation scenario test
- LLM unavailable fallback test

### Phase 4 — 운영성 개선 (1~2주)

- background job 모델 도입
- file store race 방지 또는 DB store 도입
- artifact retention/delete 정책
- auth/multi-user boundary 설계
- structured logging/observability 추가

산출물:

- job status API
- DB/file store migration plan
- 운영 runbook

## 13. 우선 개발 백로그

### High

- `API_REFERENCE.md`의 base URL/예시를 실제 `19001` 구현과 동기화
- `.gitignore`에 `.logs/`, `artifacts/frontend-api/` 등 runtime output 보강
- API service test에서 reference-run → analysis → session happy path 보강
- path 입력 검증 강화 (`accessLogPath`, `tracePaths`)

### Medium

- `api_models.py`를 Pydantic으로 전환
- registry write atomic 처리
- frontend API client에서 `VITE_JUDGE_API_BASE_URL` 사용
- CORS origin을 config/env 기반으로 변경

### Low

- HTML report viewer 개선
- artifact cleanup command 추가
- fixture metadata label/description 보강

## 14. 보안과 안전 기준

- secret은 `.env` 또는 환경변수로만 관리합니다.
- API response에 API key, token, raw env를 노출하지 않습니다.
- 사용자 입력 path는 repository/artifact 허용 범위로 제한해야 합니다.
- 외부 LLM 호출은 opt-in으로 유지하고 deterministic fallback을 제공합니다.
- generated artifact와 로그는 원칙적으로 commit하지 않습니다.

## 15. 참고 명령 모음

```bash
# backend dependency
python -m pip install -e '.[api]'

# optional agent dependency
python -m pip install -e '.[api,agent]'

# backend only
./scripts/run-backend.sh

# all services
./start.sh

# stop services
./stop.sh

# backend logs
tail -f .logs/backend.log

# tests
python -m pytest judgeagent/judge_agent/tests
python -m pytest judgeagent/reference/agent/weblog_agent/tests

# frontend build
cd judgeagent/frontend/app && npm run build
```
