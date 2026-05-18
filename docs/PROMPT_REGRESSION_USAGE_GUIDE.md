# Prompt Regression & Model Drift 실행 가이드

이 문서는 Judge Agent frontend에 추가된 Prompt Regression / Model Drift 기능을 사용해 **기준 실행 결과**와 **변경 후 실행 결과**를 비교하는 방법을 설명합니다.

## 1. 기능 개요

Prompt Regression은 같은 질의(input)를 기준으로 baseline run과 candidate run을 비교해 **prompt 변경** 또는 **LLM 모델 변경**으로 품질이 악화되었는지 판단합니다.

비교 결과는 다음 지표로 요약됩니다.

| 지표 | 의미 |
| --- | --- |
| `model_change_detected` | baseline과 candidate에 서로 다른 LLM 모델이 사용된 경우 |
| `gate_regression` | candidate 품질 판정이 baseline보다 악화되었는지 |
| `new_high_severity_findings` | candidate에서 새 high/critical finding이 생겼는지 |
| `prompt_version_regression_score` | score/gate/finding 악화를 종합한 0~100 regression score |
| `tool_and_output_stability_score` | tool sequence, validation path, output format, target grounding 안정성 |

품질 판정은 다음 순서로 악화 여부를 판단합니다.

```text
pass < warning < block
```

예:

```text
baseline quality gate: pass
candidate quality gate: block
→ gate_regression 발생
```

## 2. 사전 준비

프로젝트 루트:

```bash
cd ~/workspaces/judge/judge-agent
```

Backend 실행:

```bash
./scripts/run-backend.sh
```

기본 주소:

```text
Backend API: http://localhost:19001
Swagger UI:  http://localhost:19001/docs
```

Frontend 실행:

```bash
cd judgeagent/frontend/app
npm install
npm run dev
```

Frontend 기본 주소는 Vite 출력에 표시됩니다. 일반적으로 다음과 같습니다.

```text
http://localhost:29173
```

필요하면 frontend API base URL을 지정합니다.

```bash
VITE_JUDGE_API_BASE_URL=http://localhost:19001 npm run dev
```

## 3. Frontend에서 Prompt Regression 실행하기

Reference Agent 패널은 채팅 인터페이스로 동작합니다. 질의를 직접 입력하거나 Examples 드롭다운에서 fixture 질의를 자동완성해 사용합니다.

### 3.1 Baseline run 생성

1. Frontend에 접속합니다.
2. 왼쪽 `Reference Agent` 패널 헤더에서 실행 모드를 선택합니다.
   - 안정적인 비교를 위해 처음에는 `Deterministic` 권장
3. 입력창에 분석 질의를 입력하거나 Examples 드롭다운에서 fixture 질의를 선택합니다.
4. Enter 또는 Send 버튼으로 전송합니다.
5. 에이전트 응답이 표시되고 status가 `SUCCEEDED`가 되면 `Set baseline` 버튼을 클릭합니다.

이 run이 Prompt Regression의 기준 실행 결과가 됩니다.

### 3.2 Candidate run 생성 — Prompt 변경

1. 헤더의 `Prompt edit` 버튼을 클릭합니다 (팝업 모달이 열립니다).
2. **Edit 탭**에서 `Load default prompts`를 눌러 현재 기본 prompt를 불러옵니다.
3. `SYSTEM_PROMPT`, `TOOL_POLICY`, `OUTPUT_CONTRACT` 중 변경하고 싶은 영역을 수정합니다.
   - 기본 prompt와 동일한 영역은 override로 전송되지 않습니다.
   - `Clear edits`를 누르면 기본 prompt 실행 상태로 돌아갑니다.
4. Done을 클릭해 모달을 닫으면 수정 내용이 히스토리에 자동 저장됩니다.
5. **Baseline과 동일한 질의**를 입력창에 입력하고 전송합니다.
6. status가 `SUCCEEDED`가 되면 `Compare prompt regression` 버튼을 클릭합니다.

