# 실제 구현 기준 Judge Metrics 지표

> 기준: `judgeagent/judge_agent/analysis/detectors.py`에서 실제로 `Finding.metric`으로 생성되는 지표만 정리합니다.  
> `docs/DRIFT_METRICS.xlsx`와 `judgeagent/judge_agent/config/metrics.json`에는 설계/후보 지표가 더 많이 포함되어 있지만, 이 문서는 현재 코드가 실제 trace 값을 읽어 판단하는 구현 지표만 다룹니다.

## 1. 요약

현재 구현된 detector는 `ReferenceWebLogDetector` 하나이며, Reference Web Log Agent JSONL trace를 대상으로 다음 8개 metric을 실제 finding으로 생성합니다.

| No | 구현 metric | 기본 severity | 판단 영역 | detector method |
| --- | --- | --- | --- | --- |
| 1 | `output_contract_compliance` | critical 또는 high | Final Output / Prompt Contract | `output_contract()` |
| 2 | `validation_path_coverage` | critical | LangGraph Flow / Validation | `validation_path()` |
| 3 | `target_endpoint_consistency` | high | Tool Use / Argument Grounding | `wrong_endpoint()` |
| 4 | `parse_error_handling_score` | high | Tool Use / Error Handling | `parse_error_handling()` |
| 5 | `metric_result_consistency` | high | Metric / Completion Consistency | `metric_consistency()` |
| 6 | `rag_context_presence_and_usage` | medium | RAG Context | `rag_mcp_presence()` |
| 7 | `mcp_context_presence_and_usage` | medium | MCP Context | `rag_mcp_presence()` |
| 8 | `chat_context_grounding` | medium 또는 low | Conversational Context | `chat_context()` |

## 2. 구현 기준 상세 지표

### 2.1 `output_contract_compliance`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | 최종 응답이 요구된 Markdown output contract를 지켰는지 확인 |
| 수집 trace/event | `final_output` event |
| 수집 필드 | `final_output.content`, 내부적으로 `run.final_output`에 저장 |
| 설정값 | `detector_rules.json > reference_weblog.required_output_sections` |
| 필수 섹션 | `Summary`, `Key Metrics`, `Anomalies`, `Evidence`, `RAG Context`, `MCP Context`, `Recommended Actions`, `Confidence & Limitations` |
| 실패 조건 A | `final_output`이 없거나 비어 있음 |
| 실패 severity A | `critical` |
| 실패 조건 B | 필수 `## section` 중 하나 이상 누락 |
| 실패 severity B | `high` |
| confidence | `0.95` |
| 대표 evidence | `final_output event is missing or empty`, `Missing sections: ...` |
| 권장 조치 | finalization 전에 output contract validation을 수행하고, 누락 섹션이 있으면 완료를 막음 |

### 2.2 `validation_path_coverage`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | 최종 산출 전 validation graph path가 실행되었는지 확인 |
| 수집 trace/event | `node_start`, `validation_result`, `edge_selected` |
| 수집 필드 | `node_start.node`, `validation_result`, `edge_selected.reason` |
| 설정값 | `expected_validation_node=validate_findings`, `validation_skip_reason=fault_validation_skipped` |
| 통과 조건 | `validate_findings` node가 실행되고, `validation_result`가 있으며, validation skip edge가 없어야 함 |
| 실패 조건 | validation node 누락, validation result 누락, 또는 skip reason 감지 |
| 실패 severity | `critical` |
| confidence | `0.98` |
| 대표 evidence | `node_start sequence=[...]`, `validation_result_count=0`, `validation_skipped_edge=True` |
| 권장 조치 | validation edge를 복구하고 validation 없이는 final output을 생성하지 않도록 gate 처리 |

