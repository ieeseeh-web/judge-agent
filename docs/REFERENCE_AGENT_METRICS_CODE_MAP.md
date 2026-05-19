# Reference Agent Metrics 코드 맵

> 대상 프로젝트: `~/workspaces/judge/judge-agent`  
> 대상 구현: `judgeagent/reference/agent/weblog_agent` reference web log agent + 이를 분석하는 `judgeagent/judge_agent` Judge Agent  
> 용어: 사용자 요청의 `matrics`는 코드/설정 표기 기준인 `metrics`로 정리했다.

## 1. 전체 결론

현재 구현은 두 종류의 metrics를 다룬다.

1. **Reference Agent가 수집/계산하는 운영 로그 metrics**  
   `request_count`, `error_rate`, `p95_latency_ms`처럼 웹 로그에서 계산되는 값이다. 이 값들은 reference agent의 report 생성, anomaly 탐지, evidence 작성에 사용된다.
2. **Judge Agent가 분석하는 drift metrics**  
   `validation_path_coverage`, `metric_result_consistency`처럼 trace를 보고 agent 실행이 올바른지 판정하는 지표다. 이 지표들은 finding, score, gate로 이어진다.

중요한 구분은 다음과 같다.

- Judge Agent가 **현재 직접 분석하는 drift metrics**: `ReferenceWebLogDetector.detect()`에 연결된 규칙과 prompt regression 비교 규칙이다.
- Reference Agent가 **데이터는 수집하지만 Judge Agent가 값 자체를 직접 분석하지 않는 metrics**: latency percentile, 4xx/5xx count, anomaly 목록 대부분이다. 다만 final report, validation, evidence의 근거로 간접 활용된다.
- `metrics.json`에는 향후 확장을 위한 metric 정의가 많이 들어있고, 일부는 아직 detector에서 finding을 만들지 않는다.

## 2. Metrics 데이터 흐름

```text
사용자 입력
  -> WebLogAnalysisAgent.run()
  -> ReAct action 실행
     -> parse_user_request
     -> read_log_file
     -> parse_access_log
     -> filter_log_records
     -> compute_log_metrics
     -> detect_log_anomalies
     -> retrieve_runbook / get_service_context / collect_evidence
  -> validate_findings / finalize
  -> TraceLogger JSONL trace 저장
  -> ReferenceAgentJsonlAdapter가 SimpleAgentRun으로 정규화
  -> ReferenceWebLogDetector가 drift metric finding 생성
  -> score_findings / gate_for로 score, gate 생성
```

관련 코드:

| 단계 | 파일/라인 | 역할 |
|---|---:|---|
| 요청 metric 의도 파싱 | `judgeagent/reference/agent/weblog_agent/graph.py:19-33` | user input에서 target path와 requested metrics를 추출 |
| 운영 로그 metric 계산 | `judgeagent/reference/agent/weblog_agent/tools.py:91-110` | request/error/latency/top path/top IP 계산 |
| anomaly metric 판정 | `judgeagent/reference/agent/weblog_agent/tools.py:113-130` | error rate, p95 latency, suspicious IP threshold 판정 |
| metric state 저장 | `judgeagent/reference/agent/weblog_agent/state.py:8-45` | `metrics`, `anomalies`, `evidence` 등을 snapshot에 포함 |
| trace 기록 | `judgeagent/reference/agent/weblog_agent/trace.py:38-68` | tool/node/final/validation 이벤트를 JSONL로 기록 |
| trace 정규화 | `judgeagent/judge_agent/adapters/reference.py:16-121` | raw event를 `SimpleAgentRun`/`SimpleEvent`로 변환 |
| Judge drift 분석 | `judgeagent/judge_agent/analysis/detectors.py:25-230` | detector 규칙이 finding metric 생성 |
| score/gate | `judgeagent/judge_agent/analysis/detectors.py:219-230` | finding severity 기반 score와 gate 계산 |
| registry | `judgeagent/judge_agent/core/metrics.py:8-87` | `metrics.json` metric 정의 로딩/조회/보강 |

## 3. Reference Agent가 수집/계산하는 운영 로그 metrics

### 3.1 요청에서 수집 의도를 파악하는 값

파일: `judgeagent/reference/agent/weblog_agent/graph.py:19-33`