```text
기본 prompt로 baseline 실행 → Set baseline
Prompt edit 팝업에서 수정 → 동일 질의로 candidate 실행
Compare prompt regression
```

### 3.3 Candidate run 생성 — Model 변경

같은 prompt를 유지하면서 LLM 모델만 변경해 행동 차이(model drift)를 확인할 수 있습니다.

1. Baseline run을 Set baseline으로 저장합니다.
2. 헤더의 **Model 입력 필드**에 비교할 모델 ID를 입력합니다.
   - 예: baseline이 `gpt-4o-mini`이면 candidate에 `gpt-4o` 입력
3. **Baseline과 동일한 질의**를 입력하고 전송합니다.
4. status가 `SUCCEEDED`가 되면 `Compare prompt regression` 버튼을 클릭합니다.

### 3.4 결과 확인

오른쪽 `Judge Agent Metrics` 패널에 Regression 카드가 표시됩니다.

| 항목 | 설명 |
| --- | --- |
| **⚠ MODEL CHANGED** 배지 | baseline과 candidate에 다른 모델이 사용된 경우 표시 |
| 모델 변경 경고 박스 | baseline/candidate 모델명 비교 및 경고 메시지 |
| Regression Score | 악화 정도를 반영한 0~100 점수 |
| Baseline | baseline quality gate / score |
| Candidate | candidate quality gate / score |
| New High/Critical | candidate에서 새로 생긴 high/critical finding 수 |
| REGRESSED/STABLE | 전체 regression 상태 |

Regression finding이 있으면 카드 아래에 상세 finding이 표시됩니다. 모델 변경이 감지된 경우 `model_change_detected` finding이 최상단에 추가됩니다.

### 3.5 Prompt History 활용

Prompt edit 모달의 **History 탭**에서 이전에 저장된 prompt 설정을 불러올 수 있습니다.

- 각 히스토리 항목에는 저장 시각, variant 이름, 수정된 필드 태그, system prompt 미리보기가 표시됩니다.
- **Load** 버튼 클릭 시 Edit 탭으로 자동 전환되며 해당 내용이 복원됩니다.
- 히스토리는 브라우저 `localStorage`에 저장되므로 페이지 새로고침 후에도 유지됩니다.

## 4. Frontend 사용 예시

### 예시 A — Output Contract drift 비교 (Prompt 변경)

Baseline:

```text
질의: 지난 1시간 동안 /api/login endpoint에서 5xx 에러율을 분석해주세요.
Mode: Deterministic
Prompt edit: 기본값(편집 없음)
Action: Send → Set baseline
```

Candidate:

```text
질의: (동일)
Mode: Deterministic
Prompt edit: OUTPUT_CONTRACT에서 일부 필수 section 제거 또는 변경
Action: Send → Compare prompt regression
```

예상 결과:

```text
Regression Score: 낮음
Baseline: pass / 100
Candidate: block 또는 warning / 낮은 score
New High/Critical: 1개 이상
Regression findings:
- gate_regression
- new_high_severity_findings
- prompt_version_regression_score
```

### 예시 B — Model Drift 비교 (모델 변경, 동일 Prompt)

Baseline:

```text
질의: 지난 1시간 동안 /api/login endpoint에서 5xx 에러율을 분석해주세요.
Mode: Hybrid (LLM)
Model: (비워둠 — 서버 기본 모델 사용, 예: gpt-4o-mini)
Action: Send → Set baseline
```

Candidate:

```text
질의: (동일)
Mode: Hybrid (LLM)
Model: gpt-4o (헤더 Model 입력 필드에 직접 입력)
Prompt edit: 변경 없음
Action: Send → Compare prompt regression
```

예상 결과:

```text
⚠ MODEL CHANGED 배지 표시
모델 변경 경고 박스: gpt-4o-mini → gpt-4o
Regression findings:
- model_change_detected (medium severity)
- (행동 차이가 있으면) gate_regression, new_high_severity_findings 등 추가
```

### 예시 C — Validation path regression 비교

Baseline:

```text
질의: 지난 1시간 동안 /api/login 5xx 에러율을 분석해주세요.
Mode: Deterministic
Action: Send → Set baseline
```

Candidate:

```text
질의: Examples 드롭다운에서 drift-validation-skipped 선택
Action: Send → Compare prompt regression
```

예상 결과:

```text
Regression findings:
- gate_regression
- new_high_severity_findings
- prompt_version_regression_score
- tool_and_output_stability_score
```

## 5. CLI로 Prompt Regression 실행하기

Frontend 없이 CLI로도 같은 비교를 실행할 수 있습니다.

### 5.1 baseline/candidate trace 생성

```bash
mkdir -p /tmp/judge-prompt-regression/base /tmp/judge-prompt-regression/candidate

python3 -m judgeagent.reference.agent.weblog_agent.cli run-fixture \
  normal-login-error-spike \
  --output-dir /tmp/judge-prompt-regression/base \
  --no-llm

python3 -m judgeagent.reference.agent.weblog_agent.cli run-fixture \
  drift-prompt-output-contract \
  --output-dir /tmp/judge-prompt-regression/candidate \
  --no-llm
```

생성되는 trace 예:

```text
/tmp/judge-prompt-regression/base/normal-login-error-spike.jsonl
/tmp/judge-prompt-regression/candidate/drift-prompt-output-contract.jsonl
```

### 5.2 Prompt Regression 비교 실행

```bash
python3 -m judgeagent.backend.cli compare-prompt-regression \
  --baseline-trace /tmp/judge-prompt-regression/base/normal-login-error-spike.jsonl \
  --candidate-trace /tmp/judge-prompt-regression/candidate/drift-prompt-output-contract.jsonl \
  --output /tmp/judge-prompt-regression/prompt-regression-report.md \
  --json /tmp/judge-prompt-regression/prompt-regression-result.json
```

### 5.3 결과 확인

Markdown report:

```bash
cat /tmp/judge-prompt-regression/prompt-regression-report.md
```

JSON result:

```bash
cat /tmp/judge-prompt-regression/prompt-regression-result.json
```

Regression이 있으면 실패 코드로 종료하게 만들 수도 있습니다.

```bash
python3 -m judgeagent.backend.cli compare-prompt-regression \
  --baseline-trace /tmp/judge-prompt-regression/base/normal-login-error-spike.jsonl \
  --candidate-trace /tmp/judge-prompt-regression/candidate/drift-prompt-output-contract.jsonl \
  --fail-on-regression
```

CI에서 prompt 변경 검증에 사용할 때 유용합니다.

## 6. API로 Prompt Regression 실행하기

Frontend는 내부적으로 다음 API를 호출합니다.

```http
POST /api/prompt-regressions
```

### 6.1 referenceRunId 기반 요청

Frontend 방식과 동일하게, 이미 API를 통해 실행된 reference run id를 비교합니다.

```bash
curl -s -X POST http://localhost:19001/api/prompt-regressions \
  -H 'Content-Type: application/json' \
  -d '{
    "baseline": {
      "referenceRunId": "ref_20260518_141000_normal-login-error-spike"
    },
    "candidate": {
      "referenceRunId": "ref_20260518_141200_drift-prompt-output-contract"
    },
    "adapter": "reference-weblog-jsonl"
  }'
```

### 6.2 tracePath 기반 요청

직접 trace path를 넘길 수도 있습니다.

```bash
curl -s -X POST http://localhost:19001/api/prompt-regressions \
  -H 'Content-Type: application/json' \
  -d '{
    "baseline": {
      "tracePath": "/tmp/judge-prompt-regression/base/normal-login-error-spike.jsonl"
    },
    "candidate": {
      "tracePath": "/tmp/judge-prompt-regression/candidate/drift-prompt-output-contract.jsonl"
    },
    "adapter": "reference-weblog-jsonl"
  }'
```

응답 예시:

