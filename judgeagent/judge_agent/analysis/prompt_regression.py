from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

from .analyzer import analyze_trace
from .reporter import markdown_report
from ..core.schema import AnalysisResult, Finding, SimpleAgentRun

GATE_RANK = {"pass": 0, "warning": 1, "block": 2}
SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}


@dataclass
class PromptRegressionSummary:
    baselineRunId: str
    candidateRunId: str
    baselineGate: str
    candidateGate: str
    baselineScore: int
    candidateScore: int
    scoreDelta: int
    gateChanged: bool
    gateRegressed: bool
    newFindingCount: int
    newHighCriticalFindingCount: int
    resolvedFindingCount: int
    regressionScore: int
    baselineModel: Optional[str] = None
    candidateModel: Optional[str] = None
    modelChanged: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class PromptRegressionResult:
    baseline: AnalysisResult
    candidate: AnalysisResult
    findings: List[Finding]
    new_findings: List[Finding] = field(default_factory=list)
    resolved_findings: List[Finding] = field(default_factory=list)
    summary: PromptRegressionSummary | None = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary.to_dict() if self.summary else {},
            "baseline": self.baseline.to_dict(),
            "candidate": self.candidate.to_dict(),
            "findings": [finding.to_dict() for finding in self.findings],
            "newFindings": [finding.to_dict() for finding in self.new_findings],
            "resolvedFindings": [finding.to_dict() for finding in self.resolved_findings],
        }


def _llm_model(run: SimpleAgentRun) -> Optional[str]:
    events = run.raw_by_type("run_start")
    if events:
        return events[0].get("llm_model") or None
    return None


def _prompt_identity(run: SimpleAgentRun) -> Dict[str, Any]:
    prompt_metrics = run.metadata.get("prompt_instruction_metrics") or {}
    prompt_template = prompt_metrics.get("promptTemplate") or {}
    return {
        "name": prompt_template.get("name") or run.instructions.get("promptTemplateName"),
        "version": prompt_template.get("version") or run.instructions.get("promptTemplateVersion"),
        "hash": prompt_template.get("hash") or run.instructions.get("promptTemplateHash"),
        "contractHash": prompt_template.get("contract_hash") or run.instructions.get("promptContractHash"),
    }


def _finding_key(finding: Finding) -> Tuple[str, str, str, Tuple[str, ...]]:
    location = json.dumps(finding.location or {}, ensure_ascii=False, sort_keys=True)
    evidence = tuple(str(item) for item in finding.evidence[:2])
    return (finding.metric, finding.category, location, evidence)


def _tool_sequence(run: SimpleAgentRun) -> List[str]:
    return [str(event.get("tool")) for event in run.raw_by_type("tool_start") if event.get("tool")]


def _has_validation_path(run: SimpleAgentRun) -> bool:
    nodes = [event.get("node") for event in run.raw_by_type("node_start")]
    return "validate_findings" in nodes and bool(run.raw_by_type("validation_result"))


def _output_compliant(run: SimpleAgentRun) -> bool:
    events = run.raw_by_type("prompt_instruction_metrics")
    if events:
        output_format = events[-1].get("output_format") or {}
        if "compliant" in output_format:
            return bool(output_format.get("compliant"))
    return not any(f"missing_section:" in str(issue) for event in run.validation_results for issue in event.get("issues", []))


def _target_endpoint_findings(result: AnalysisResult) -> bool:
    return any(finding.metric == "target_endpoint_consistency" for finding in result.findings)


def _new_and_resolved_findings(baseline: AnalysisResult, candidate: AnalysisResult) -> Tuple[List[Finding], List[Finding]]:
    baseline_keys = {_finding_key(finding): finding for finding in baseline.findings}
    candidate_keys = {_finding_key(finding): finding for finding in candidate.findings}
    new = [finding for key, finding in candidate_keys.items() if key not in baseline_keys]
    resolved = [finding for key, finding in baseline_keys.items() if key not in candidate_keys]
    return new, resolved


def _make_finding(idx: int, **kwargs: Any) -> Finding:
    return Finding(id=f"PR-{idx:03d}", **kwargs)


