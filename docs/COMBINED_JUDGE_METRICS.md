# Judge Metrics 통합 지표표

> 기준: `judgeagent/judge_agent/config/metrics.json`의 전체 계획 지표와 `ReferenceWebLogDetector`에서 실제 `Finding.metric`으로 생성되는 구현 지표를 합쳐 정리했습니다.

## 1. 요약

- 전체 계획/후보 지표: **36개**
- 실제 구현 지표: **8개**
- 미구현/계획 지표: **28개**

## 2. 상태 정의

| Status | 의미 |
| --- | --- |
| `Implemented` | 현재 detector 코드에서 실제 trace/event 값을 읽어 `Finding.metric`으로 생성하는 지표 |
| `Planned` | `metrics.json`/기획 문서에는 있으나 현재 detector에서 finding으로 생성하지 않는 지표 |

## 3. 통합 지표표

| No | Metric | Implementation Status | Category | Registry Severity | Actual Severity | Measurement Method | Value Type | Description | Detector Method | Trace Events Used | Implemented Failure Rule | MVP Priority | Reference Agent Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | output_contract_compliance | Implemented | Prompt / Instruction | High | critical/high | deterministic parser | pass/fail | final output이 markdown contract를 만족하는지. | output_contract() | final_output | final_output 누락/공백 또는 필수 Markdown 섹션 누락 | - | 1 |
| 2 | tool_argument_correctness | Planned | Tool Use | High | - | rule (schema + context) | 0.0 ~ 1.0 | tool argument가 schema와 context를 만족하는지. | - | - | - | 1 | - |
| 3 | target_endpoint_consistency | Implemented | Tool Use | High | high | rule (context) | pass/fail | 사용자 요청 target endpoint와 tool/metric path가 일치하는지. | wrong_endpoint() | run_start/chat_turn_start, tool_start, tool_end | 사용자 요청 target path와 tool argument/metric path 불일치 | - | 2 |
| 4 | tool_error_handling_score | Planned | Tool Use | Critical | - | rule | 0.0 ~ 1.0 | tool error를 적절히 처리했는지. | - | - | - | 2 | - |
| 5 | answer_context_groundedness | Planned | Context / Retrieval | High | - | LLM judge | 0.0 ~ 1.0 | final output이 retrieved context에 근거하는지. | - | - | - | 3 | - |
| 6 | metric_result_consistency | Implemented | Final Output / Completion | High | high | rule (tool output) | pass/fail | metric claim이 검증 가능한 tool output에서 왔는지. | metric_consistency() | react_step, tool_end, node_start, node_end | compute step은 있으나 compute_log_metrics tool_end가 없거나, faultInjected metrics 사용 | - | 3 |
| 7 | node_sequence_correctness | Planned | LangGraph Flow | Critical | - | rule (expected path) | 0.0 ~ 1.0 | 실행된 node 순서가 기대 workflow와 맞는지. | - | - | - | 4 | - |
| 8 | validation_path_coverage | Implemented | LangGraph Flow | Critical | critical | rule (expected path) | pass/fail | validate_findings node와 validation_result가 실행되었는지. | validation_path() | node_start, validation_result, edge_selected | validate_findings node/result 누락 또는 validation skip edge 감지 | - | 4 |
| 9 | verification_coverage | Planned | Final Output / Completion | High | - | rule | 0.0 ~ 1.0 | 완료 전 필요한 검증을 수행했는지. | - | - | - | 5 | - |
| 10 | parse_error_handling_score | Implemented | Tool Use | High | high | rule | 0.0 ~ 1.0 | 높은 parse error ratio를 차단/반영했는지. | parse_error_handling() | tool_end(parse_access_log), final_output, validation_result | parse_error_count / total_lines > 0.5 | - | 5 |
| 11 | rag_context_presence_and_usage | Implemented | Context / Retrieval | Medium | medium | rule | pass/fail | RAG retrieval과 final report 반영 여부. | rag_mcp_presence() | tool_end, final_output | retrieve_runbook 누락 또는 final report의 ## RAG Context 섹션 누락 | - | 6 |
| 12 | instruction_adherence_score | Planned | Prompt / Instruction | High | - | LLM judge + rule | 0.0 ~ 1.0 | Agent가 주어진 instruction을 따른 정도. | - | - | - | 6 | - |
| 13 | mcp_context_presence_and_usage | Implemented | ReAct / RAG / MCP | Medium | medium | rule | pass/fail | MCP service context 수집과 final report 반영 여부. | rag_mcp_presence() | mcp_end, final_output | mcp_end tools/call 누락 또는 final report의 ## MCP Context 섹션 누락 | - | 7 |
| 14 | redundant_tool_call_count | Planned | Tool Use | Medium | - | rule (중복 탐지) | count (정수) | 같은 목적의 중복 tool 호출 횟수. | - | - | - | 7 | - |
| 15 | chat_context_grounding | Implemented | Context / Retrieval | Medium | medium/low | rule | pass/fail | 후속 대화가 직전 analysis/focus/evidence에 grounded 되었는지. | chat_context() | chat_*, chat_analysis_invoked, chat_context_built, chat_response_generated | 후속 대화가 last analysis/context evidence에 grounded 되지 않음 | - | 8 |
| 16 | missing_required_context | Planned | Context / Retrieval | High | - | reference fixture / LLM judge | 0.0 ~ 1.0 | 답변에 필요한 context가 검색되지 않았는지. | - | - | - | - | - |
| 17 | retrieval_context_precision | Planned | Context / Retrieval | Medium | - | rule (비율) | 0.0 ~ 1.0 | retrieved chunk 중 관련 있는 chunk의 비율. | - | - | - | - | - |
| 18 | retrieval_context_relevance | Planned | Context / Retrieval | Medium | - | LLM judge / embedding sim | 0.0 ~ 1.0 | retriever가 가져온 document/chunk가 user input과 관련 있는지. | - | - | - | - | - |
| 19 | final_answer_consistency | Planned | Final Output / Completion | High | - | LLM judge + rule | 0.0 ~ 1.0 | final answer가 trace의 실제 실행 결과와 일치하는지. | - | - | - | - | - |
| 20 | hallucinated_completion_claim | Planned | Final Output / Completion | Critical | - | LLM judge + rule | pass/fail | 실제로 수행하지 않은 일을 완료했다고 말했는지. | - | - | - | - | - |
| 21 | task_completion_score | Planned | Final Output / Completion | High | - | LLM judge + rule | 0.0 ~ 1.0 | 사용자 요청이 완료되었는지. | - | - | - | - | - |
| 22 | edge_decision_correctness | Planned | LangGraph Flow | High | - | rule (state 비교) | 0.0 ~ 1.0 | conditional edge 선택이 state/tool result와 맞는지. | - | - | - | - | - |
| 23 | graph_completion_path_valid | Planned | LangGraph Flow | High | - | rule (종료 path) | pass/fail | 종료 node까지의 path가 정상 완료 path인지. | - | - | - | - | - |
| 24 | node_loop_count | Planned | LangGraph Flow | Medium | - | rule (반복 탐지) | count (정수) | 같은 node 반복 횟수. | - | - | - | - | - |
| 25 | required_checkpoint_present | Planned | LangGraph Flow | Medium | - | rule (checkpoint 검사) | pass/fail | 중요 node 이후 checkpoint/state snapshot이 존재하는지. | - | - | - | - | - |
| 26 | memory_claim_supported | Planned | Memory / State | High | - | rule (state 조회) | pass/fail | agent가 '기억한다'고 주장한 내용이 memory/state에 존재하는지. | - | - | - | - | - |
| 27 | memory_update_correctness | Planned | Memory / State | Medium | - | rule | pass/fail | 저장해야 할 memory를 저장했고, 저장하면 안 되는 내용을 저장하지 않았는지. | - | - | - | - | - |
| 28 | state_freshness_score | Planned | Memory / State | Medium | - | rule (timestamp/version) | 0.0 ~ 1.0 | LangGraph state/checkpoint가 최신인지. | - | - | - | - | - |
| 29 | state_value_grounding | Planned | Memory / State | High | - | rule (event 추적) | 0.0 ~ 1.0 | node가 사용한 state 값이 이전 event에서 생성/검증된 값인지. | - | - | - | - | - |
| 30 | output_format_compliance | Planned | Prompt / Instruction | Medium | - | deterministic parser | pass/fail | 요구된 output format을 지켰는지. | - | - | - | - | - |
| 31 | prompt_template_version_present | Planned | Prompt / Instruction | Low | - | trace 검사 | 존재 여부 | trace에 prompt template 이름/version이 기록되어 있는지. | - | - | - | - | - |
| 32 | action_grounding_score | Planned | ReAct / RAG / MCP | High | - | rule + LLM judge | 0.0 ~ 1.0 | action argument가 user input/state/observation에서 근거를 갖는가. | - | - | - | - | - |
| 33 | observation_utilization_score | Planned | ReAct / RAG / MCP | Medium | - | LLM judge | 0.0 ~ 1.0 | tool observation이 다음 reasoning/final report에 반영되는가. | - | - | - | - | - |
| 34 | react_step_completeness | Planned | ReAct / RAG / MCP | High | - | rule + LLM judge | 0.0 ~ 1.0 | Thought/Action/Observation sequence가 완전한가. | - | - | - | - | - |
| 35 | tool_result_grounding_score | Planned | Tool Use | High | - | LLM judge + rule | 0.0 ~ 1.0 | final output이 tool result와 일치하는지. | - | - | - | - | - |
| 36 | tool_selection_accuracy | Planned | Tool Use | High | - | exact match / LLM judge | 0.0 ~ 1.0 | 선택한 tool이 task에 적절했는지. | - | - | - | - | - |

