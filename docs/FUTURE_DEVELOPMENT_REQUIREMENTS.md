# Judge Agent — 향후 개발 기능 요구사항 명세서

> 작성일: 2026-05-19  
> 기준 버전: 현재 구현 완료된 MVP (v0.3.x)

---

## 1. 현재 구현 완료 기능 요약

| 영역 | 구현 상태 | 주요 내용 |
|------|-----------|-----------|
| Reference Agent 채팅 UI | ✅ 완료 | 대화형 질의, Examples 드롭다운, 모델 선택 드롭다운 |
| Judge Agent 분석 | ✅ 완료 | rule-based 7개 detector, score/gate 산출 |
| Prompt Regression | ✅ 완료 | baseline/candidate 비교, 5가지 regression finding |
| Model Drift 감지 | ✅ 완료 | per-run 모델 지정, model_change_detected finding |
| Prompt 편집 & 히스토리 | ✅ 완료 | 팝업 모달, localStorage 기반 30개 히스토리 |
| 드래그 리사이저 레이아웃 | ✅ 완료 | 좌/우, 상/하 패널 크기 자유 조절 |
| 로컬 LLM 연동 (Ollama) | ✅ 완료 | Ollama, vLLM, LM Studio 등 OpenAI-compatible |
| REST API | ✅ 완료 | 8개 리소스 엔드포인트 (FastAPI) |
| CLI 도구 | ✅ 완료 | analyze, analyze-batch, chat, compare-prompt-regression |
| 파일 기반 저장소 | ✅ 완료 | artifacts/ 디렉터리 + registry.json |

---

## 2. 기능 요구사항 (Feature Requirements)

### 2.1 Phase 1 — 탐지 품질 강화

#### FR-101 Detector 확장
- **요구사항**: 현재 7개 rule-based detector를 확장하여 도구 선택 정확도, 컨텍스트 근거 일관성, 메모리/상태 드리프트를 추가로 감지한다.
- **우선순위**: 높음
- **근거**: full/PRD.md 기준 40+ 드리프트 검사 항목 중 7개만 구현됨

#### FR-102 LLM Judge 강화
- **요구사항**: 현재 deterministic rule 기반 판단에 더해, reference-based LLM judge(기준 run과 비교) 및 reference-free LLM judge(독립 평가)를 지원한다.
- **우선순위**: 높음
- **근거**: simple/ARCHITECTURE.md에 설계되어 있으나 미구현

#### FR-103 메트릭 확장
- **요구사항**: 현재 ~10개 메트릭에서 40개 이상으로 확장한다. 추가 대상: tool_argument_correctness, context_groundedness, memory_retrieval_precision, task_completion_rate 등.
- **우선순위**: 중간
- **근거**: full/PRD.md 70+ 메트릭 비전의 단계적 구현

#### FR-104 Generic LangChain/LangGraph 어댑터
- **요구사항**: 현재 reference-weblog-jsonl 전용 어댑터 외에, 범용 LangChain 트레이스(JSONL/LangSmith 포맷) 파싱 어댑터를 구현한다.
- **우선순위**: 높음
- **근거**: 실제 LangChain 에이전트 프로젝트에 Judge Agent를 직접 적용하기 위해 필수

---

### 2.2 Phase 2 — 사용성 개선

#### FR-201 실행 히스토리 조회 UI
- **요구사항**: 과거 Reference Run 목록을 날짜/fixture/모델별로 필터링하고, 특정 run을 선택해 트레이스와 결과를 다시 확인할 수 있다.
- **우선순위**: 높음
- **근거**: 현재 UI는 가장 최근 run만 표시; 과거 run 재조회 불가

#### FR-202 트레이스 파일 직접 업로드
- **요구사항**: 사용자가 외부에서 생성된 JSONL 트레이스 파일을 UI에서 업로드하면 Judge Agent가 분석한다. (TraceUploadCard 컴포넌트 기존 존재, 백엔드 연결 필요)
- **우선순위**: 중간
- **근거**: TraceUploadCard 컴포넌트가 미연결 상태