```json
{
  "regression": {
    "id": "preg_20260518_141530",
    "status": "succeeded",
    "summary": {
      "baselineGate": "pass",
      "candidateGate": "block",
      "baselineScore": 100,
      "candidateScore": 49,
      "scoreDelta": -51,
      "gateRegressed": true,
      "newHighCriticalFindingCount": 2,
      "regressionScore": 0
    },
    "findings": [
      {
        "metric": "gate_regression",
        "severity": "critical"
      }
    ]
  }
}
```

### 6.3 저장된 Prompt Regression 목록 조회

```bash
curl -s http://localhost:19001/api/prompt-regressions
```

### 6.4 특정 Prompt Regression 상세 조회

```bash
curl -s http://localhost:19001/api/prompt-regressions/preg_20260518_141530
```

## 7. 저장 위치

API로 실행한 prompt regression 결과는 다음 경로에 저장됩니다.

```text
artifacts/frontend-api/prompt-regressions/
├── registry.json
├── reports/*.md
└── results/*.json
```

## 8. 해석 기준

### Regression Score

| 점수 | 의미 |
| ---: | --- |
| 85~100 | 안정적, regression 가능성 낮음 |
| 70~84 | 주의 필요, high 수준 검토 필요 |
| 0~69 | block 수준, prompt 변경 승격 보류 권장 |

### Quality Gate

문서와 UI에서는 `quality gate` 또는 `품질 판정`으로 이해하면 됩니다.

| Gate | 의미 |
| --- | --- |
| `pass` | 중대한 finding 없음 |
| `warning` | high finding 또는 유의미한 점수 하락 |
| `block` | critical finding 또는 큰 품질 악화 |

### 주요 finding

| Finding | severity | 의미 |
| --- | --- | --- |
| `model_change_detected` | medium | baseline과 candidate에 서로 다른 LLM 모델 사용 |
| `gate_regression` | critical/high | candidate gate가 baseline보다 악화됨 |
| `new_high_severity_findings` | critical/high | candidate에 새 high/critical finding 발생 |
| `prompt_version_regression_score` | critical/high | 종합 regression score가 기준 이하 |
| `tool_and_output_stability_score` | high/medium | tool/output/validation 흐름 안정성 하락 |

### API 응답 — 모델 관련 필드

```json
{
  “regression”: {
    “summary”: {
      “baselineModel”: “gpt-4o-mini”,
      “candidateModel”: “gpt-4o”,
      “modelChanged”: true,
      “gateRegressed”: false,
      “regressionScore”: 85
    }
  }
}
```

## 9. 권장 사용 흐름

### Prompt 변경 검증

1. 변경 전 prompt로 baseline 질의 실행 → Set baseline
2. Prompt edit 팝업에서 수정 → 동일 질의 실행
3. Compare prompt regression
4. `gate_regression` 또는 새 high/critical finding이 있으면 prompt 변경 보류
5. regression report를 보고 output contract, tool policy, validation instruction 변경점 점검
6. 수정 후 다시 비교

### Model 변경 검증

1. 현재 모델(Model 입력 비워둠)로 baseline 질의 실행 → Set baseline
2. Model 입력 필드에 비교할 모델 ID 입력 → 동일 질의 실행
3. Compare prompt regression
4. `model_change_detected` finding 확인
5. 추가로 `gate_regression`, `new_high_severity_findings`가 발생했으면 모델 변경이 행동에 영향을 미친 것
6. 영향이 허용 범위 내인지 검토 후 모델 전환 여부 결정

## 10. 주의사항

- baseline과 candidate는 같은 질의(input) 조건으로 비교해야 합니다.
- LLM을 사용하는 Hybrid mode는 비결정성이 있을 수 있으므로, 회귀 검증의 첫 단계는 `Deterministic` mode를 권장합니다.
- `model_change_detected` finding은 모델이 다름을 알리는 것이며, 행동 변화 여부는 gate/score/stability 지표로 판단합니다.
- baseline과 candidate가 같은 run이면 비교하지 않습니다.
- API 결과 artifact는 runtime output이므로 일반적으로 git commit 대상이 아닙니다.
