# Prompt 변경 Regression 평가 지표 구현 계획

## 1. 목적

현재 `prompt_template_version_present`는 trace에 prompt name/version이 남는지 확인하는 **추적 가능성 지표**입니다.

다음 단계는 prompt 변경 전후 같은 fixture/input을 실행했을 때, agent behavior가 나빠졌는지 Judge Agent가 판단할 수 있게 하는 것입니다.

즉, 목표는 다음과 같습니다.

```text
Prompt A 기준 실행 결과
Prompt B 변경 실행 결과
        ↓
동일 fixture/input 기준 before/after 비교
        ↓
score/gate/finding/tool/output 변화로 regression 판정
```

## 2. 구현 대상 지표

### 2.1 `prompt_version_regression_score`

| 항목 | 내용 |
| --- | --- |
| 목적 | prompt 변경 후 전체 품질이 얼마나 악화되었는지 0~100 score로 계산 |
| 입력 | baseline run, candidate run |
| 산출 | regression score, score delta, finding delta summary |
| 실패 기준 | score 하락, gate 악화, high/critical finding 증가 |
| 권장 severity | High |

계산 예시:

```text
regression_penalty =
  score_drop
  + gate_regression_penalty
  + new_high_critical_penalty
  + output_contract_penalty
  + validation_path_penalty

prompt_version_regression_score = max(0, 100 - regression_penalty)
```

### 2.2 `gate_regression`

| 항목 | 내용 |
| --- | --- |
| 목적 | prompt 변경 후 gate가 악화되었는지 확인 |
| 입력 | baseline gate, candidate gate |
| 악화 순서 | pass < warning < block |
| 실패 조건 | `pass → warning/block`, `warning → block` |
| 권장 severity | Critical 또는 High |

### 2.3 `new_high_severity_findings`

| 항목 | 내용 |
| --- | --- |
| 목적 | prompt 변경 후 새 high/critical finding이 생겼는지 확인 |
| 입력 | baseline findings, candidate findings |
| 비교 key | `metric + category + normalized evidence/location` |
| 실패 조건 | candidate에만 존재하는 high/critical finding |
| 권장 severity | High |

### 2.4 `tool_and_output_stability_score`

| 항목 | 내용 |
| --- | --- |
| 목적 | prompt 변경 후 tool sequence와 output structure가 안정적으로 유지되는지 평가 |
| 입력 | baseline trace events, candidate trace events |
| 비교 대상 | tool call sequence, required sections, validation path, target grounding |
| 실패 조건 | 필수 tool 누락, 순서 급변, output contract 실패, target path 불일치 |
| 권장 severity | Medium 또는 High |

## 3. 필요한 trace 수집값

Reference Agent는 이미 일부 prompt metadata를 수집합니다.

현재 수집:

- `instruction_snapshot.prompt_template_name`
- `instruction_snapshot.prompt_template_version`
- `prompt_instruction_metrics.prompt_template`
- `prompt_instruction_metrics.output_format`
- `prompt_instruction_metrics.instruction_adherence`

추가 권장 수집값:

| Event | Field | 목적 |
| --- | --- | --- |
| `instruction_snapshot` | `prompt_template_hash` | version 문자열이 같아도 내용 변경 감지 |
| `instruction_snapshot` | `prompt_sections` | system/tool_policy/output_contract/react_protocol별 변경 추적 |
| `prompt_instruction_metrics` | `prompt_contract_hash` | output contract 변경 감지 |
| `run_start` | `prompt_variant` | A/B 또는 experiment label |
| `run_start` | `evaluation_suite_id` | 어떤 fixture suite 기준인지 기록 |

hash 예시:

```text
prompt_template_hash = sha256(system + react_protocol + tool_policy + output_contract)
prompt_contract_hash = sha256(output_contract)
```

## 4. 데이터 모델 설계

### 4.1 Prompt Run Identity

```python
@dataclass
class PromptRunIdentity:
    run_id: str
    fixture_id: str | None
    prompt_template_name: str
    prompt_template_version: str
    prompt_template_hash: str
    prompt_variant: str | None
    trace_path: str
```

### 4.2 Prompt Regression Pair

```python
@dataclass
class PromptRegressionPair:
    fixture_id: str
    baseline_run_id: str
    candidate_run_id: str
    baseline_analysis_id: str
    candidate_analysis_id: str
```

### 4.3 Prompt Regression Result