#### FR-203 다중 Run 비교 대시보드
- **요구사항**: 2개 run 비교(현재)를 넘어 N개 run을 선택해 메트릭 변화 추이를 차트로 시각화한다.
- **우선순위**: 중간
- **근거**: 프롬프트/모델 반복 실험 시 추세 파악 필요

#### FR-204 분석 결과 내보내기
- **요구사항**: Judge 분석 결과 및 Prompt Regression 리포트를 PDF, CSV, XLSX 형식으로 다운로드한다.
- **우선순위**: 낮음
- **근거**: 보고서 공유 및 외부 시스템 연동 필요

#### FR-205 채팅 세션 히스토리 저장/복원
- **요구사항**: Reference Agent 채팅 대화 내역을 저장하고 추후 동일 세션을 불러와 이어서 대화할 수 있다.
- **우선순위**: 중간
- **근거**: 현재 페이지 새로고침 시 대화 내역 소실

---

### 2.3 Phase 3 — 확장성 & 운영

#### FR-301 DB 기반 저장소
- **요구사항**: 현재 파일 기반(registry.json) 저장소를 SQLite(단독 운영) 또는 PostgreSQL(다중 사용자)로 마이그레이션한다. 동시 요청 안전성 확보.
- **우선순위**: 높음
- **근거**: 현재 동시 요청 시 run_id 충돌 문제 존재 (uuid로 임시 완화)

#### FR-302 Webhook / 알림 연동
- **요구사항**: Regression Score가 임계값 이하로 떨어지거나 gate가 block으로 전환될 때 Slack, GitHub, 이메일 등으로 알림을 전송한다.
- **우선순위**: 중간
- **근거**: CI/CD 파이프라인 자동화 지원

#### FR-303 CI/CD 통합 강화
- **요구사항**: GitHub Actions / GitLab CI 워크플로 템플릿을 제공하여 PR 머지 전 prompt regression을 자동 실행하고 결과를 PR 코멘트로 게시한다.
- **우선순위**: 높음
- **근거**: 현재 `--fail-on-regression` CLI 옵션 있으나 CI 템플릿 미제공

#### FR-304 API 인증 & 접근 제어
- **요구사항**: 현재 인증 없이 노출된 REST API에 API Key 또는 OAuth 2.0 기반 인증을 추가한다.
- **우선순위**: 중간
- **근거**: 팀/조직 단위 배포 시 보안 필수

#### FR-305 실시간 스트리밍 응답
- **요구사항**: Reference Agent 실행 중 LLM이 토큰을 생성할 때마다 채팅 UI에 실시간으로 표시한다. (현재 실행 완료 후 일괄 표시)
- **우선순위**: 중간
- **근거**: 26B 모델 사용 시 응답 대기 시간이 길어 UX 저하

#### FR-306 인간 피드백 루프
- **요구사항**: Judge 분석 결과에 사용자가 동의/반박 피드백을 남기면 detector 임계값 조정에 활용할 수 있도록 수집·저장한다.
- **우선순위**: 낮음
- **근거**: Judge의 정확도 지속 개선을 위한 캘리브레이션 프레임워크 설계 존재

---

## 3. 기능 명세서 (Feature Specifications)

### FS-101 Detector 확장

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-101 |
| 기능명 | Detector 확장 |
| 관련 FR | FR-101 |
| 입력 | SimpleAgentRun (trace 이벤트) |
| 처리 | 신규 rule-based 검사 추가 (도구 인수 오류, 컨텍스트 불일치, 반복 호출 등) |
| 출력 | Finding 목록 (metric, severity, confidence, evidence) |
| 구현 위치 | `judgeagent/judge_agent/analysis/detectors.py` |
| 설정 위치 | `judgeagent/judge_agent/config/detector_rules.json` |
| 추가 detector 항목 | tool_argument_mismatch, repeated_tool_call, context_hallucination, memory_staleness, goal_drift |

