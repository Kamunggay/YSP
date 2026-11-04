"""Exercise the workflow's actual inline evaluator without third-party packages."""

import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/mvp-scaffold-ci.yml"
EXPECTED = (
    "frontend-quality",
    "frontend-build",
    "backend-quality",
    "dependency-security",
    "runtime-integration",
)


class FinalResultTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        final_job = workflow.split("\n  ci-result:\n", 1)[1]
        cls.evaluator = textwrap.dedent(
            final_job.split("python3 - <<'PY'\n", 1)[1].split("          PY\n", 1)[0]
        )

    def evaluate(self, payload):
        env = {key: value for key, value in os.environ.items() if key != "NEEDS_JSON"}
        if payload is not None:
            env["NEEDS_JSON"] = payload
        return subprocess.run(
            [sys.executable, "-c", self.evaluator],
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
        )

    def successful_results(self):
        return {job: {"result": "success", "outputs": {}} for job in EXPECTED}

    def test_all_five_successful_results_pass(self):
        result = self.evaluate(json.dumps(self.successful_results()))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_each_expected_job_is_required(self):
        for job in EXPECTED:
            with self.subTest(job=job):
                needs = self.successful_results()
                del needs[job]
                self.assertNotEqual(self.evaluate(json.dumps(needs)).returncode, 0)

    def test_each_job_rejects_every_nonpassing_result(self):
        for job in EXPECTED:
            for state in ("failure", "cancelled", "skipped", "unknown", "Success", "", None, True, 1):
                with self.subTest(job=job, state=state):
                    needs = self.successful_results()
                    needs[job]["result"] = state
                    self.assertNotEqual(self.evaluate(json.dumps(needs)).returncode, 0)

    def test_missing_and_malformed_inputs_fail(self):
        for payload in (None, "", "{", "null", "[]", "true", '"success"', "{}"):
            with self.subTest(payload=payload):
                self.assertNotEqual(self.evaluate(payload).returncode, 0)

    def test_malformed_job_results_fail(self):
        for job in EXPECTED:
            for value in ({}, {"outputs": {}}, None, [], "success", 1):
                with self.subTest(job=job, value=value):
                    needs = self.successful_results()
                    needs[job] = value
                    self.assertNotEqual(self.evaluate(json.dumps(needs)).returncode, 0)

    def test_duplicate_job_ids_fail(self):
        needs = json.dumps(self.successful_results())
        payload = '{"frontend-quality":{"result":"failure"},' + needs[1:]
        self.assertNotEqual(self.evaluate(payload).returncode, 0)

    def test_non_json_numeric_constants_fail(self):
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant):
                payload = json.dumps(self.successful_results()).replace('"outputs": {}', '"outputs": ' + constant, 1)
                self.assertNotEqual(self.evaluate(payload).returncode, 0)


if __name__ == "__main__":
    unittest.main()
