import json
import tempfile
import unittest
from pathlib import Path

from judgeagent.judge_agent.analysis.analyzer import analyze_trace
from judgeagent.reference.agent.weblog_agent.fixtures import fixtures
from judgeagent.reference.agent.weblog_agent.graph import WebLogAnalysisAgent
from judgeagent.reference.agent.weblog_agent.trace import TraceLogger


class PromptInstructionMetricsTest(unittest.TestCase):
    def _run_fixture(self, fixture_id: str, root: Path) -> Path:
        fx = fixtures()[fixture_id]
        trace_path = root / f"{fixture_id}.jsonl"
        logger = TraceLogger(trace_path, run_id=fixture_id)
        try:
            agent = WebLogAnalysisAgent(logger, fault=fx.fault, use_llm=False)
            agent.run(fx.user_input, str(fx.access_log_path))
        finally:
            logger.close()
        return trace_path

    def test_normal_fixture_emits_prompt_metrics_without_findings(self):
        with tempfile.TemporaryDirectory() as td:
            trace = self._run_fixture("normal-login-error-spike", Path(td))
            events = [json.loads(line) for line in trace.read_text(encoding="utf-8").splitlines()]
            prompt_events = [event for event in events if event.get("type") == "prompt_instruction_metrics"]
            self.assertEqual(len(prompt_events), 1)
            prompt_event = prompt_events[0]
            self.assertTrue(prompt_event["prompt_template"]["present"])
            self.assertEqual(prompt_event["instruction_adherence"]["score"], 1.0)
            self.assertTrue(prompt_event["output_format"]["compliant"])

            result = analyze_trace(trace)
            self.assertNotIn("instruction_adherence_score", [f.metric for f in result.findings])
            self.assertNotIn("output_format_compliance", [f.metric for f in result.findings])
            self.assertNotIn("prompt_template_version_present", [f.metric for f in result.findings])

    def test_prompt_output_contract_fixture_creates_prompt_instruction_findings(self):
        with tempfile.TemporaryDirectory() as td:
            trace = self._run_fixture("drift-prompt-output-contract", Path(td))
            result = analyze_trace(trace)
            metrics = [finding.metric for finding in result.findings]
            self.assertIn("instruction_adherence_score", metrics)
            self.assertIn("output_format_compliance", metrics)
            self.assertIn("output_contract_compliance", metrics)
            self.assertNotIn("prompt_template_version_present", metrics)


if __name__ == "__main__":
    unittest.main()
