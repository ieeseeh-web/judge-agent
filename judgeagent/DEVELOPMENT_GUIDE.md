# Judge Agent 개발 가이드

이 문서는 현재 `judgeagent/` 패키지에 구현되어 있는 내용을 기준으로 작성한 개발 가이드입니다. 과거의 `simple/DEVELOPMENT_GUIDE.md`, `full/DEVELOPMENT_GUIDE.md`, `test/agent/DEVELOPMENT_GUIDE.md`에 있던 계획성 문서를 현재 코드 구조에 맞춰 재정리했습니다.

## 1. 현재 목표

Judge Agent는 reference agent의 실행 trace를 읽고 agent drift를 탐지하는 분석/대화형 검증 도구입니다.

현재 구현은 다음 흐름을 중심으로 동작합니다.

1. Reference Weblog Agent가 fixture 또는 custom input을 실행한다.
2. 실행 과정에서 JSONL trace와 Markdown report를 생성한다.
3. Judge Agent가 trace를 `SimpleAgentRun`으로 정규화한다.
4. rule-based detector가 drift finding을 생성한다.
5. score/gate를 계산하고 Markdown/JSON report를 만든다.
6. CLI, FastAPI, React UI에서 분석 결과를 확인하고 후속 질문을 한다.

## 2. 패키지 구조

```text
judgeagent/
├── backend/                    # FastAPI API와 judge-agent-simple CLI
├── frontend/                   # React/Vite UI와 프론트엔드 문서
├── judge_agent/                # Judge Agent 핵심 분석/대화 로직
│   ├── adapters/               # trace adapter
│   ├── analysis/               # analyzer, detectors, reporter
│   ├── config/                 # JSON 설정 파일
│   ├── conversation/           # 대화형 Judge Agent
│   ├── core/                   # schema, config, metrics, session
│   ├── llm/                    # optional LLM client
│   └── tests/                  # Python tests
└── reference/agent/weblog_agent/ # 평가 대상 reference agent
```

## 3. 실행 환경

### Python

- Python 3.9 이상
- 기본 trace 분석은 표준 라이브러리 중심으로 동작
- API 서버는 optional dependency 필요
- hybrid/graph/LLM 관련 기능은 optional dependency와 환경변수 필요

설치 예:

```bash
# 개발 설치
pip install -e .

# API 서버 포함
pip install -e '.[api]'

# LangGraph/LangChain/MCP 계열 optional runtime 포함
pip install -e '.[agent]'
```

### Node.js

Frontend는 Vite + React + TypeScript입니다.

```bash
cd judgeagent/frontend/app
npm install
npm run dev
```

## 4. 로컬 실행

프로젝트 루트에서 실행합니다.

### Backend + Frontend 동시 실행

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

### Frontend만 실행

```bash
cd judgeagent/frontend/app
npm run dev
```

## 5. CLI 사용법

### Reference Weblog Agent 실행

Reference agent는 trace와 report를 생성하는 평가 대상 agent입니다.

```bash
# fixture 목록 확인
python3 -m judgeagent.reference.agent.weblog_agent.cli list-fixtures

# 특정 fixture 실행
python3 -m judgeagent.reference.agent.weblog_agent.cli run-fixture normal-login-error-spike --no-llm

# 모든 fixture 실행
python3 -m judgeagent.reference.agent.weblog_agent.cli run-all --no-llm
```

설치 후 console script:

```bash
weblog-agent run-all --no-llm
```

### Judge Agent 분석

```bash
# 단일 trace 분석
python3 -m judgeagent.backend.cli analyze \
  --trace artifacts/weblog-reference/normal-login-error-spike.jsonl

# Markdown/JSON 출력 저장
python3 -m judgeagent.backend.cli analyze \
  --trace artifacts/weblog-reference/normal-login-error-spike.jsonl \
  --output artifacts/simple-judge/report.md \
  --json artifacts/simple-judge/findings.json

# 여러 trace batch 분석
python3 -m judgeagent.backend.cli analyze-batch \
  --traces 'artifacts/weblog-reference/*.jsonl'
```

설치 후 console script:

```bash
judge-agent-simple analyze --trace artifacts/weblog-reference/normal-login-error-spike.jsonl
```

### 대화형 Judge Agent

```bash
python3 -m judgeagent.backend.cli chat \
  --traces 'artifacts/weblog-reference/*.jsonl' \
  --mode deterministic-v2
```