## 4. 실제 구현 지표 상세

### 4.1 `output_contract_compliance`

| 항목 | 내용 |
| --- | --- |
| Category | Prompt / Instruction |
| Registry Severity | High |
| Actual Severity | critical/high |
| Measurement Method | deterministic parser |
| Value Type | pass/fail |
| Description | final output이 markdown contract를 만족하는지. |
| Detector Method | output_contract() |
| Trace Events Used | final_output |
| Trace Fields Used | final_output.content |
| Implemented Failure Rule | final_output 누락/공백 또는 필수 Markdown 섹션 누락 |
| Confidence | 0.95 |

### 4.2 `target_endpoint_consistency`

| 항목 | 내용 |
| --- | --- |
| Category | Tool Use |
| Registry Severity | High |
| Actual Severity | high |
| Measurement Method | rule (context) |
| Value Type | pass/fail |
| Description | 사용자 요청 target endpoint와 tool/metric path가 일치하는지. |
| Detector Method | wrong_endpoint() |
| Trace Events Used | run_start/chat_turn_start, tool_start, tool_end |
| Trace Fields Used | user_input, filter_log_records.path_pattern, compute_log_metrics.top_paths[].path |
| Implemented Failure Rule | 사용자 요청 target path와 tool argument/metric path 불일치 |
| Confidence | 0.96 |