| 값 | 라인 | 수집 방식 | 현재 활용 | Judge 직접 분석 여부 |
|---|---:|---|---|---|
| `rawUserInput` | 28 | 원본 사용자 입력 저장 | trace/run metadata와 report context | 일부 규칙이 사용. `target_endpoint_consistency`가 user input에서 target path 재추출 |
| `targetPath` | 20, 29 | 정규식으로 `/...` path 추출 | `filter_log_records`의 path filter | 직접 분석. tool argument/top_paths와 비교 |
| `requestedMetrics` | 21-30 | `error`, `5xx`, `latency`, `지연` 키워드 기반 | state에 저장되지만 실제 metric 계산 분기에는 제한적으로만 영향 | 직접 분석 안 함 |
| `statusMin`, `statusMax` | 26-32 | 기본값 0~599 | filter 범위 | 직접 분석 안 함 |
| `statusFocus` | 32 | `5xx` 키워드 여부 | state 저장 | 직접 분석 안 함 |

라인 단위 설명:

- `graph.py:19` — `parse_request_text()`가 사용자 자연어 요청을 구조화한다.
- `graph.py:20` — 첫 번째 URL path 형태 문자열을 `targetPath` 후보로 잡는다.
- `graph.py:21-25` — 요청 문구에 따라 `error_rate`, `latency` 의도를 `requestedMetrics`에 추가한다.
- `graph.py:26-33` — status 범위와 5xx focus를 기본 request dict에 담는다.

### 3.2 로그 파싱 단계에서 수집되는 값

파일: `judgeagent/reference/agent/weblog_agent/tools.py:34-63`, `graph.py:330-336`

| 값 | 라인 | 의미 | 현재 활용 | Judge 직접 분석 여부 |
|---|---:|---|---|---|
| `records[]` | `tools.py:35-60` | 파싱된 access log record 배열 | filter/metric 계산의 원천 데이터 | 직접 분석 안 함. trace에서는 tool output redaction으로 raw records 미저장 |
| `timestamp` | `tools.py:51` | UTC ISO timestamp | record 필터 후보 | 직접 분석 안 함 |
| `ip` | `tools.py:52` | client IP | `top_ips`, suspicious IP 계산 | 직접 분석 안 함 |
| `method` | `tools.py:53` | HTTP method | record 보존 | 직접 분석 안 함 |
| `path` | `tools.py:54` | query 제거한 endpoint path | filter, top_paths, endpoint consistency | 일부 직접 분석. `target_endpoint_consistency`가 `top_paths` 확인 |
| `status` | `tools.py:55` | HTTP status code | 4xx/5xx/error count 계산 | 직접 분석 안 함 |
| `latency_ms` | `tools.py:56-57` | log line latency | percentile 계산, latency anomaly | 직접 분석 안 함 |
| `user_agent` | `tools.py:58` | User-Agent | record 보존 | 직접 분석 안 함 |
| `parse_error_count` | `tools.py:63`, `graph.py:334` | 파싱 실패 라인 수 | state.metrics에 보존, parse error handling 분석 | 직접 분석 |
| `total_lines` | `tools.py:63` | 입력 라인 수 | parse error ratio 계산 | 직접 분석 |

라인 단위 설명:

- `tools.py:34-40` — `parse_access_log()`가 JSON 또는 nginx combined log를 파싱한다.
- `tools.py:42-46` — JSON format일 때 JSON decode 실패를 `errors`에 누적한다.
- `tools.py:47-60` — regex match 후 timestamp/path/status/latency 등을 record로 만든다.
- `tools.py:61-63` — 파싱 실패 수와 전체 라인 수를 반환한다.
- `graph.py:330-331` — `parse_error_ignored` fault fixture에서는 의도적으로 잘못된 log line을 주입한다.
- `graph.py:333-336` — parse output을 state에 저장하고 high parse error를 error로 기록한다. fault가 `parse_error_ignored`면 이 차단이 비활성화된다.

### 3.3 `compute_log_metrics`가 계산하는 metrics

파일: `judgeagent/reference/agent/weblog_agent/tools.py:91-110`, 호출부 `graph.py:345-352`