### 2.3 `target_endpoint_consistency`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | 사용자 요청에서 파싱한 target endpoint와 tool argument/metric path가 일치하는지 확인 |
| 수집 trace/event | `run_start` 또는 `chat_turn_start`, `tool_start`, `tool_end` |
| 수집 필드 | `user_input`, `tool_start.arguments.path_pattern`, `tool_end.output.top_paths[].path` |
| target 추출 | `target_path_regex=(/[A-Za-z0-9_./-]+)` |
| 대상 tool | `filter_log_records`, `compute_log_metrics` |
| 실패 조건 A | `filter_log_records.path_pattern`이 사용자 요청의 target path와 다름 |
| 실패 조건 B | `compute_log_metrics` 결과의 `top_paths[].path`가 target path와 다름 |
| 실패 severity | `high` |
| confidence | `0.96` |
| 대표 evidence | `filter_log_records.path_pattern=/wrong, expected=/api/login`, `metrics.top_paths contains /wrong, expected /api/login` |
| 권장 조치 | user input parsing 결과를 tool argument 생성 단계에 고정하고 argument validation 추가 |

### 2.4 `parse_error_handling_score`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | access log parsing 실패율이 높을 때 정상 분석처럼 진행하지 않는지 확인 |
| 수집 trace/event | `tool_end` for `parse_access_log`, `final_output`, `validation_result` |
| 수집 필드 | `tool_end.output.parse_error_count`, `tool_end.output.total_lines`, `final_output.content`, `validation_result.issues` |
| 설정값 | `parse_error_ratio_threshold=0.5` |
| 실패 조건 | `parse_error_count / total_lines > 0.5` |
| 보조 판단 | final output 또는 validation issues에 `parse` 언급이 있는지 확인 |
| 실패 severity | `high` |
| confidence | `0.94` |
| 대표 evidence | `parse_error_count=80, total_lines=100`, `high_parse_error_events=1`, `reflected_in_report_or_validation=False` |
| 권장 조치 | 높은 parse error ratio를 validation failure로 취급하고 confident final report 생성을 막음 |

### 2.5 `metric_result_consistency`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | metric claim이 검증 가능한 tool output에서 왔는지 확인 |
| 수집 trace/event | `react_step`, `tool_end`, `node_start`, `node_end` |
| 수집 필드 | `react_step.action`, `tool_end.tool`, `node_start.state_before.metrics`, `node_end.state_after.metrics` |
| 대상 tool | `compute_log_metrics` |
| 실패 조건 A | `react_step.action=compute_log_metrics`는 있는데 `tool_end(compute_log_metrics)`가 없음 |
| 실패 조건 B | graph state metrics에 `faultInjected=true`가 있음 |
| 실패 severity | `high` |
| confidence | 조건 A: `0.90`, 조건 B: `0.98` |
| 대표 evidence | `react_step selected compute_log_metrics but no tool_end(compute_log_metrics) event exists.`, `faultInjected metrics observed in node ...` |
| 권장 조치 | metric 계산은 반드시 tool output으로 기록하고, final claim은 tool output과 비교 검증 |

### 2.6 `rag_context_presence_and_usage`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | RAG runbook retrieval이 수행되고 final report에 반영되었는지 확인 |
| 수집 trace/event | `tool_end`, `final_output` |
| 수집 필드 | `tool_end.tool`, `final_output.content` |
| 대상 tool | `retrieve_runbook` |
| 실패 조건 A | `tool_end(retrieve_runbook)` event가 없음 |
| 실패 조건 B | retrieval은 있었지만 final report에 `## RAG Context` 섹션이 없음 |
| 실패 severity | `medium` |
| confidence | 조건 A: `0.85`, 조건 B: `0.80` |
| 대표 evidence | `No tool_end(retrieve_runbook) event found.`, `RAG retrieved but final report lacks RAG Context section.` |
| 권장 조치 | final report 전 runbook retrieval을 호출하고 RAG Context 섹션을 output contract에 유지 |

### 2.7 `mcp_context_presence_and_usage`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | MCP service context가 수집되고 final report에 반영되었는지 확인 |
| 수집 trace/event | `mcp_end`, `final_output` |
| 수집 필드 | `mcp_end.method`, `final_output.content` |
| 설정값 | `mcp_tools_call_method=tools/call` |
| 실패 조건 A | `mcp_end` event 중 `method=tools/call`이 없음 |
| 실패 조건 B | MCP context fetch는 있었지만 final report에 `## MCP Context` 섹션이 없음 |
| 실패 severity | `medium` |
| confidence | 조건 A: `0.85`, 조건 B: `0.80` |
| 대표 evidence | `No mcp_end tools/call event found.`, `MCP context fetched but final report lacks MCP Context section.` |
| 권장 조치 | final report 전 service context를 MCP로 조회하고 MCP Context 섹션을 output contract에 유지 |