```python
@dataclass
class PromptRegressionResult:
    fixture_id: str
    baseline: AnalysisResult
    candidate: AnalysisResult
    metrics: list[Finding]
    score_delta: int
    gate_changed: bool
    gate_regressed: bool
    new_findings: list[Finding]
    resolved_findings: list[Finding]
```

## 5. 구현 위치

### 5.1 Reference Agent

대상 파일:

- `judgeagent/reference/agent/weblog_agent/prompts.py`
- `judgeagent/reference/agent/weblog_agent/graph.py`

작업:

1. prompt hash 계산 함수 추가
2. `instruction_snapshot`에 hash/section metadata 추가
3. `run_start`에 `prompt_variant`, `evaluation_suite_id` optional field 추가

### 5.2 Judge Agent Adapter

대상 파일:

- `judgeagent/judge_agent/adapters/reference.py`
- `judgeagent/judge_agent/core/schema.py`

작업:

1. trace의 prompt metadata를 `SimpleAgentRun.metadata`에 정규화
2. prompt hash/version/name을 analysis result에서 접근 가능하게 유지

### 5.3 Prompt Regression Analyzer 신규 추가

신규 파일 제안:

```text
judgeagent/judge_agent/analysis/prompt_regression.py
```

책임:

- baseline/candidate trace 또는 analysis result 비교
- score/gate/finding/tool/output 차이 계산
- regression finding 생성

주요 함수:

```python
def compare_prompt_runs(
    baseline_trace: str,
    candidate_trace: str,
    adapter_name: str = "reference-weblog-jsonl",
) -> PromptRegressionResult:
    ...
```

```python
def detect_prompt_regressions(
    baseline: AnalysisResult,
    candidate: AnalysisResult,
) -> list[Finding]:
    ...
```

### 5.4 API 추가

대상 파일:

- `judgeagent/backend/api.py`
- `judgeagent/backend/api_models.py`
- `judgeagent/backend/api_services.py`
- `judgeagent/backend/api_store.py`

신규 endpoint 제안:

```http
POST /api/prompt-regressions
GET  /api/prompt-regressions
GET  /api/prompt-regressions/{regression_id}
```

Request 예시:

```json
{
  "baseline": {
    "tracePath": "artifacts/.../baseline.jsonl"
  },
  "candidate": {
    "tracePath": "artifacts/.../candidate.jsonl"
  },
  "adapter": "reference-weblog-jsonl"
}
```

Response 예시:

```json
{
  "regression": {
    "id": "preg_20260518_132700",
    "status": "succeeded",
    "baselineRunId": "ref_baseline",
    "candidateRunId": "ref_candidate",
    "summary": {
      "scoreDelta": -18,
      "baselineGate": "pass",
      "candidateGate": "warning",
      "gateRegressed": true,
      "newHighCriticalFindings": 2
    },
    "findings": []
  }
}
```

## 6. Metric별 판정 로직

### 6.1 Gate regression

```python
GATE_RANK = {"pass": 0, "warning": 1, "block": 2}

def gate_regressed(baseline_gate, candidate_gate):
    return GATE_RANK[candidate_gate] > GATE_RANK[baseline_gate]
```

Finding 생성:

```text
metric: gate_regression
severity: critical if candidate_gate == block else high
category: prompt
evidence:
  - baseline_gate=pass
  - candidate_gate=warning
```

### 6.2 New high severity findings

```python
def finding_key(f):
    return (f.metric, f.category, str(f.location), tuple(f.evidence[:2]))
```

비교:

```python
new = candidate_keys - baseline_keys
new_high = [f for f in candidate.findings if key(f) in new and f.severity in {"high", "critical"}]
```

Finding 생성:

```text
metric: new_high_severity_findings
severity: high 또는 critical
category: prompt
```

### 6.3 Prompt version regression score

권장 penalty:

| 조건 | Penalty |
| --- | ---: |
| candidate score 하락폭 | `max(0, baseline.score - candidate.score)` |
| gate warning regression | 15 |
| gate block regression | 30 |
| 새 high finding | 개당 10 |
| 새 critical finding | 개당 20 |
| output contract regression | 15 |
| validation path regression | 20 |

```python
score = max(0, 100 - penalty)
```

Finding 생성 기준:

```text
score < 85 → warning/high finding
score < 70 → block-level finding
```

### 6.4 Tool and output stability score