지원 mode:

- `deterministic` — legacy deterministic chat agent
- `deterministic-v2` — tool 기반 conversation state 사용
- `hybrid` — deterministic tool 결과 + optional LLM synthesis
- `graph` — optional LangGraph runtime, 미설치 시 fallback 가능

대화 명령:

- `/summary` — 전체 요약
- `/findings` — finding 목록/우선순위
- `/runs` — run 목록
- `/compare` — run 비교
- `/exit` 또는 `/quit` — 종료

## 6. API 개발

API 진입점은 `judgeagent/backend/api.py`입니다.

현재 주요 endpoint:

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/health` | API 상태 확인 |
| `GET` | `/api/config` | config snapshot 반환 |
| `GET` | `/api/metrics` | metric 목록 반환 |
| `GET` | `/api/reference/fixtures` | reference fixture 목록 |
| `POST` | `/api/reference/runs` | reference agent 실행 |
| `GET` | `/api/reference/runs` | reference run 목록 |
| `GET` | `/api/reference/runs/{run_id}` | reference run 상세 |
| `GET` | `/api/reference/runs/{run_id}/trace` | trace event pagination |
| `POST` | `/api/analyses` | Judge analysis 생성 |
| `GET` | `/api/analyses` | analysis 목록 |
| `GET` | `/api/analyses/{analysis_id}` | analysis 상세 |
| `POST` | `/api/judge/sessions` | 대화형 judge session 생성 |
| `GET` | `/api/judge/sessions` | session 목록 |
| `GET` | `/api/judge/sessions/{session_id}` | session 상세 |
| `POST` | `/api/judge/sessions/{session_id}/messages` | follow-up message 처리 |

비즈니스 로직은 `judgeagent/backend/api_services.py`에 모여 있고, 파일 저장은 `api_store.py`의 `ApiStore`가 담당합니다.

## 7. 데이터 저장 위치

현재 구현은 database 없이 file-backed store를 사용합니다.

```text
artifacts/
├── weblog-reference/                  # reference CLI 실행 결과
└── frontend-api/
    ├── reference-runs/                # API reference run trace/report
    ├── analyses/                      # 분석 JSON/Markdown report
    └── judge-sessions/                # 대화형 session JSON
```

주의:

- `artifacts/`는 fixture 재현이나 데모용 산출물입니다.
- 대량 실행 시 파일 수가 빠르게 늘어납니다.
- 민감정보를 trace/report에 남기지 않도록 reference agent의 sanitizer 정책을 유지해야 합니다.

## 8. 핵심 schema

현재 core schema는 `judgeagent/judge_agent/core/schema.py`에 dataclass로 정의되어 있습니다.

### SimpleAgentRun

```python
@dataclass
class SimpleAgentRun:
    run_id: str
    framework: str = "reference-weblog"
    architecture: Optional[str] = None
    agent_name: Optional[str] = None
    agent_version: Optional[str] = None
    graph_version: Optional[str] = None
    user_input: Optional[str] = None
    instructions: Dict[str, Any] = field(default_factory=dict)
    components: Dict[str, Any] = field(default_factory=dict)
    events: List[SimpleEvent] = field(default_factory=list)
    raw_events: List[Dict[str, Any]] = field(default_factory=list)
    validation_results: List[Dict[str, Any]] = field(default_factory=list)
    final_output: Optional[str] = None
    artifacts: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
```

### Finding

```python
@dataclass
class Finding:
    id: str
    category: str
    metric: str
    severity: str
    confidence: float
    evidence: List[str]
    expected: str
    actual: str
    recommendation: str
    location: Dict[str, Any] = field(default_factory=dict)
```

### AnalysisResult

`AnalysisResult`는 `run`, `findings`, `score`, `gate`를 묶습니다.

- `score`: 0~100
- `gate`: `pass`, `warning`, `block`

## 9. 분석 파이프라인

구현 위치:

- Adapter: `judgeagent/judge_agent/adapters/reference.py`
- Analyzer: `judgeagent/judge_agent/analysis/analyzer.py`
- Detector: `judgeagent/judge_agent/analysis/detectors.py`
- Reporter: `judgeagent/judge_agent/analysis/reporter.py`

현재 흐름:

```text
JSONL trace path
  -> ReferenceAgentJsonlAdapter
  -> SimpleAgentRun
  -> ReferenceWebLogDetector.detect()
  -> score_findings()
  -> gate_for()
  -> AnalysisResult
  -> Markdown/JSON report
