import tempfile
import unittest
from pathlib import Path

from judgeagent.judge_agent.analysis.prompt_regression import compare_prompt_runs
from judgeagent.reference.agent.weblog_agent.fixtures import fixtures
from judgeagent.reference.agent.weblog_agent.graph import WebLogAnalysisAgent
from judgeagent.reference.agent.weblog_agent.trace import TraceLogger


class PromptRegressionTest(unittest.TestCase):
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

    def test_no_regression_for_same_passing_trace(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            baseline = self._run_fixture("normal-login-error-spike", root)
            candidate = self._run_fixture("normal-login-error-spike", root / "candidate")
            result = compare_prompt_runs(baseline, candidate)
            self.assertFalse(result.findings)
            self.assertEqual(result.summary.regressionScore, 100)
            self.assertFalse(result.summary.gateRegressed)

    def test_detects_prompt_output_regression(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            baseline = self._run_fixture("normal-login-error-spike", root)
            candidate = self._run_fixture("drift-prompt-output-contract", root)
            result = compare_prompt_runs(baseline, candidate)
            metrics = [finding.metric for finding in result.findings]
            self.assertIn("gate_regression", metrics)
            self.assertIn("new_high_severity_findings", metrics)
            self.assertIn("prompt_version_regression_score", metrics)
            self.assertTrue(result.summary.gateRegressed)
            self.assertLess(result.summary.regressionScore, 85)

    def test_detects_validation_path_regression(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            baseline = self._run_fixture("normal-login-error-spike", root)
            candidate = self._run_fixture("drift-validation-skipped", root)
            result = compare_prompt_runs(baseline, candidate)
            metrics = [finding.metric for finding in result.findings]
            self.assertIn("gate_regression", metrics)
            self.assertIn("tool_and_output_stability_score", metrics)
            self.assertEqual(result.candidate.gate, "block")


if __name__ == "__main__":
    unittest.main()
