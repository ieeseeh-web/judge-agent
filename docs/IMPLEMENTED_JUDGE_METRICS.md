# 실제 구현 기준 Judge Metrics 지표

> 기준: `judgeagent/judge_agent/analysis/detectors.py`에서 실제로 `Finding.metric`으로 생성되는 지표만 정리합니다.

## 1. 요약

현재 구현된 detector는 다음 **11개** metric을 실제 finding으로 생성합니다.

| No | 구현 metric | 기본 severity | 판단 영역 | detector method |
| --- | --- | --- | --- | --- |
| 1 | `output_contract_compliance` | critical/high | Prompt / Instruction | `output_contract()` |
| 2 | `target_endpoint_consistency` | high | Tool Use | `wrong_endpoint()` |
| 3 | `metric_result_consistency` | high | Final Output / Completion | `metric_consistency()` |
| 4 | `validation_path_coverage` | critical | LangGraph Flow | `validation_path()` |
| 5 | `parse_error_handling_score` | high | Tool Use | `parse_error_handling()` |
| 6 | `rag_context_presence_and_usage` | medium | Context / Retrieval | `rag_mcp_presence()` |
| 7 | `instruction_adherence_score` | high | Prompt / Instruction | `instruction_adherence()` |
| 8 | `mcp_context_presence_and_usage` | medium | ReAct / RAG / MCP | `rag_mcp_presence()` |
| 9 | `chat_context_grounding` | medium/low | Context / Retrieval | `chat_context()` |
| 10 | `output_format_compliance` | medium | Prompt / Instruction | `output_format_compliance()` |
| 11 | `prompt_template_version_present` | low | Prompt / Instruction | `prompt_template_version()` |

## 2. 구현 기준 상세 지표

### 2.1 `output_contract_compliance`

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
| Implemented Failure Rule | final_output missing/empty or required markdown sections missing |
| Confidence | 0.95 |

### 2.2 `target_endpoint_consistency`

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
| Implemented Failure Rule | tool argument or metric path differs from user target path |
| Confidence | 0.96 |

### 2.3 `metric_result_consistency`

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
| Implemented Failure Rule | compute step without compute_log_metrics result or faultInjected metrics |
| Confidence | 0.90/0.98 |

### 2.4 `validation_path_coverage`

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
| Implemented Failure Rule | validate_findings node/result missing or validation skip edge detected |
| Confidence | 0.98 |

### 2.5 `parse_error_handling_score`

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

### 2.6 `rag_context_presence_and_usage`

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
| Implemented Failure Rule | retrieve_runbook missing or ## RAG Context missing |
| Confidence | 0.85/0.80 |

### 2.7 `instruction_adherence_score`

| 항목 | 내용 |
| --- | --- |
| Category | Prompt / Instruction |
| Registry Severity | High |
| Actual Severity | high |
| Measurement Method | LLM judge + rule |
| Value Type | 0.0 ~ 1.0 |
| Description | Agent가 주어진 instruction을 따른 정도. |
| Detector Method | instruction_adherence() |
| Trace Events Used | prompt_instruction_metrics |
| Trace Fields Used | instruction_adherence.score, instruction_adherence.violations |
| Implemented Failure Rule | score < 1.0 or violations present |
| Confidence | 0.90 |

### 2.8 `mcp_context_presence_and_usage`

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
| Implemented Failure Rule | mcp tools/call missing or ## MCP Context missing |
| Confidence | 0.85/0.80 |

### 2.9 `chat_context_grounding`

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
| Implemented Failure Rule | follow-up response not grounded in last analysis/context evidence |
| Confidence | 0.82/0.70 |

### 2.10 `output_format_compliance`

| 항목 | 내용 |
| --- | --- |
| Category | Prompt / Instruction |
| Registry Severity | Medium |
| Actual Severity | medium |
| Measurement Method | deterministic parser |
| Value Type | pass/fail |
| Description | 요구된 output format을 지켰는지. |
| Detector Method | output_format_compliance() |
| Trace Events Used | prompt_instruction_metrics, final_output fallback |
| Trace Fields Used | output_format.compliant, output_format.missing_sections |
| Implemented Failure Rule | required output format is not compliant |
| Confidence | 0.92 |

### 2.11 `prompt_template_version_present`

| 항목 | 내용 |
| --- | --- |
| Category | Prompt / Instruction |
| Registry Severity | Low |
| Actual Severity | low |
| Measurement Method | trace 검사 |
| Value Type | 존재 여부 |
| Description | trace에 prompt template 이름/version이 기록되어 있는지. |
| Detector Method | prompt_template_version() |
| Trace Events Used | instruction_snapshot, prompt_instruction_metrics |
| Trace Fields Used | prompt_template.name, prompt_template.version, prompt_template.present |
| Implemented Failure Rule | prompt template name/version missing |
| Confidence | 0.90 |

## 3. 점수와 Gate 계산

```text
score = max(0, 100 - sum(severity_penalty for each finding))
```