```

현재 detector는 reference weblog trace에 특화되어 있습니다. 범용 LangSmith/LangChain adapter는 아직 현재 코드의 중심 구현이 아니므로 새 기능 개발 시 reference weblog adapter와 schema를 먼저 유지해야 합니다.

## 10. 현재 detector 규칙

`ReferenceWebLogDetector`가 실행하는 rule:

1. `output_contract`
   - final output이 필수 Markdown section을 포함하는지 확인
2. `validation_path`
   - `validate_findings` node와 `validation_result`가 실행됐는지 확인
3. `wrong_endpoint`
   - 사용자 요청 target endpoint와 tool argument/metric path가 일치하는지 확인
4. `parse_error_handling`
   - 높은 parse error 비율을 무시하고 성공 report를 만들었는지 확인
5. `metric_consistency`
   - metric이 실제 tool output에서 나온 값인지 확인
6. `rag_mcp_presence`
   - RAG runbook과 MCP service context 사용 여부 확인
7. `chat_context`
   - chat follow-up 응답이 이전 분석 context에 grounded 되어 있는지 확인

Detector 설정은 `judgeagent/judge_agent/config/detector_rules.json`에 있습니다.

## 11. 설정 파일

`judgeagent/judge_agent/config/` 아래 JSON 파일이 런타임 기본값을 제어합니다.

- `app.json`
  - 기본 adapter, session dir, chat mode, fail threshold, LLM provider
- `conversation.json`
  - severity rank, intent keyword, 기본 chat command, fallback message
- `detector_rules.json`
  - reference weblog detector 규칙과 threshold
- `metrics.json`
  - UI/API에서 노출할 metric 정의
- `llm_profiles.json`
  - LLM provider/model/profile 설정
- `database_tables.md`
  - 향후 DB 전환용 테이블 설계 문서

설정 로딩 코드는 `judgeagent/judge_agent/core/config.py`에 있습니다.

## 12. Reference Agent 개발

Reference agent 구현 위치:

```text
judgeagent/reference/agent/weblog_agent/
```

현재 역할:

- web access log fixture 분석
- ReAct-style trace 생성
- tool/MCP/RAG/LLM event 기록
- deterministic fallback 제공
- fault injection fixture로 drift scenario 생성

주요 event type:

- `run_start`, `run_end`
- `agent_components`
- `instruction_snapshot`
- `react_step`
- `node_start`, `node_end`, `edge_selected`
- `tool_start`, `tool_end`, `tool_error`
- `mcp_start`, `mcp_end`, `mcp_error`
- `llm_start`, `llm_end`, `llm_error`, `llm_skipped`
- `validation_result`
- `final_output`
- `chat_*`

Reference agent를 수정할 때는 detector가 기대하는 event 이름과 field를 깨지 않도록 해야 합니다.

## 13. Frontend 개발

Frontend 위치:

```text
judgeagent/frontend/app/
```

주요 기술:

- React
- TypeScript
- Vite
- Ant Design

주요 파일:

- `src/App.tsx` — 화면 composition과 API orchestration
- `src/api/judgeClient.ts` — backend API 호출 client
- `src/components/ReferenceAgentPanel.tsx` — reference run 실행 UI
- `src/components/FindingsPanel.tsx` — finding 표시
- `src/components/MetricsPanel.tsx` — metric/gate 요약
- `src/components/ReferenceChatView.tsx` — 대화형 judge session UI
- `src/types/judge.ts` — frontend type 정의

Build 확인:

```bash
cd judgeagent/frontend/app
npm run build
```

## 14. LLM 연동

LLM은 필수 dependency가 아닙니다. 기본 분석/detector는 LLM 없이 동작해야 합니다.

LLM 사용 지점:

- Reference agent의 request parsing/report generation 보조
- Judge conversation의 `hybrid`/`graph` mode 응답 synthesis

원칙:

- API key는 `.env` 또는 환경변수로만 주입합니다.
- trace에는 secret을 기록하지 않습니다.
- LLM 미설정 시 deterministic fallback이 동작해야 합니다.
- LLM 관련 실패는 가능하면 trace에 `llm_error` 또는 fallback 근거로 남깁니다.

CLI 옵션 예:

```bash
python3 -m judgeagent.backend.cli chat \
  --mode hybrid \
  --llm-provider openai-compatible \
  --llm-base-url http://localhost:1234/v1 \
  --llm-api-key local-dev-key