| metric 이름 | 라인 | 계산식/수집 방식 | 현재 Reference Agent 활용 | Judge 직접 분석 여부 |
|---|---:|---|---|---|
| `request_count` | 92, 100 | filtered records 길이 | report, evidence, anomaly denominator | 간접. `metric_result_consistency`가 tool result 존재성/faultInjected만 확인 |
| `4xx_count` | 93, 102 | status 400~499 count | report metric | 직접 분석 안 함 |
| `5xx_count` | 94, 103 | status 500~599 count | report metric | 직접 분석 안 함 |
| `error_count` | 95, 101 | 4xx + 5xx | report metric | 직접 분석 안 함 |
| `error_rate` | 104 | `error_count / request_count`, 4자리 반올림 | anomaly, report, evidence | 값 자체는 직접 분석 안 함. evidence refs에는 포함 |
| `p50_latency_ms` | 105 | latency 50 percentile | report metric | 직접 분석 안 함 |
| `p95_latency_ms` | 106 | latency 95 percentile | latency anomaly, report | 직접 분석 안 함 |
| `p99_latency_ms` | 107 | latency 99 percentile | report metric | 직접 분석 안 함 |
| `top_paths` | 108 | path별 상위 5개 | report, endpoint consistency | 직접 분석. expected target path와 비교 |
| `top_ips` | 109 | IP별 상위 5개 | suspicious IP anomaly | 직접 분석 안 함 |
| `parse_error_count` | `graph.py:350-351` | 이전 parse 단계 값을 metric dict에 병합 | report/validation/finding 근거 | 직접 분석 |
| `faultInjected` | `graph.py:346-348` | metric hallucination fixture에서 삽입 | drift fixture | 직접 분석 |

라인 단위 설명:

- `tools.py:91` — `compute_log_metrics(records, group_by=None, latency_percentiles=None)`는 인자를 받지만 현재 구현은 `group_by`, `latency_percentiles` 값을 실제 분기에는 사용하지 않고 고정 metric set을 계산한다.
- `tools.py:92-95` — request/error count 계열을 산출한다.
- `tools.py:96-99` — latency 배열, top path, top IP를 만든다.
- `tools.py:100-110` — metric dict를 반환한다.
- `graph.py:345-348` — `metric_hallucination` fault에서는 tool 호출 없이 조작된 metric dict를 state에 넣고 `faultInjected=True`를 남긴다.
- `graph.py:349-352` — 정상 경로에서는 tool_start/tool_end로 `compute_log_metrics`를 기록하고 parse error count를 병합한다.

### 3.4 anomaly detection에서 파생되는 metric성 값

파일: `judgeagent/reference/agent/weblog_agent/tools.py:113-130`, 호출부 `graph.py:353-356`

| anomaly type | 관련 metric | 라인 | 조건 | 현재 활용 | Judge 직접 분석 여부 |
|---|---|---:|---|---|---|
| `error_rate_spike` | `error_rate` | 117-123 | warning 0.05 이상, critical 0.10 이상 | report anomalies, validation/evidence 필요성 | 직접 분석 안 함 |
| `latency_spike` | `p95_latency_ms` | 124-126 | p95 latency 1000ms 이상 | report anomalies | 직접 분석 안 함 |
| `suspicious_ip` | `top_ips`, `request_count` | 127-129 | 단일 IP가 50% 초과 | report anomalies | 직접 분석 안 함 |

라인 단위 설명:

- `tools.py:113-116` — threshold 기본값을 정의한다.
- `tools.py:117-123` — error rate가 threshold를 넘으면 severity와 함께 anomaly를 만든다.
- `tools.py:124-126` — p95 latency warning을 anomaly로 만든다.
- `tools.py:127-129` — 상위 IP traffic 비중이 50% 초과인지 본다.
- `graph.py:353-356` — `detect_log_anomalies` tool output을 `state.anomalies`에 저장한다.

### 3.5 validation/evidence에서 metric을 활용하는 코드

| 파일/라인 | 코드가 보는 값 | 의미 | Judge 직접 분석 여부 |
|---|---|---|---|
| `validation.py:4-8` | `state.metrics` | metric이 없으면 `metrics_missing` issue | 간접. validation_result를 통해 `validation_path_coverage`, prompt instruction violation에 영향 |
| `validation.py:8-10` | `state.anomalies`, `state.evidence.logLines` | anomaly가 있는데 evidence가 없으면 issue | 간접 |
| `graph.py:365-368` | `error_rate`, `request_count`, 5xx raw lines | evidence metricRefs 작성 | 직접 분석 안 함 |
| `graph.py:398-406` | validation checks | `validation_result` event 기록 | 직접 분석. validation path 존재 여부와 issues가 detector에서 사용됨 |
| `graph.py:141-195` | output section, metrics presence, validation passed | `prompt_instruction_metrics` event 생성 | 직접 분석 |