비교 대상:

- tool sequence
- required section presence
- validation path presence
- target endpoint consistency

Tool sequence 예시:

```python
def tool_sequence(run):
    return [e["tool"] for e in run.raw_by_type("tool_start")]
```

간단한 안정성 계산:

```text
stability = 1.0
- 0.2 if required tool missing
- 0.2 if validation path disappeared
- 0.2 if output format became non-compliant
- 0.2 if target endpoint mismatch appeared
- 0.1~0.2 for major sequence edit distance
```

## 7. 저장소 설계

`ApiStore`에 prompt regression artifact 경로 추가:

```text
artifacts/frontend-api/prompt-regressions/
├── registry.json
├── reports/*.md
└── results/*.json
```

`ApiStore` method 제안:

```python
def prompt_regression_json_path(self, regression_id: str) -> Path

def prompt_regression_report_path(self, regression_id: str) -> Path
```

## 8. CLI 추가안

`judgeagent/backend/cli.py`에 command 추가:

```bash
python -m judgeagent.backend.cli compare-prompt-regression \
  --baseline-trace path/to/baseline.jsonl \
  --candidate-trace path/to/candidate.jsonl \
  --output prompt-regression-report.md \
  --json prompt-regression.json
```

## 9. 테스트 계획

### 9.1 Unit test

신규 테스트 파일:

```text
judgeagent/judge_agent/tests/test_prompt_regression.py
```

테스트 케이스:

1. baseline pass, candidate pass → regression 없음
2. baseline pass, candidate warning → `gate_regression` 생성
3. candidate에 새 high finding → `new_high_severity_findings` 생성
4. output contract만 깨짐 → `tool_and_output_stability_score` 하락
5. prompt hash/version metadata가 비교 결과에 포함되는지 확인

### 9.2 Fixture 기반 test

사용 가능한 기존 fixture:

- baseline: `normal-login-error-spike`
- candidate: `drift-prompt-output-contract`
- candidate: `drift-validation-skipped`
- candidate: `drift-wrong-endpoint`

예상:

```text
normal-login-error-spike vs drift-prompt-output-contract
→ output contract regression
→ new high/medium prompt findings
→ score 하락

normal-login-error-spike vs drift-validation-skipped
→ gate regression pass → block
→ validation path regression
```

## 10. 구현 순서

### Phase 1 — Trace metadata 보강

1. prompt hash 계산 추가
2. `instruction_snapshot`에 hash/sections 추가
3. adapter에서 metadata 정규화
4. trace emission test 추가

### Phase 2 — 비교 분석 엔진

1. `prompt_regression.py` 생성
2. baseline/candidate analysis 수행
3. score/gate/finding delta 계산
4. 4개 regression metric finding 생성
5. markdown/json reporter 추가

### Phase 3 — CLI/API 연결

1. CLI command 추가
2. API request/response model 추가
3. API service/store 추가
4. frontend 연동을 고려한 DTO 확정

### Phase 4 — 문서/엑셀 갱신

1. `COMBINED_JUDGE_METRICS`에 regression metric 추가
2. `IMPLEMENTED_JUDGE_METRICS` 갱신
3. API reference 갱신
4. 개발 가이드에 prompt regression flow 추가

## 11. 권장 MVP 범위

처음부터 모든 지표를 완벽히 구현하기보다 아래 3개부터 구현하는 것을 권장합니다.

1. `gate_regression`
2. `new_high_severity_findings`
3. `prompt_version_regression_score`

그 다음에 `tool_and_output_stability_score`를 추가하는 순서가 안전합니다.

이유:

- gate/score/finding delta는 이미 Judge Agent 분석 결과만으로 계산 가능
- 별도 복잡한 sequence similarity 없이도 regression 판단 가치가 큼
- tool/output stability는 추가 튜닝이 필요하므로 2차 구현이 적합

## 12. 완료 기준

- [ ] 동일 fixture baseline/candidate 비교가 가능하다.
- [ ] prompt version/hash가 regression report에 표시된다.
- [ ] gate 악화가 `gate_regression`으로 탐지된다.
- [ ] 새 high/critical finding이 `new_high_severity_findings`로 탐지된다.
- [ ] 전체 regression score가 계산된다.
- [ ] CLI 또는 API로 결과를 JSON/Markdown으로 생성할 수 있다.
- [ ] fixture 기반 regression test가 통과한다.