```

## 15. 테스트와 검증

현재 환경에서 최소 검증:

```bash
python3 -m compileall -q judgeagent
```

pytest가 설치되어 있다면:

```bash
python3 -m pytest -q judgeagent/judge_agent/tests \
  judgeagent/reference/agent/weblog_agent/tests
```

Frontend 검증:

```bash
cd judgeagent/frontend/app
npm run build
```

PR/커밋 전 권장 smoke test:

```bash
python3 -m judgeagent.reference.agent.weblog_agent.cli run-fixture normal-login-error-spike --no-llm
python3 -m judgeagent.backend.cli analyze --trace artifacts/weblog-reference/normal-login-error-spike.jsonl
python3 -m compileall -q judgeagent
```

## 16. 새 detector 추가 방법

1. `judgeagent/judge_agent/config/detector_rules.json`에 threshold/상수 추가
2. `ReferenceWebLogDetector`에 새 method 추가
3. `detect()`의 `checks` 목록에 method 등록
4. finding에는 다음을 반드시 포함
   - category
   - metric
   - severity
   - confidence
   - evidence
   - expected
   - actual
   - recommendation
5. 관련 fixture 또는 static trace 추가
6. `judgeagent/judge_agent/tests/`에 regression test 추가

Finding ID는 detector 실행 후 `JD-001`, `JD-002` 형태로 재정렬됩니다. 개별 detector method 내부 ID에 의존하지 마세요.

## 17. 새 API 추가 방법

1. 요청/응답 shape가 필요하면 `backend/api_models.py`에 dataclass 또는 validator 추가
2. 실제 동작은 `backend/api_services.py`에 함수로 구현
3. route는 `backend/api.py`에 얇게 추가
4. file-backed 저장이 필요하면 `backend/api_store.py`에 path helper 추가
5. frontend 호출은 `frontend/app/src/api/judgeClient.ts`에 추가
6. frontend type은 `frontend/app/src/types/judge.ts`에 추가

API error는 `ApiError`를 사용해 code/message/details/status_code를 일관되게 반환합니다.

## 18. 새 fixture 추가 방법

1. `reference/agent/weblog_agent/fixtures.py`에 fixture 정의 추가
2. 필요하면 `fixtures/access.log` 또는 별도 log 파일 추가
3. fault injection이 필요하면 graph/agent 실행 경로에 fault 처리 추가
4. `weblog-agent run-fixture <fixture-id> --no-llm`로 trace 생성 확인
5. `judge-agent-simple analyze --trace <trace>`로 기대 finding 확인
6. detector threshold 또는 expected category가 바뀌면 tests와 문서도 갱신

## 19. 개발 원칙

- 현재 구현의 기준 trace format은 `reference-weblog-jsonl`입니다.
- detector는 가능한 한 결정적(rule-based)이어야 합니다.
- LLM은 보조 역할이며, LLM이 없어도 CI/smoke test가 가능해야 합니다.
- final report의 주장은 trace/tool output으로 검증 가능해야 합니다.
- external action, secret, API key는 trace/report에 남기지 않습니다.
- 파일 저장소 기반 구현이므로 path traversal과 임의 파일 읽기/쓰기 위험을 계속 점검해야 합니다.
- frontend/API/schema 변경은 함께 업데이트합니다.

## 20. 현재 한계와 다음 작업 후보

현재 구현 기준 한계:

- adapter는 reference weblog JSONL 중심입니다.
- LangSmith/LangChain/LangGraph 범용 trace adapter는 아직 주요 구현이 아닙니다.
- file-backed store라 동시성/보존 정책/검색 기능이 제한적입니다.
- API path allowlist와 artifact cleanup 정책이 더 강화될 필요가 있습니다.
- pytest dependency가 설치되지 않은 환경에서는 test suite를 바로 실행할 수 없습니다.

다음 작업 후보:

1. `artifacts/` 정리/보존 정책과 `.gitignore` 정책 재검토
2. API trace path allowlist 강화
3. LangSmith export adapter 추가
4. detector별 regression fixture 확장
5. frontend build/CI workflow 추가
6. file-backed store를 SQLite 또는 lightweight DB로 전환