def detect_prompt_regressions(baseline: AnalysisResult, candidate: AnalysisResult) -> PromptRegressionResult:
    findings: List[Finding] = []
    new_findings, resolved_findings = _new_and_resolved_findings(baseline, candidate)
    new_high_critical = [f for f in new_findings if f.severity in {"high", "critical"}]
    gate_regressed = GATE_RANK.get(candidate.gate, 0) > GATE_RANK.get(baseline.gate, 0)
    score_delta = candidate.score - baseline.score

    baseline_model = _llm_model(baseline.run)
    candidate_model = _llm_model(candidate.run)
    model_changed = bool(baseline_model and candidate_model and baseline_model != candidate_model)

    if model_changed:
        findings.append(_make_finding(
            len(findings) + 1,
            category="model",
            metric="model_change_detected",
            severity="medium",
            confidence=0.99,
            evidence=[f"baseline_model={baseline_model}", f"candidate_model={candidate_model}"],
            expected="Baseline과 Candidate 실행에 동일한 LLM 모델이 사용되어야 합니다.",
            actual=f"모델이 '{baseline_model}'에서 '{candidate_model}'로 변경되었습니다. 행동 차이가 프롬프트 변경이 아닌 모델 변경으로 인한 것일 수 있습니다.",
            recommendation="모델 드리프트를 프롬프트 드리프트와 분리하려면, 동일한 프롬프트로 다른 모델을 실행한 뒤 비교하세요.",
        ))

    if gate_regressed:
        findings.append(_make_finding(
            len(findings) + 1,
            category="prompt",
            metric="gate_regression",
            severity="critical" if candidate.gate == "block" else "high",
            confidence=0.98,
            evidence=[f"baseline_gate={baseline.gate}", f"candidate_gate={candidate.gate}", f"baseline_score={baseline.score}", f"candidate_score={candidate.score}"],
            expected="Prompt changes should not worsen the Judge gate for the same fixture/input.",
            actual="Candidate prompt produced a worse gate than the baseline prompt.",
            recommendation="Review prompt diff, especially output contract, tool policy, and validation instructions before promoting the candidate prompt.",
        ))

    if new_high_critical:
        findings.append(_make_finding(
            len(findings) + 1,
            category="prompt",
            metric="new_high_severity_findings",
            severity="critical" if any(f.severity == "critical" for f in new_high_critical) else "high",
            confidence=0.95,
            evidence=[f"{f.metric}:{f.severity}:{f.id}" for f in new_high_critical],
            expected="Prompt changes should not introduce new high/critical findings for the same fixture/input.",
            actual=f"Candidate prompt introduced {len(new_high_critical)} new high/critical finding(s).",
            recommendation="Compare baseline/candidate traces and fix the prompt section that changed tool use, validation, or output behavior.",
        ))

    penalty = max(0, -score_delta)
    if gate_regressed:
        penalty += 30 if candidate.gate == "block" else 15
    for finding in new_high_critical:
        penalty += 20 if finding.severity == "critical" else 10
    if any(f.metric in {"output_contract_compliance", "output_format_compliance"} for f in new_findings):
        penalty += 15
    if any(f.metric == "validation_path_coverage" for f in new_findings):
        penalty += 20
    regression_score = max(0, 100 - penalty)
    if regression_score < 85:
        findings.append(_make_finding(
            len(findings) + 1,
            category="prompt",
            metric="prompt_version_regression_score",
            severity="critical" if regression_score < 70 else "high",
            confidence=0.9,
            evidence=[f"regression_score={regression_score}", f"score_delta={score_delta}", f"penalty={penalty}", f"new_high_critical={len(new_high_critical)}"],
            expected="Prompt regression score should stay at or above 85 for promotion.",
            actual="Candidate prompt regression score fell below the promotion threshold.",
            recommendation="Block or review the prompt change until score/gate/finding regressions are resolved.",
        ))

    baseline_tools = _tool_sequence(baseline.run)
    candidate_tools = _tool_sequence(candidate.run)
    missing_tools = [tool for tool in baseline_tools if tool not in candidate_tools]
    stability_penalty = 0.0
    reasons: List[str] = []
    if missing_tools:
        stability_penalty += 0.2
        reasons.append(f"missing_tools={missing_tools}")
    if _has_validation_path(baseline.run) and not _has_validation_path(candidate.run):
        stability_penalty += 0.2
        reasons.append("validation_path_disappeared=True")
    if _output_compliant(baseline.run) and not _output_compliant(candidate.run):
        stability_penalty += 0.2
        reasons.append("output_format_became_non_compliant=True")
    if not _target_endpoint_findings(baseline) and _target_endpoint_findings(candidate):
        stability_penalty += 0.2
        reasons.append("target_endpoint_regressed=True")
    if baseline_tools and candidate_tools and baseline_tools != candidate_tools:
        stability_penalty += 0.1
        reasons.append(f"baseline_tools={baseline_tools}")
        reasons.append(f"candidate_tools={candidate_tools}")
    stability_score = max(0.0, 1.0 - stability_penalty)
    if stability_score < 0.85:
        findings.append(_make_finding(
            len(findings) + 1,
            category="prompt",
            metric="tool_and_output_stability_score",
            severity="high" if stability_score < 0.7 else "medium",
            confidence=0.86,
            evidence=[f"stability_score={stability_score:.2f}", *reasons],
            expected="Prompt changes should preserve required tool sequence, validation path, target grounding, and output format.",
            actual="Candidate prompt changed tool/output behavior beyond the stability threshold.",
            recommendation="Review the prompt change for unintended tool policy, output contract, or workflow changes.",
        ))

    summary = PromptRegressionSummary(
        baselineRunId=baseline.run.run_id,
        candidateRunId=candidate.run.run_id,
        baselineGate=baseline.gate,
        candidateGate=candidate.gate,
        baselineScore=baseline.score,
        candidateScore=candidate.score,
        scoreDelta=score_delta,
        gateChanged=baseline.gate != candidate.gate,
        gateRegressed=gate_regressed,
        newFindingCount=len(new_findings),
        newHighCriticalFindingCount=len(new_high_critical),
        resolvedFindingCount=len(resolved_findings),
        regressionScore=regression_score,
        baselineModel=baseline_model,
        candidateModel=candidate_model,
        modelChanged=model_changed,
    )
    return PromptRegressionResult(baseline=baseline, candidate=candidate, findings=findings, new_findings=new_findings, resolved_findings=resolved_findings, summary=summary)