## 4. Judge Agent가 현재 직접 분석하는 drift metrics

`judgeagent/judge_agent/analysis/analyzer.py:12-19`에서 trace를 load한 뒤 `ReferenceWebLogDetector().detect(run)`만 호출한다. 따라서 기본 `analyze_trace` 기준으로는 아래 detector metric이 현재 직접 분석 대상이다.

| metric | detector 코드 | 분석하는 값 | finding 조건 | 관련 수집 코드 |
|---|---:|---|---|---|
| `prompt_template_version_present` | `detectors.py:49-70` | prompt template name/version/present | prompt metadata가 없으면 low finding | `graph.py:100-119`, `graph.py:173-181` |
| `output_format_compliance` | `detectors.py:72-91` | `prompt_instruction_metrics.output_format` 또는 final section | output format non-compliant면 medium finding | `graph.py:147-159`, `graph.py:173-185` |
| `instruction_adherence_score` | `detectors.py:94-114` | instruction adherence score/violations | score < 1 또는 violations 존재 시 high finding | `graph.py:160-194` |
| `output_contract_compliance` | `detectors.py:116-124` | final output의 필수 markdown section | final 없음/section 누락 시 critical/high | `validation.py:14-18`, `reporting.py` output |
| `validation_path_coverage` | `detectors.py:125-132` | `node_start`, `validation_result`, skip edge | validate node/result 없거나 skip 시 critical | `graph.py:122-133`, `graph.py:398-406` |
| `target_endpoint_consistency` | `detectors.py:134-152` | user input target vs filter arg/top_paths | 다른 endpoint 사용 시 high | `graph.py:338-343`, `tools.py:108` |
| `parse_error_handling_score` | `detectors.py:154-175` | parse error ratio와 report/validation 반영 | high parse error가 차단/반영되지 않으면 high | `tools.py:63`, `graph.py:330-336` |
| `metric_result_consistency` | `detectors.py:177-187` | metric tool_end 존재, faultInjected 여부 | compute action without tool result 또는 injected metric이면 high | `graph.py:345-352` |
| `rag_context_presence_and_usage` | `detectors.py:189-200` | retrieve_runbook tool_end, final section | retrieval 누락 또는 final 미반영 시 medium | `graph.py:357-360` |
| `mcp_context_presence_and_usage` | `detectors.py:189-202` | MCP tools/call end, final section | MCP context 누락 또는 final 미반영 시 medium | `graph.py:361-364` |
| `chat_context_grounding` | `detectors.py:204-216` | chat trace events | chat context가 last_analysis에 grounded되지 않으면 medium/low | `chat_agent.py`의 `chat_*` trace events |

### 4.1 detector 실행 순서

파일: `judgeagent/judge_agent/analysis/detectors.py:25-42`

- `detect()`는 10개 check method를 순서대로 실행한다.
- 각 check는 `Finding(metric=...)`을 생성한다.
- 마지막에 ID를 `JD-001`부터 다시 부여한다.

### 4.2 score/gate

파일: `judgeagent/judge_agent/analysis/detectors.py:219-230`

- `score_findings()`는 `detector_rules.json`의 severity penalty를 합산해 `100 - penalty`를 계산한다.
- `gate_for()`는 critical finding 또는 block threshold 미만이면 `block`, high finding 또는 warning threshold 미만이면 `warning`, 아니면 `pass`를 반환한다.
- 이 score/gate는 운영 로그 metric 값의 평균/정확도 점수가 아니라 **drift finding severity 기반 품질 게이트**다.

## 5. 현재 수집하지만 Judge Agent가 직접 분석하지 않는 값

아래 값들은 reference agent가 현재 수집하거나 계산하지만, `ReferenceWebLogDetector`가 해당 numeric value 자체를 threshold로 분석하지 않는다.