### FS-102 Generic LangChain 어댑터

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-102 |
| 기능명 | Generic LangChain/LangGraph 트레이스 어댑터 |
| 관련 FR | FR-104 |
| 입력 | LangChain JSONL 트레이스 또는 LangSmith Export |
| 처리 | 이벤트 정규화 → SimpleAgentRun 변환 |
| 출력 | SimpleAgentRun |
| 구현 위치 | `judgeagent/judge_agent/adapters/langchain.py` (신규) |
| API | `POST /api/analyses` 의 `adapter` 필드에 `langchain-jsonl` 지정 |

### FS-201 실행 히스토리 조회 UI

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-201 |
| 기능명 | Reference Run 히스토리 조회 |
| 관련 FR | FR-201 |
| UI 위치 | 좌측 Reference Agent 패널 상단 탭 또는 사이드바 |
| 필터 조건 | 날짜 범위, fixture ID, 모델명, 실행 상태 |
| 표시 항목 | run ID, 실행 시각, 모델, 상태(SUCCEEDED/FAILED), eventCounts 요약 |
| 액션 | 선택한 run을 Judge / Set baseline 에 재사용 가능 |
| 백엔드 | `GET /api/reference/runs` (기존) + 필터 파라미터 추가 |

### FS-301 DB 기반 저장소

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-301 |
| 기능명 | DB 기반 저장소 마이그레이션 |
| 관련 FR | FR-301 |
| 1단계 | ApiStore → SQLite (파일 1개, 동시성 안전) |
| 2단계 | SQLite → PostgreSQL (다중 사용자) |
| 스키마 | reference_runs, analyses, judge_sessions, prompt_regressions 테이블 |
| 구현 위치 | `judgeagent/backend/api_store.py` 교체 |
| 마이그레이션 | 기존 artifacts/registry.json → DB 임포트 스크립트 제공 |

### FS-303 CI/CD 통합

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-303 |
| 기능명 | GitHub Actions CI/CD 통합 |
| 관련 FR | FR-303 |
| 제공 파일 | `.github/workflows/judge-regression.yml` (템플릿) |
| 트리거 | PR 오픈/업데이트 시 자동 실행 |
| 동작 | baseline 트레이스 로드 → candidate 실행 → `--fail-on-regression` 검사 |
| 출력 | PR 코멘트로 regression 리포트 게시 |

### FS-305 실시간 스트리밍

| 항목 | 내용 |
|------|------|
| 기능 ID | FS-305 |
| 기능명 | LLM 응답 실시간 스트리밍 |
| 관련 FR | FR-305 |
| 프로토콜 | Server-Sent Events (SSE) 또는 WebSocket |
| 백엔드 | `POST /api/reference/runs/stream` (신규) |
| 프론트엔드 | AgentBubble에 실시간 토큰 append |
| LLM 조건 | Ollama, OpenAI API 스트리밍 지원 모델 |

---

## 4. 기능 항목 목록 (Feature Backlog)

### 우선순위 정의
- **P0**: 즉시 필요 (현재 운영 지장)
- **P1**: 높음 (다음 릴리즈 목표)
- **P2**: 중간 (이후 릴리즈)
- **P3**: 낮음 (장기 계획)

