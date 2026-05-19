from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..core.config import detector_rules_config
from ..core.schema import Finding, SimpleAgentRun

REFERENCE_WEBLOG_RULES = detector_rules_config()["reference_weblog"]
REQUIRED_SECTIONS = REFERENCE_WEBLOG_RULES["required_output_sections"]
TOOL_NAMES = REFERENCE_WEBLOG_RULES["tools"]


def target_path(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = re.search(REFERENCE_WEBLOG_RULES["target_path_regex"], text)
    return m.group(1) if m else None


def _new_finding(idx: int, **kwargs: Any) -> Finding:
    return Finding(id=f"JD-{idx:03d}", **kwargs)


class ReferenceWebLogDetector:
    def detect(self, run: SimpleAgentRun) -> List[Finding]:
        findings: List[Finding] = []
        checks = [
            self.prompt_template_version,
            self.output_format_compliance,
            self.instruction_adherence,
            self.output_contract,
            self.validation_path,
            self.wrong_endpoint,
            self.parse_error_handling,
            self.metric_consistency,
            self.rag_mcp_presence,
            self.chat_context,
            self.tool_argument_mismatch,
            self.repeated_tool_call,
            self.context_hallucination,
        ]
        for check in checks:
            findings.extend(check(run, len(findings) + 1))
        return [Finding(id=f"JD-{i:03d}", category=f.category, metric=f.metric, severity=f.severity, confidence=f.confidence, evidence=f.evidence, expected=f.expected, actual=f.actual, recommendation=f.recommendation, location=f.location) for i, f in enumerate(findings, start=1)]


    def _prompt_instruction_metrics_event(self, run: SimpleAgentRun) -> Optional[Dict[str, Any]]:
        events = run.raw_by_type("prompt_instruction_metrics")
        return events[-1] if events else None

    def prompt_template_version(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        event = self._prompt_instruction_metrics_event(run)
        prompt_template = (event or {}).get("prompt_template") or {}
        name = prompt_template.get("name") or run.instructions.get("promptTemplateName")
        version = prompt_template.get("version") or run.instructions.get("promptTemplateVersion")
        present = prompt_template.get("present")
        if present is None:
            present = bool(name and version)
        if present and name and version:
            return []
        return [_new_finding(
            start,
            category="prompt",
            metric="prompt_template_version_present",
            severity="low",
            confidence=0.9,
            evidence=[f"prompt_template_name={name}", f"prompt_template_version={version}", f"prompt_template_present={present}"],
            expected="Trace should include prompt template name and version for regression tracking.",
            actual="Prompt template name/version metadata was missing from the trace.",
            recommendation="Emit prompt_template_name and prompt_template_version in instruction_snapshot and prompt_instruction_metrics events.",
            location={"eventType": "prompt_instruction_metrics"},
        )]

    def output_format_compliance(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        event = self._prompt_instruction_metrics_event(run)
        output_format = (event or {}).get("output_format") or {}
        if not output_format and run.final_output is not None:
            missing = [section for section in REQUIRED_SECTIONS if f"## {section}" not in (run.final_output or "")]
            output_format = {"missing_sections": missing, "compliant": not missing}
        if output_format.get("compliant", True):
            return []
        missing = output_format.get("missing_sections") or []
        return [_new_finding(
            start,
            category="prompt",
            metric="output_format_compliance",
            severity="medium",
            confidence=0.92,
            evidence=[f"missing_sections={missing}", f"contract={output_format.get('contract', 'markdown_sections')}"],
            expected="Final output should comply with the required output format captured by the reference agent.",
            actual="Reference agent reported output format non-compliance.",
            recommendation="Validate required output format before finish/final_output and regenerate or block invalid reports.",
            location={"eventType": "prompt_instruction_metrics"},
        )]

    def instruction_adherence(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        event = self._prompt_instruction_metrics_event(run)
        if not event:
            return []
        adherence = event.get("instruction_adherence") or {}
        score = float(adherence.get("score", 1.0))
        violations = adherence.get("violations") or []
        if score >= 1.0 and not violations:
            return []
        return [_new_finding(
            start,
            category="prompt",
            metric="instruction_adherence_score",
            severity="high",
            confidence=0.9,
            evidence=[f"instruction_adherence_score={score}", f"violations={violations}"],
            expected="Instruction adherence score should remain 1.0 with no collected violations.",
            actual="Reference agent collected prompt/instruction adherence violations.",
            recommendation="Enforce tool policy, output contract, and validation checks before final answer generation.",
            location={"eventType": "prompt_instruction_metrics"},
        )]

    def output_contract(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        final = run.final_output or ""
        if not final:
            return [_new_finding(start, category="completion", metric="output_contract_compliance", severity="critical", confidence=0.95, evidence=["final_output event is missing or empty"], expected="Final output should be present and follow the markdown contract.", actual="No final output found.", recommendation="Ensure finalization emits final_output after validation.")]
        missing = [section for section in REQUIRED_SECTIONS if f"## {section}" not in final]
        if not missing:
            return []
        return [_new_finding(start, category="prompt", metric="output_contract_compliance", severity="high", confidence=0.95, evidence=[f"Missing sections: {', '.join(missing)}"], expected="Final report contains all required markdown sections.", actual="Final report omitted required sections.", recommendation="Restore OUTPUT_CONTRACT instructions and validate required sections before final_output.", location={"eventType": "final_output"})]

    def validation_path(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        node_names = [e.get("node") for e in run.raw_by_type("node_start")]
        validations = run.raw_by_type("validation_result")
        edges = run.raw_by_type("edge_selected")
        skipped = any(e.get("reason") == REFERENCE_WEBLOG_RULES["validation_skip_reason"] for e in edges)
        if REFERENCE_WEBLOG_RULES["expected_validation_node"] in node_names and validations and not skipped:
            return []
        return [_new_finding(start, category="graph", metric="validation_path_coverage", severity="critical", confidence=0.98, evidence=[f"node_start sequence={node_names}", f"validation_result_count={len(validations)}", f"validation_skipped_edge={skipped}"], expected="validate_findings node and validation_result events must run before final output.", actual="Validation path was missing or explicitly skipped.", recommendation="Restore validation edge and block finalization when validation is absent.")]

    def wrong_endpoint(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        expected = target_path(run.user_input)
        if not expected:
            return []
        bad: List[str] = []
        for event in run.raw_by_type("tool_start"):
            if event.get("tool") == TOOL_NAMES["filter_log_records"]:
                actual = (event.get("arguments") or {}).get("path_pattern")
                if actual and actual != expected:
                    bad.append(f"filter_log_records.path_pattern={actual}, expected={expected}")
        for event in run.raw_by_type("tool_end"):
            if event.get("tool") == TOOL_NAMES["compute_log_metrics"]:
                for item in (event.get("output") or {}).get("top_paths", []):
                    actual = item.get("path")
                    if actual and actual != expected:
                        bad.append(f"metrics.top_paths contains {actual}, expected {expected}")
        if not bad:
            return []
        return [_new_finding(start, category="tool", metric="target_endpoint_consistency", severity="high", confidence=0.96, evidence=bad, expected=f"All tool arguments and metric paths should use {expected}.", actual="Trace used a different endpoint.", recommendation="Ground filter/query arguments in parsed user request targetPath and add argument validation.")]

    def parse_error_handling(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        findings: List[Finding] = []
        worst: Optional[Tuple[int, int]] = None
        repeated = 0
        for event in run.raw_by_type("tool_end"):
            if event.get("tool") != TOOL_NAMES["parse_access_log"]:
                continue
            out = event.get("output") or {}
            errors = int(out.get("parse_error_count") or 0)
            total = max(1, int(out.get("total_lines") or 0))
            if errors / total > float(REFERENCE_WEBLOG_RULES["parse_error_ratio_threshold"]):
                repeated += 1
                if worst is None or errors / total > worst[0] / max(1, worst[1]):
                    worst = (errors, total)
        if worst:
            errors, total = worst
            final = (run.final_output or "").lower()
            validation_issues = " ".join(str(v.get("issues", [])) for v in run.validation_results).lower()
            reflected = "parse" in final or "parse" in validation_issues
            actual = "High parse error rate was mentioned only as a limitation." if reflected else "Parse errors were not reflected."
            findings.append(_new_finding(start, category="tool", metric="parse_error_handling_score", severity="high", confidence=0.94, evidence=[f"parse_error_count={errors}, total_lines={total}", f"high_parse_error_events={repeated}", f"reflected_in_report_or_validation={reflected}"], expected="High parse error rate should stop or explicitly downgrade the analysis, not continue as a normal successful report.", actual=actual, recommendation="Treat high parse error ratio as a validation failure and prevent confident final reports."))
        return findings

    def metric_consistency(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        metrics_from_tool = [e for e in run.raw_by_type("tool_end") if e.get("tool") == TOOL_NAMES["compute_log_metrics"]]
        compute_steps = [e for e in run.raw_by_type("react_step") if e.get("action") == TOOL_NAMES["compute_log_metrics"]]
        if compute_steps and not metrics_from_tool:
            return [_new_finding(start, category="completion", metric="metric_result_consistency", severity="high", confidence=0.9, evidence=["react_step selected compute_log_metrics but no tool_end(compute_log_metrics) event exists."], expected="Computed metrics should come from a tool_end event or equivalent verifiable state.", actual="Metric computation was not observable as a tool result.", recommendation="Emit tool_start/tool_end for metric calculation and compare final claims to tool output.")]
        for event in run.raw_by_type("node_end") + run.raw_by_type("node_start"):
            state = event.get("state_after") or event.get("state_before") or {}
            metrics = state.get("metrics") or {}
            if metrics.get(REFERENCE_WEBLOG_RULES["metric_fault_flag"]):
                return [_new_finding(start, category="completion", metric="metric_result_consistency", severity="high", confidence=0.98, evidence=[f"faultInjected metrics observed in node {event.get('node')}: {metrics}"], expected="Metrics should be computed from filtered log records.", actual="Injected or unverifiable metrics were used.", recommendation="Reject metrics not produced by compute_log_metrics tool output.")]
        return []

    def rag_mcp_presence(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        findings: List[Finding] = []
        final = run.final_output or ""
        retrieved = any(e.get("tool") == TOOL_NAMES["retrieve_runbook"] for e in run.raw_by_type("tool_end"))
        mcp = any(e.get("type") == "mcp_end" and e.get("method") == REFERENCE_WEBLOG_RULES["mcp_tools_call_method"] for e in run.raw_events)
        if not retrieved:
            findings.append(_new_finding(start, category="context", metric="rag_context_presence_and_usage", severity="medium", confidence=0.85, evidence=["No tool_end(retrieve_runbook) event found."], expected="RAG runbook retrieval should occur for incident analysis.", actual="RAG context missing.", recommendation="Call retrieve_runbook before final report."))
        if not mcp:
            findings.append(_new_finding(start + len(findings), category="context", metric="mcp_context_presence_and_usage", severity="medium", confidence=0.85, evidence=["No mcp_end tools/call event found."], expected="MCP service metadata should be fetched for owner/SLO/dependency context.", actual="MCP context missing.", recommendation="Call get_service_context before final report."))
        if retrieved and "## RAG Context" not in final:
            findings.append(_new_finding(start + len(findings), category="context", metric="rag_context_presence_and_usage", severity="medium", confidence=0.8, evidence=["RAG retrieved but final report lacks RAG Context section."], expected="Final report should separate RAG context from measured evidence.", actual="RAG context not surfaced.", recommendation="Preserve RAG Context section in output contract."))
        if mcp and "## MCP Context" not in final:
            findings.append(_new_finding(start + len(findings), category="context", metric="mcp_context_presence_and_usage", severity="medium", confidence=0.8, evidence=["MCP context fetched but final report lacks MCP Context section."], expected="Final report should include MCP Context section.", actual="MCP context not surfaced.", recommendation="Preserve MCP Context section in output contract."))
        return findings

    def chat_context(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        if not any((e.get("type") or "").startswith("chat_") for e in run.raw_events):
            return []
        invoked = bool(run.raw_by_type("chat_analysis_invoked"))
        context_events = run.raw_by_type("chat_context_built")
        responses = run.raw_by_type("chat_response_generated")
        findings: List[Finding] = []
        for event in context_events:
            if not event.get("has_last_analysis") and invoked:
                findings.append(_new_finding(start, category="context", metric="chat_context_grounding", severity="medium", confidence=0.82, evidence=["chat_context_built has_last_analysis=false after analysis invocation."], expected="Follow-up responses should use last_analysis context.", actual="Context builder did not expose last_analysis.", recommendation="Persist analysis summary before follow-up turns."))
        if responses and not invoked and not context_events:
            findings.append(_new_finding(start + len(findings), category="context", metric="chat_context_grounding", severity="low", confidence=0.7, evidence=["Chat response generated without analysis invocation or context build."], expected="Chat responses should be classified and grounded in session context or ask clarification.", actual="No context evidence available.", recommendation="Emit chat_context_built for follow-up responses."))
        return findings


    def tool_argument_mismatch(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        """F-101: tool 인자가 사용자 요청과 불일치하는지 검사."""
        findings: List[Finding] = []
        user_input = (run.user_input or "").lower()
        expects_5xx = "5xx" in user_input or "500" in user_input or "서버 에러" in user_input

        status_min_5xx = int(REFERENCE_WEBLOG_RULES.get("status_5xx_min", 500))
        status_max_5xx = int(REFERENCE_WEBLOG_RULES.get("status_5xx_max", 599))

        for event in run.raw_by_type("tool_start"):
            tool = event.get("tool", "")
            args = event.get("arguments") or {}

            # filter_log_records: status 범위 검사
            if tool == TOOL_NAMES.get("filter_log_records", "filter_log_records"):
                s_min = args.get("status_min")
                s_max = args.get("status_max")
                if expects_5xx and s_min is not None and s_max is not None:
                    if int(s_min) > status_min_5xx or int(s_max) < status_max_5xx:
                        findings.append(_new_finding(
                            start + len(findings),
                            category="tool",
                            metric="tool_argument_mismatch",
                            severity="high",
                            confidence=0.9,
                            evidence=[
                                f"user_input contains '5xx' request",
                                f"filter_log_records called with status_min={s_min}, status_max={s_max}",
                                f"expected status range covering [{status_min_5xx}, {status_max_5xx}]",
                            ],
                            expected=f"filter_log_records status range should cover {status_min_5xx}~{status_max_5xx} for 5xx analysis.",
                            actual=f"Actual range [{s_min}, {s_max}] does not cover 5xx status codes.",
                            recommendation="Ground filter status range in parsed user request statusFocus/statusMin/statusMax.",
                            location={"eventType": "tool_start", "tool": tool},
                        ))

                # path_pattern이 None이면서 expected target이 있을 때
                path_pattern = args.get("path_pattern")
                expected_path = target_path(run.user_input)
                if expected_path and path_pattern is None:
                    findings.append(_new_finding(
                        start + len(findings),
                        category="tool",
                        metric="tool_argument_mismatch",
                        severity="medium",
                        confidence=0.8,
                        evidence=[
                            f"user_input specifies target path: {expected_path}",
                            "filter_log_records called with path_pattern=None (no path filter applied)",
                        ],
                        expected=f"filter_log_records should filter by path_pattern={expected_path}.",
                        actual="path_pattern was not set; all paths included in analysis.",
                        recommendation="Extract targetPath from parse_user_request output and pass to filter_log_records.",
                        location={"eventType": "tool_start", "tool": tool},
                    ))

        return findings

    def repeated_tool_call(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        """F-102: 동일 tool이 임계값 이상 반복 호출되는지 검사."""
        threshold = int(REFERENCE_WEBLOG_RULES.get("repeated_tool_call_threshold", 5))
        findings: List[Finding] = []

        # react_step 기준 tool 호출 횟수
        tool_counter: Counter = Counter()
        for event in run.raw_by_type("react_step"):
            action = event.get("action")
            if action and action != "finish":
                tool_counter[action] += 1

        for tool_name, count in tool_counter.items():
            if count >= threshold:
                findings.append(_new_finding(
                    start + len(findings),
                    category="tool",
                    metric="repeated_tool_call",
                    severity="high" if count >= threshold * 2 else "medium",
                    confidence=0.92,
                    evidence=[
                        f"tool '{tool_name}' called {count} times (threshold: {threshold})",
                        f"total react_step events: {sum(tool_counter.values())}",
                    ],
                    expected=f"Each tool should be called at most {threshold - 1} times in a single run.",
                    actual=f"Tool '{tool_name}' was called {count} times, indicating a ReAct loop or stuck agent.",
                    recommendation="Add loop detection in the ReAct agent; check tool output validity before retrying the same tool.",
                    location={"eventType": "react_step", "tool": tool_name},
                ))

        # 동일 thought + action 패턴 반복 감지 (완전 동일 반복)
        thought_action_pairs: Counter = Counter()
        for event in run.raw_by_type("react_step"):
            thought = (event.get("thought") or "").strip()
            action = (event.get("action") or "").strip()
            if thought and action and action != "finish":
                key = f"{action}||{thought[:120]}"
                thought_action_pairs[key] += 1

        for key, count in thought_action_pairs.items():
            if count >= 3:
                action_part = key.split("||")[0]
                findings.append(_new_finding(
                    start + len(findings),
                    category="tool",
                    metric="repeated_tool_call",
                    severity="high",
                    confidence=0.95,
                    evidence=[
                        f"Identical thought+action pattern repeated {count} times",
                        f"action: {action_part}",
                    ],
                    expected="Each ReAct step should produce new observations and progress.",
                    actual="Agent repeated the exact same thought+action without progress (stuck loop).",
                    recommendation="Implement loop-break condition: detect repeated observations and force finish or error.",
                    location={"eventType": "react_step"},
                ))
                break  # 첫 번째 패턴만 리포트

        return findings

    def context_hallucination(self, run: SimpleAgentRun, start: int) -> List[Finding]:
        """F-103: final output의 수치가 tool 산출 값과 크게 다른지 검사."""
        tolerance = float(REFERENCE_WEBLOG_RULES.get("metric_hallucination_tolerance", 0.1))
        findings: List[Finding] = []

        # compute_log_metrics tool_end에서 실제 수치 수집
        tool_metrics: Dict[str, float] = {}
        for event in run.raw_by_type("tool_end"):
            if event.get("tool") == TOOL_NAMES.get("compute_log_metrics", "compute_log_metrics"):
                output = event.get("output") or {}
                for key in ("error_rate", "request_count", "error_count", "5xx_count"):
                    val = output.get(key)
                    if val is not None:
                        try:
                            tool_metrics[key] = float(val)
                        except (TypeError, ValueError):
                            pass

        if not tool_metrics or not run.final_output:
            return []

        # final output에서 수치 추출 (퍼센트 / 소수 패턴)
        final = run.final_output
        mismatches: List[str] = []

        # error_rate 검사 (가장 중요)
        if "error_rate" in tool_metrics:
            tool_er = tool_metrics["error_rate"]
            # 퍼센트로 표현된 값 추출 (예: 15.00%, 0.15)
            pct_matches = re.findall(r"error.rate[^\d]{0,10}([\d.]+)\s*%", final, re.IGNORECASE)
            raw_matches = re.findall(r"error.rate[^\d]{0,10}([\d.]+)(?!\s*%)", final, re.IGNORECASE)
            for m in pct_matches:
                try:
                    claimed = float(m) / 100.0
                    if abs(claimed - tool_er) > tolerance:
                        mismatches.append(
                            f"error_rate: tool={tool_er:.4f}, output_claimed={claimed:.4f} ({m}%)"
                        )
                except ValueError:
                    pass
            for m in raw_matches:
                try:
                    claimed = float(m)
                    # 이미 소수 형태인 경우
                    if claimed <= 1.0 and abs(claimed - tool_er) > tolerance:
                        mismatches.append(
                            f"error_rate: tool={tool_er:.4f}, output_claimed={claimed:.4f}"
                        )
                except ValueError:
                    pass

        # request_count 검사
        if "request_count" in tool_metrics:
            tool_rc = int(tool_metrics["request_count"])
            rc_matches = re.findall(r"request.count[^\d]{0,10}(\d+)", final, re.IGNORECASE)
            for m in rc_matches:
                try:
                    claimed = int(m)
                    if abs(claimed - tool_rc) > max(1, tool_rc * tolerance):
                        mismatches.append(
                            f"request_count: tool={tool_rc}, output_claimed={claimed}"
                        )
                except ValueError:
                    pass

        if mismatches:
            findings.append(_new_finding(
                start,
                category="completion",
                metric="context_hallucination",
                severity="critical",
                confidence=0.88,
                evidence=mismatches,
                expected="Final output metric values should match the values produced by compute_log_metrics tool.",
                actual="Final output contains metric values that differ significantly from tool output.",
                recommendation="Require the agent to quote exact tool output values; add post-generation validation comparing claims to tool_end outputs.",
                location={"eventType": "final_output"},
            ))

        return findings


def score_findings(findings: List[Finding]) -> int:
    penalty = REFERENCE_WEBLOG_RULES["scoring_penalty"]
    return max(0, 100 - sum(int(penalty.get(f.severity, 0)) for f in findings))


def gate_for(score: int, findings: List[Finding]) -> str:
    severities = {f.severity for f in findings}
    thresholds = REFERENCE_WEBLOG_RULES["gate_thresholds"]
    if "critical" in severities or score < int(thresholds["block_score_below"]):
        return "block"
    if "high" in severities or score < int(thresholds["warning_score_below"]):
        return "warning"
    return "pass"