| 값 | 수집 위치 | 현재 사용처 | 직접 분석하지 않는 이유/향후 용도 |
|---|---|---|---|
| `requestedMetrics` | `graph.py:21-30` | state/report context | 현재 ReAct fallback 순서는 항상 고정 metric set 계산. 향후 요청 metric coverage 분석 가능 |
| `statusMin`, `statusMax`, `statusFocus` | `graph.py:26-32` | filter args | status focus가 실제 metric/report에 반영됐는지 분석 가능 |
| `4xx_count`, `5xx_count`, `error_count` | `tools.py:93-103` | report key metrics | final output consistency, hallucination detection 확장에 필요 |
| `error_rate` numeric value | `tools.py:104` | anomaly/evidence/report | 현재 Judge는 값 threshold를 직접 평가하지 않고 tool result grounding만 봄 |
| `p50_latency_ms`, `p95_latency_ms`, `p99_latency_ms` | `tools.py:105-107` | latency report/anomaly | latency SLO drift, report claim consistency 확장에 필요 |
| `top_ips` | `tools.py:98-109` | suspicious IP anomaly | suspicious actor 분석/grounding 확장에 필요 |
| `anomalies[]` 내용 | `tools.py:113-130` | report/validation | 현재는 evidence 존재 여부만 validation에서 간접 확인 |
| `baseline` | `state.py:15`, `tools.py:113-119` | baseline error_rate expected 후보 | baseline 로딩 구현이 아직 약해 향후 baseline drift 비교에 사용 가능 |
| `llm_end.usage` | `graph.py:255` | trace에 기록 | token/cost metric 분석은 현재 없음 |
| `llm_end.latency_ms` | `graph.py:255` | trace에 기록 | LLM latency metric 분석은 현재 없음 |
| `group_by`, `latency_percentiles` args | `graph.py:349`, `tools.py:91` | tool argument로 전달 | 현재 계산 로직은 고정 percentile만 반환. 향후 dynamic grouping/percentile 분석 가능 |

## 6. `metrics.json` registry 기준 구현 상태

파일: `judgeagent/judge_agent/config/metrics.json`, 로딩 코드: `judgeagent/judge_agent/core/metrics.py:22-43`

### 6.1 기본 analyze_trace에서 현재 finding 생성 가능

| metric | 상태 | 근거 |
|---|---|---|
| `output_contract_compliance` | 현재 분석 | `detectors.py:116-124` |
| `target_endpoint_consistency` | 현재 분석 | `detectors.py:134-152` |
| `metric_result_consistency` | 현재 분석 | `detectors.py:177-187` |
| `validation_path_coverage` | 현재 분석 | `detectors.py:125-132` |
| `parse_error_handling_score` | 현재 분석 | `detectors.py:154-175` |
| `rag_context_presence_and_usage` | 현재 분석 | `detectors.py:189-200` |
| `mcp_context_presence_and_usage` | 현재 분석 | `detectors.py:189-202` |
| `chat_context_grounding` | 현재 분석 | `detectors.py:204-216` |
| `output_format_compliance` | 현재 분석 | `detectors.py:72-91` |
| `prompt_template_version_present` | 현재 분석 | `detectors.py:49-70` |
| `instruction_adherence_score` | 현재 분석 | `detectors.py:94-114` |

### 6.2 별도 prompt regression flow에서 현재 분석 가능

파일: `judgeagent/judge_agent/analysis/prompt_regression.py:107-216`

| metric | 상태 | 근거 |
|---|---|---|
| `gate_regression` | 별도 비교 flow에서 분석 | baseline/candidate gate 악화 시 finding, `prompt_regression.py:107-124` |
| `new_high_severity_findings` | 별도 비교 flow에서 분석 | candidate에 새 high/critical finding 발생 시, `prompt_regression.py:126-137` |
| `prompt_version_regression_score` | 별도 비교 flow에서 분석 | score delta, gate, new findings penalty로 regression score 계산, `prompt_regression.py:140-160` |
| `tool_and_output_stability_score` | 별도 비교 flow에서 분석 | tool sequence, validation path, target endpoint, output compliance 안정성, `prompt_regression.py:162-196` |

### 6.3 정의되어 있지만 현재 Judge detector에서 직접 finding을 만들지 않는 metrics

아래 metric들은 `metrics.json`에는 정의되어 있고, 향후 분석을 위해 이름/카테고리/측정방식이 준비되어 있지만 현재 기본 detector 또는 prompt regression finding 생성 코드에 직접 연결되지 않았다.