### 4.3 `metric_result_consistency`

| 항목 | 내용 |
| --- | --- |
| Category | Final Output / Completion |
| Registry Severity | High |
| Actual Severity | high |
| Measurement Method | rule (tool output) |
| Value Type | pass/fail |
| Description | metric claim이 검증 가능한 tool output에서 왔는지. |
| Detector Method | metric_consistency() |
| Trace Events Used | react_step, tool_end, node_start, node_end |
| Trace Fields Used | react_step.action, tool_end.tool, state.metrics.faultInjected |
| Implemented Failure Rule | compute step은 있으나 compute_log_metrics tool_end가 없거나, faultInjected metrics 사용 |
| Confidence | 0.90/0.98 |

### 4.4 `validation_path_coverage`

| 항목 | 내용 |
| --- | --- |
| Category | LangGraph Flow |
| Registry Severity | Critical |
| Actual Severity | critical |
| Measurement Method | rule (expected path) |
| Value Type | pass/fail |
| Description | validate_findings node와 validation_result가 실행되었는지. |
| Detector Method | validation_path() |
| Trace Events Used | node_start, validation_result, edge_selected |
| Trace Fields Used | node_start.node, validation_result count, edge_selected.reason |
| Implemented Failure Rule | validate_findings node/result 누락 또는 validation skip edge 감지 |
| Confidence | 0.98 |

### 4.5 `parse_error_handling_score`