| ID | 기능명 | Phase | 우선순위 | 예상 규모 | 담당 영역 |
|----|--------|-------|----------|-----------|-----------|
| F-101 | tool_argument_mismatch detector 추가 | 1 | P1 | S | Backend |
| F-102 | repeated_tool_call detector 추가 | 1 | P1 | S | Backend |
| F-103 | context_hallucination detector 추가 | 1 | P1 | M | Backend |
| F-104 | memory_staleness detector 추가 | 1 | P2 | M | Backend |
| F-105 | goal_drift detector 추가 | 1 | P2 | M | Backend |
| F-106 | reference-based LLM judge 구현 | 1 | P1 | L | Backend |
| F-107 | reference-free LLM judge 구현 | 1 | P2 | L | Backend |
| F-108 | task_completion_rate 메트릭 추가 | 1 | P1 | S | Backend |
| F-109 | tool_argument_correctness 메트릭 추가 | 1 | P1 | S | Backend |
| F-110 | context_groundedness 메트릭 추가 | 1 | P2 | M | Backend |
| F-111 | Generic LangChain JSONL 어댑터 | 1 | P1 | L | Backend |
| F-112 | LangSmith Export 어댑터 | 1 | P2 | L | Backend |
| F-201 | Reference Run 히스토리 조회 UI | 2 | P1 | M | Frontend |
| F-202 | Run 히스토리 필터 (날짜/모델/상태) | 2 | P1 | S | Frontend |
| F-203 | 트레이스 파일 업로드 UI 연결 | 2 | P2 | M | Full-stack |
| F-204 | N개 Run 메트릭 추세 차트 | 2 | P2 | L | Frontend |
| F-205 | 결과 PDF/CSV 내보내기 | 2 | P3 | M | Frontend |
| F-206 | 채팅 세션 히스토리 저장/복원 | 2 | P2 | M | Full-stack |
| F-207 | 다크 모드 UI | 2 | P3 | S | Frontend |
| F-301 | SQLite 기반 저장소 마이그레이션 | 3 | P1 | L | Backend |
| F-302 | PostgreSQL 마이그레이션 | 3 | P2 | L | Backend |
| F-303 | GitHub Actions 워크플로 템플릿 | 3 | P1 | M | DevOps |
| F-304 | GitLab CI 워크플로 템플릿 | 3 | P2 | M | DevOps |
| F-305 | PR 코멘트 regression 리포트 게시 | 3 | P1 | M | DevOps |
| F-306 | API Key 인증 추가 | 3 | P2 | M | Backend |
| F-307 | Slack Webhook 알림 | 3 | P2 | S | Backend |
| F-308 | SSE 기반 LLM 스트리밍 | 3 | P2 | L | Full-stack |
| F-309 | 인간 피드백 루프 | 3 | P3 | XL | Full-stack |
| F-310 | 멀티테넌트 사용자 관리 | 3 | P3 | XL | Full-stack |

### 규모 정의
- **S** (Small): 1~2일
- **M** (Medium): 3~5일
- **L** (Large): 1~2주
- **XL** (Extra Large): 2주 이상

---

## 5. 로드맵 요약

```
2026 Q2 (현재)
├── ✅ MVP 완료: 채팅 UI, Prompt Regression, Model Drift, 로컬 LLM
│
2026 Q3 — Phase 1: 탐지 품질 강화
├── F-101~105: Detector 5개 추가
├── F-106: Reference-based LLM Judge
├── F-108~110: 메트릭 3개 추가
└── F-111: LangChain 어댑터

2026 Q4 — Phase 2: 사용성 개선
├── F-201~202: Run 히스토리 조회 UI
├── F-203: 트레이스 업로드 연결
├── F-206: 채팅 세션 히스토리
└── F-204: N개 Run 추세 차트

2027 Q1 — Phase 3: 운영 강화
├── F-301: SQLite 마이그레이션
├── F-303~305: CI/CD 통합
├── F-307: Slack 알림
└── F-308: 실시간 스트리밍

2027 Q2 이후 — 장기
├── F-302: PostgreSQL
├── F-309: 인간 피드백
└── F-310: 멀티테넌트
```

---

## 6. 참고 문서

| 문서 | 경로 |
|------|------|
| 패키지 구조 README | `judgeagent/README.md` |
| 개발 가이드 | `judgeagent/DEVELOPMENT_GUIDE.md` |
| Prompt Regression 사용 가이드 | `docs/PROMPT_REGRESSION_USAGE_GUIDE.md` |
| Simple MVP PRD | `simple/PRD.md` |
| Full PRD (비전) | `full/PRD.md` |
| Simple 아키텍처 | `simple/ARCHITECTURE.md` |