| metric | registry 목적 | 현재 상태 |
|---|---|---|
| `tool_argument_correctness` | tool argument schema/context correctness | 미구현. target endpoint 일부만 별도 metric으로 분석 |
| `tool_error_handling_score` | tool error 처리 적절성 | 미구현. `tool_error` event는 normalize되지만 detector 없음 |
| `answer_context_groundedness` | final output과 retrieved context grounding | 미구현. RAG 존재/section만 확인 |
| `node_sequence_correctness` | 기대 workflow node 순서 | 미구현. validation path만 확인 |
| `verification_coverage` | 완료 전 검증 수행 범위 | 미구현. validation path/output contract 일부만 확인 |
| `redundant_tool_call_count` | 중복 tool 호출 횟수 | 미구현 |
| `missing_required_context` | 필요한 context 누락 | 미구현. RAG/MCP 존재 여부만 확인 |
| `retrieval_context_precision` | retrieved chunk precision | 미구현 |
| `retrieval_context_relevance` | retriever relevance | 미구현 |
| `final_answer_consistency` | final answer와 trace 실행 결과 일치 | 미구현. metric_result_consistency가 일부 대체 |
| `hallucinated_completion_claim` | 수행하지 않은 작업 완료 주장 | 미구현 |
| `task_completion_score` | 사용자 요청 완료도 | 미구현 |
| `edge_decision_correctness` | conditional edge 선택 정확성 | 미구현 |
| `graph_completion_path_valid` | 정상 종료 path 여부 | 미구현 |
| `node_loop_count` | node 반복 횟수 | 미구현 |
| `required_checkpoint_present` | checkpoint/state snapshot 존재 | 미구현 |
| `memory_claim_supported` | memory claim grounding | 미구현 |
| `memory_update_correctness` | memory 저장 정확성 | 미구현 |
| `state_freshness_score` | state/checkpoint 최신성 | 미구현 |
| `state_value_grounding` | state 값이 이전 event에서 근거를 갖는지 | 미구현 |
| `action_grounding_score` | ReAct action argument grounding | 미구현 |
| `observation_utilization_score` | observation이 다음 reasoning/report에 반영되는지 | 미구현 |
| `react_step_completeness` | Thought/Action/Observation sequence 완전성 | 미구현 |
| `tool_result_grounding_score` | final output과 tool result 일치 | 미구현. 향후 `metric_result_consistency` 일반화 후보 |
| `tool_selection_accuracy` | task에 맞는 tool 선택 | 미구현 |

## 7. line-by-line 코드 상세

### 7.1 `tools.py` — 로그 metric 수집/계산

| 라인 | 코드 요소 | 상세 |
|---:|---|---|
| 11-14 | `LOG_RE` | nginx combined log + 마지막 latency 숫자를 파싱하는 정규식. latency 수집의 시작점 |
| 17-28 | `read_log_file` | file 존재 확인, 최대 line 수 제한, truncation flag 반환 |
| 34-63 | `parse_access_log` | raw line을 structured record로 변환하고 `parse_error_count`, `total_lines` 반환 |
| 66-80 | `filter_log_records` | timestamp/path/status 조건으로 records 필터링 |
| 83-89 | `_percentile` | p50/p95/p99 계산용 percentile helper |
| 91-110 | `compute_log_metrics` | request/error/latency/top path/top IP metric dict 생성 |
| 113-130 | `detect_log_anomalies` | error rate, p95 latency, IP concentration 기반 anomaly 생성 |

### 7.2 `graph.py` — metric 수집 orchestration과 trace emission

| 라인 | 코드 요소 | 상세 |
|---:|---|---|
| 19-33 | `parse_request_text` | user input에서 target path/requested metric/status focus 추출 |
| 87-139 | `run` | run_start, instruction_snapshot, graph node/edge, final_output, run_end를 emit |
| 141-195 | `_emit_prompt_instruction_metrics` | prompt metadata, output format compliance, instruction adherence score 수집 |
| 206-216 | `_tool` | tool_start/tool_end/tool_error를 trace에 남기며 큰 `lines`, `records` output은 trace에서 제외 |
| 244-259 | `_llm_call` | LLM output, usage, latency_ms를 trace에 기록. 현재 Judge metric으로는 미분석 |
| 297-317 | `_fallback_action` | deterministic ReAct 순서. metric 계산 전후 조건을 결정 |
| 330-336 | `parse_access_log` action | parse error count를 `state.metrics`에 저장하고 high parse error를 state error로 반영 |
| 338-343 | `filter_log_records` action | fault 시 wrong endpoint를 주입해 `target_endpoint_consistency` 분석을 가능하게 함 |
| 345-352 | `compute_log_metrics` action | 정상 metric 계산 또는 `metric_hallucination` fault 주입 |
| 353-356 | `detect_log_anomalies` action | anomaly 목록 저장 |
| 365-368 | `collect_evidence` action | 5xx raw line과 `error_rate`, `request_count` metric reference 저장 |
| 398-406 | validation/finalize | validation_result event를 emit해 Judge가 validation path를 확인 가능하게 함 |

