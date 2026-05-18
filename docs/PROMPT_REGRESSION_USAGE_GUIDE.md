# Prompt Regression 실행 가이드

이 문서는 Judge Agent frontend에 추가된 Prompt Regression 기능을 사용해 **기준 prompt 실행 결과**와 **변경 prompt 실행 결과**를 비교하는 방법을 설명합니다.

## 1. 기능 개요

Prompt Regression은 같은 fixture/input을 기준으로 baseline run과 candidate run을 비교해 prompt 변경으로 품질이 악화되었는지 판단합니다.

비교 결과는 다음 지표로 요약됩니다.

| 지표 | 의미 |
| --- | --- |
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

### 3.1 Baseline run 생성

1. Frontend에 접속합니다.
2. 왼쪽 `Reference Agent Controls` 패널에서 기준 fixture를 선택합니다.
   - 예: `normal-login-error-spike`
3. Mode를 선택합니다.
   - 안정적인 비교를 위해 처음에는 `Deterministic` 권장
4. `Run Reference Agent` 버튼을 클릭합니다.
5. 실행이 완료되어 status가 `SUCCEEDED`가 되면 `Set baseline` 버튼을 클릭합니다.

이 run이 Prompt Regression의 기준 실행 결과가 됩니다.

### 3.2 Candidate run 생성

1. 같은 패널에서 변경 후 비교할 fixture 또는 prompt drift fixture를 선택합니다.
   - 예: `drift-prompt-output-contract`
   - 예: `drift-validation-skipped`
2. `Run Reference Agent` 버튼을 다시 클릭합니다.
3. 실행이 완료되어 status가 `SUCCEEDED`가 되면 `Compare prompt regression` 버튼을 클릭합니다.

### 3.3 결과 확인

오른쪽 `Judge Agent Metrics` 패널에 Prompt Regression 카드가 표시됩니다.

표시 항목:

| 항목 | 설명 |
| --- | --- |
| Regression Score | prompt 변경 후 악화 정도를 반영한 0~100 점수 |
| Baseline | baseline quality gate / score |
| Candidate | candidate quality gate / score |
| New High/Critical | candidate에서 새로 생긴 high/critical finding 수 |
| REGRESSED/STABLE | 전체 regression 상태 |

Regression finding이 있으면 카드 아래에 상세 finding이 표시됩니다.

## 4. Frontend 사용 예시

### 예시 A — 정상 baseline과 output contract drift 비교

Baseline:

```text
Fixture: normal-login-error-spike
Mode: Deterministic
Action: Run Reference Agent → Set baseline
```

Candidate:

```text
Fixture: drift-prompt-output-contract
Mode: Deterministic
Action: Run Reference Agent → Compare prompt regression
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

### 예시 B — validation path regression 비교

Baseline:

```text
Fixture: normal-login-error-spike
Action: Run Reference Agent → Set baseline
```

Candidate:

```text
Fixture: drift-validation-skipped
Action: Run Reference Agent → Compare prompt regression
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

| Finding | 의미 |
| --- | --- |
| `gate_regression` | candidate gate가 baseline보다 악화됨 |
| `new_high_severity_findings` | candidate에 새 high/critical finding 발생 |
| `prompt_version_regression_score` | 종합 regression score가 기준 이하 |
| `tool_and_output_stability_score` | tool/output/validation 흐름 안정성 하락 |

## 9. 권장 사용 흐름

Prompt를 수정할 때마다 다음 순서로 확인하는 것을 권장합니다.

1. 변경 전 prompt로 baseline fixture suite 실행
2. 변경 후 prompt로 같은 fixture suite 실행
3. Prompt Regression 비교 실행
4. `gate_regression` 또는 새 high/critical finding이 있으면 prompt 변경 보류
5. regression report를 보고 output contract, tool policy, validation instruction 변경점 점검
6. 수정 후 다시 비교

## 10. 주의사항

- baseline과 candidate는 같은 fixture/input 조건으로 비교해야 합니다.
- LLM을 사용하는 Hybrid mode는 비결정성이 있을 수 있으므로, 회귀 검증의 첫 단계는 `Deterministic` mode를 권장합니다.
- 현재 frontend 비교는 “현재 선택된 baseline run”과 “현재 실행 완료된 candidate run”을 비교합니다.
- baseline과 candidate가 같은 run이면 비교하지 않습니다.
- API 결과 artifact는 runtime output이므로 일반적으로 git commit 대상이 아닙니다.