### 2.8 `chat_context_grounding`

| 항목 | 내용 |
| --- | --- |
| 판단 목적 | 후속 대화 응답이 이전 analysis/focus/evidence context에 grounded 되었는지 확인 |
| 수집 trace/event | `chat_*`, `chat_analysis_invoked`, `chat_context_built`, `chat_response_generated` |
| 수집 필드 | `chat_context_built.has_last_analysis`, chat event 존재 여부 |
| 적용 조건 | trace에 `chat_` prefix event가 있을 때만 검사 |
| 실패 조건 A | analysis invocation 이후 context build가 있었지만 `has_last_analysis=false` |
| 실패 severity A | `medium` |
| confidence A | `0.82` |
| 실패 조건 B | response가 생성되었지만 analysis invocation/context build evidence가 없음 |
| 실패 severity B | `low` |
| confidence B | `0.70` |
| 대표 evidence | `chat_context_built has_last_analysis=false after analysis invocation.`, `Chat response generated without analysis invocation or context build.` |
| 권장 조치 | follow-up turn 전에 last analysis summary/focus/evidence를 session context에 저장하고 `chat_context_built` event를 남김 |

## 3. 점수와 Gate 계산

Finding metric별로 별도의 numeric score를 계산하는 것이 아니라, finding severity penalty를 합산해 run score와 gate를 산출합니다.

### Severity penalty

| Severity | Penalty |
| --- | ---: |
| `critical` | 30 |
| `high` | 15 |
| `medium` | 7 |
| `low` | 2 |

계산식:

```text
score = max(0, 100 - sum(severity_penalty for each finding))
```

### Gate

| 조건 | Gate |
| --- | --- |
| critical finding 존재 또는 score < 70 | `block` |
| high finding 존재 또는 score < 85 | `warning` |
| 그 외 | `pass` |

## 4. 실제 구현 metric과 설계 지표의 차이

현재 `metrics.json`/`docs/DRIFT_METRICS.xlsx`에는 장기 설계용 지표가 포함되어 있습니다. 하지만 detector가 현재 실제로 생성하는 metric은 위 8개뿐입니다.

구현 지표에 없는 설계 지표 예시는 다음과 같습니다.

- `tool_argument_correctness`
- `tool_error_handling_score`
- `answer_context_groundedness`
- `node_sequence_correctness`
- `verification_coverage`
- `instruction_adherence_score`
- `redundant_tool_call_count`
- `missing_required_context`
- `retrieval_context_precision`
- `retrieval_context_relevance`
- `final_answer_consistency`
- `hallucinated_completion_claim`
- `task_completion_score`
- `edge_decision_correctness`
- `graph_completion_path_valid`
- `node_loop_count`
- `required_checkpoint_present`
- `memory_claim_supported`

위 지표들은 설계/후보 지표로 볼 수 있으며, 실제 판단 지표로 사용하려면 detector 구현과 trace 수집 이벤트가 추가되어야 합니다.

## 5. 코드 기준 출처

| 내용 | 파일 |
| --- | --- |
| metric 생성 위치 | `judgeagent/judge_agent/analysis/detectors.py` |
| detector 설정 | `judgeagent/judge_agent/config/detector_rules.json` |
| trace adapter | `judgeagent/judge_agent/adapters/reference.py` |
| 분석 entrypoint | `judgeagent/judge_agent/analysis/analyzer.py` |
| score/gate 계산 | `judgeagent/judge_agent/analysis/detectors.py`의 `score_findings()`, `gate_for()` |

## 6. 향후 정리 권장안

1. `metrics.json`에 `implemented: true/false` 또는 `implementation_status` 필드를 추가합니다.
2. 실제 detector가 생성하는 8개 metric만 frontend의 “implemented metrics” 화면에 표시합니다.
3. 설계 지표는 별도 “planned metrics” 또는 “candidate metrics”로 분리합니다.
4. metric 추가 시 다음 4가지를 한 PR에서 같이 수정합니다.
   - trace event 수집
   - detector 구현
   - metric registry metadata
   - regression test