### 7.3 `state.py` / `validation.py` — metric state와 품질 검증

| 파일/라인 | 코드 요소 | 상세 |
|---|---|---|
| `state.py:8-23` | `WebLogAnalysisState` fields | `metrics`, `baseline`, `anomalies`, `evidence`, `ragContext`, `mcpContext`, `validation` 보관 |
| `state.py:25-45` | `snapshot()` | node_start/node_end trace에 들어갈 state summary 생성. metrics는 그대로 포함 |
| `validation.py:4-18` | `validate_state` | metrics missing, anomaly evidence missing, RAG/MCP missing, output section missing 등을 issue로 반환 |

### 7.4 `trace.py` / `adapters/reference.py` — 수집 데이터가 Judge 분석 입력이 되는 경계

| 파일/라인 | 코드 요소 | 상세 |
|---|---|---|
| `trace.py:38-48` | `emit` | 모든 event에 `type`, `run_id`, `timestamp`와 payload를 넣고 secret redaction 후 JSONL 저장 |
| `trace.py:50-68` | node/tool helpers | graph node, tool call/result/error event를 표준 형태로 기록 |
| `adapters/reference.py:16-27` | `load` | JSONL trace를 읽어 `SimpleAgentRun` 생성 |
| `adapters/reference.py:41-95` | `_apply_raw_event` | run metadata, instructions, prompt metrics, components, validation, final output 추출 |
| `adapters/reference.py:97-121` | `_normalize_event` | LLM/tool/MCP/node/edge/react/validation/prompt/chat/final events를 공통 `SimpleEvent`로 변환 |

### 7.5 `detectors.py` — Judge Agent metric finding 생성

| 라인 | 함수 | metric | 상세 |
|---:|---|---|---|
| 49-70 | `prompt_template_version` | `prompt_template_version_present` | prompt name/version/present 누락 여부 |
| 72-91 | `output_format_compliance` | `output_format_compliance` | reference agent가 수집한 output format compliance 확인 |
| 94-114 | `instruction_adherence` | `instruction_adherence_score` | adherence score/violations 확인 |
| 116-124 | `output_contract` | `output_contract_compliance` | final output 존재와 required markdown sections 확인 |
| 125-132 | `validation_path` | `validation_path_coverage` | validate node/result/skip edge 확인 |
| 134-152 | `wrong_endpoint` | `target_endpoint_consistency` | target path와 filter arg/top_paths 비교 |
| 154-175 | `parse_error_handling` | `parse_error_handling_score` | high parse error ratio와 report/validation 반영 확인 |
| 177-187 | `metric_consistency` | `metric_result_consistency` | compute action의 tool result 존재, injected metric flag 확인 |
| 189-202 | `rag_mcp_presence` | `rag_context_presence_and_usage`, `mcp_context_presence_and_usage` | RAG/MCP call 및 final section 존재 확인 |
| 204-216 | `chat_context` | `chat_context_grounding` | chat response가 analysis context에 grounded 되었는지 확인 |
| 219-230 | `score_findings`, `gate_for` | score/gate | severity penalty와 gate threshold 적용 |

## 8. 향후 분석 확장 후보

현재 trace에는 이미 있지만 Judge가 미활용하는 데이터가 많다. 우선순위는 다음이 좋아 보인다.

1. **`tool_result_grounding_score` / `final_answer_consistency`**  
   `compute_log_metrics` output과 final report의 숫자 claim을 비교하면 hallucinated metric을 더 일반적으로 잡을 수 있다.
2. **`tool_error_handling_score`**  
   `tool_error` event가 이미 있으므로 error 발생 후 retry/stop/report 반영 여부를 분석할 수 있다.