| 항목 | 내용 |
| --- | --- |
| Category | Tool Use |
| Registry Severity | High |
| Actual Severity | high |
| Measurement Method | rule |
| Value Type | 0.0 ~ 1.0 |
| Description | 높은 parse error ratio를 차단/반영했는지. |
| Detector Method | parse_error_handling() |
| Trace Events Used | tool_end(parse_access_log), final_output, validation_result |
| Trace Fields Used | parse_error_count, total_lines, final_output.content, validation_result.issues |
| Implemented Failure Rule | parse_error_count / total_lines > 0.5 |
| Confidence | 0.94 |

### 4.6 `rag_context_presence_and_usage`

| 항목 | 내용 |
| --- | --- |
| Category | Context / Retrieval |
| Registry Severity | Medium |
| Actual Severity | medium |
| Measurement Method | rule |
| Value Type | pass/fail |
| Description | RAG retrieval과 final report 반영 여부. |
| Detector Method | rag_mcp_presence() |
| Trace Events Used | tool_end, final_output |
| Trace Fields Used | tool_end.tool, final_output.content |
| Implemented Failure Rule | retrieve_runbook 누락 또는 final report의 ## RAG Context 섹션 누락 |
| Confidence | 0.85/0.80 |

### 4.7 `mcp_context_presence_and_usage`

| 항목 | 내용 |
| --- | --- |
| Category | ReAct / RAG / MCP |
| Registry Severity | Medium |
| Actual Severity | medium |
| Measurement Method | rule |
| Value Type | pass/fail |
| Description | MCP service context 수집과 final report 반영 여부. |
| Detector Method | rag_mcp_presence() |
| Trace Events Used | mcp_end, final_output |
| Trace Fields Used | mcp_end.method, final_output.content |
| Implemented Failure Rule | mcp_end tools/call 누락 또는 final report의 ## MCP Context 섹션 누락 |
| Confidence | 0.85/0.80 |

### 4.8 `chat_context_grounding`

| 항목 | 내용 |
| --- | --- |
| Category | Context / Retrieval |
| Registry Severity | Medium |
| Actual Severity | medium/low |
| Measurement Method | rule |
| Value Type | pass/fail |
| Description | 후속 대화가 직전 analysis/focus/evidence에 grounded 되었는지. |
| Detector Method | chat_context() |
| Trace Events Used | chat_*, chat_analysis_invoked, chat_context_built, chat_response_generated |
| Trace Fields Used | chat_context_built.has_last_analysis |
| Implemented Failure Rule | 후속 대화가 last analysis/context evidence에 grounded 되지 않음 |
| Confidence | 0.82/0.70 |

## 5. Score / Gate 계산

실제 구현에서는 metric별 numeric score를 별도로 계산하지 않고, 생성된 finding들의 severity penalty 합으로 run score와 gate를 계산합니다.

| Severity | Penalty |
| --- | ---: |
| `critical` | 30 |
| `high` | 15 |
| `medium` | 7 |
| `low` | 2 |

```text
score = max(0, 100 - sum(severity_penalty for each finding))
```

| Gate | 조건 |
| --- | --- |
| `block` | critical finding 존재 또는 score < 70 |
| `warning` | high finding 존재 또는 score < 85 |
| `pass` | 그 외 |

## 6. 관리 권장안

1. `metrics.json`에 `implementation_status` 필드를 추가해 구현 여부를 registry 차원에서 관리합니다.
2. 새 지표를 구현할 때는 trace event 수집, detector, metric registry, regression test를 함께 수정합니다.
3. frontend에서는 `Implemented`와 `Planned`를 분리 표시해 실제 판단 가능한 지표와 로드맵 지표를 구분합니다.
4. `docs/DRIFT_METRICS.xlsx`는 설계 원본, 이 문서는 구현 상태 추적용으로 사용합니다.

## 7. 코드 기준 출처

| 내용 | 파일 |
| --- | --- |
| 전체 계획/후보 지표 | `judgeagent/judge_agent/config/metrics.json` |
| 실제 metric 생성 | `judgeagent/judge_agent/analysis/detectors.py` |
| detector 설정 | `judgeagent/judge_agent/config/detector_rules.json` |
| trace adapter | `judgeagent/judge_agent/adapters/reference.py` |
| analyzer entrypoint | `judgeagent/judge_agent/analysis/analyzer.py` |