def compare_prompt_runs(baseline_trace: Union[str, Path], candidate_trace: Union[str, Path], adapter_name: str = "reference-weblog-jsonl") -> PromptRegressionResult:
    baseline = analyze_trace(baseline_trace, adapter_name=adapter_name)
    candidate = analyze_trace(candidate_trace, adapter_name=adapter_name)
    return detect_prompt_regressions(baseline, candidate)


def markdown_prompt_regression_report(result: PromptRegressionResult) -> str:
    baseline_prompt = _prompt_identity(result.baseline.run)
    candidate_prompt = _prompt_identity(result.candidate.run)
    lines = [
        "# Prompt Regression Report",
        "",
        "## Summary",
        "",
        f"- baseline run: `{result.baseline.run.run_id}`",
        f"- candidate run: `{result.candidate.run.run_id}`",
        f"- baseline gate/score: **{result.baseline.gate}** / {result.baseline.score}",
        f"- candidate gate/score: **{result.candidate.gate}** / {result.candidate.score}",
        f"- score delta: {result.summary.scoreDelta if result.summary else 'n/a'}",
        f"- regression score: {result.summary.regressionScore if result.summary else 'n/a'}",
        f"- gate regressed: {result.summary.gateRegressed if result.summary else 'n/a'}",
        "",
        "## Prompt Identity",
        "",
        f"- baseline: `{baseline_prompt}`",
        f"- candidate: `{candidate_prompt}`",
        "",
        "## Model",
        "",
        f"- baseline model: `{result.summary.baselineModel or 'unknown'}`",
        f"- candidate model: `{result.summary.candidateModel or 'unknown'}`",
        f"- model changed: **{result.summary.modelChanged}**",
        "",
        "## Regression Findings",
        "",
    ]
    if not result.findings:
        lines.append("- No prompt regression findings.")
    for finding in result.findings:
        lines.extend([
            f"### {finding.id} {finding.metric}",
            "",
            f"- severity: {finding.severity}",
            f"- confidence: {finding.confidence:.2f}",
            f"- expected: {finding.expected}",
            f"- actual: {finding.actual}",
            "- evidence:",
            *[f"  - {item}" for item in finding.evidence],
            f"- recommendation: {finding.recommendation}",
            "",
        ])
    lines.extend([
        "## Candidate Judge Report",
        "",
        markdown_report([result.candidate]).strip(),
    ])
    return "\n".join(lines).rstrip() + "\n"


def write_prompt_regression_json(result: PromptRegressionResult, path: Union[str, Path]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(result.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def write_prompt_regression_markdown(result: PromptRegressionResult, path: Union[str, Path]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(markdown_prompt_regression_report(result), encoding="utf-8")