3. **`node_sequence_correctness` / `graph_completion_path_valid`**  
   `node_start`, `edge_selected`가 이미 trace에 있으므로 full workflow path 검증으로 확장 가능하다.
4. **LLM usage/latency metrics**  
   `llm_end.usage`, `llm_end.latency_ms`가 trace에 있으므로 cost/latency/SLO metric을 추가할 수 있다.
5. **retrieval quality metrics**  
   RAG 문서가 `state.ragContext`에 남으므로 precision/relevance judge를 붙일 수 있다.


## 10. API/UI에서 metrics를 노출하는 코드

운영 로그 metric 계산과 Judge finding 생성 외에, 현재 구현은 metric registry와 분석 결과를 API/UI에 노출한다. 이 코드는 metric을 새로 계산하지는 않지만, 수집·분석된 metric 데이터를 사용자가 확인하는 경로라 함께 관리해야 한다.

| 영역 | 파일/라인 | 역할 | 분석 여부 |
|---|---:|---|---|
| API config summary | `judgeagent/backend/api_services.py:75-87` | `list_metrics()` count를 `/api/config` 응답에 포함 | 분석 아님. registry 노출 |
| API metric registry | `judgeagent/backend/api_services.py:90-91` | `metrics.json`의 전체 metric spec을 `metric.to_dict()`로 반환 | 분석 아님. 정의 노출 |
| HTTP endpoint | `judgeagent/backend/api.py:85-87` | `GET /api/metrics`가 `metric_list()` 호출 | 분석 아님. API 전달 |
| UI finding 표시 | `judgeagent/frontend/app/src/components/MetricsPanel.tsx:36-82` | finding metric/severity/confidence/evidence 표시 | 분석 아님. 결과 렌더링 |
| UI gate/severity summary | `judgeagent/frontend/app/src/components/MetricsPanel.tsx:146-178` | gate, severity count, total findings 표시 | 분석 아님. 결과 렌더링 |
| UI prompt regression summary | `judgeagent/frontend/app/src/components/MetricsPanel.tsx:85-124` | prompt regression score/gate/new high findings 표시 | 분석 아님. 결과 렌더링 |

라인 단위 설명:

- `api_services.py:21` — `judge_agent.core.metrics.list_metrics`를 import한다.
- `api_services.py:75-87` — config snapshot에 metric registry 개수를 넣는다. 현재 metric 개수는 `metrics.json` 기준 40개다.
- `api_services.py:90-91` — `/api/metrics`용 payload로 registry 전체를 반환한다. 여기서 반환되는 metric은 “정의”이며, run별 측정값이 아니다.
- `api.py:85-87` — FastAPI route `GET /api/metrics`를 등록한다.
- `MetricsPanel.tsx:36-82` — Judge가 생성한 `Finding.metric`, `severity`, `confidence`, `evidence`, `expected`, `actual`, `recommendation`을 화면에 표시한다.
- `MetricsPanel.tsx:85-124` — prompt regression flow 결과의 `regressionScore`, baseline/candidate gate/score, new high/critical finding count를 표시한다.
- `MetricsPanel.tsx:146-178` — analysis summary의 gate/severity/finding count를 metric panel 상단 카드로 표시한다.

## 10. 빠른 참조: 현재 분석/미분석 구분

### 현재 분석 중

- prompt metadata: `prompt_template_version_present`
- prompt/output: `output_format_compliance`, `instruction_adherence_score`, `output_contract_compliance`
- graph/validation: `validation_path_coverage`
- tool/metric grounding: `target_endpoint_consistency`, `parse_error_handling_score`, `metric_result_consistency`
- context: `rag_context_presence_and_usage`, `mcp_context_presence_and_usage`, `chat_context_grounding`
- prompt regression 별도 flow: `gate_regression`, `new_high_severity_findings`, `prompt_version_regression_score`, `tool_and_output_stability_score`

### 현재 수집하지만 직접 분석하지 않음

- `requestedMetrics`, `statusFocus`
- `4xx_count`, `5xx_count`, `error_count`, `error_rate` numeric threshold 자체
- `p50_latency_ms`, `p95_latency_ms`, `p99_latency_ms`
- `top_ips`, suspicious IP anomaly의 세부값
- `llm_end.usage`, `llm_end.latency_ms`
- baseline 대비 metric 변화
- retrieval precision/relevance, final answer 전체 numeric consistency

