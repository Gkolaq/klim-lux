import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verify_source', Path(__file__).resolve().parents[1] / 'scripts/verify-source.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class SourceProvenance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        (self.repo / '.openai').mkdir()
        (self.repo / '.openai/hosting.json').write_text(json.dumps({'project_id': 'test-project'}))
        self.git('init', '-q')
        self.git('add', '.')
        self.git('-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-qm', 'Fixture')
        self.commit = self.git('rev-parse', 'HEAD').strip()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.repo, capture_output=True, text=True, check=True).stdout

    def test_exact_clean_published_source_passes(self):
        self.assertTrue(source.verify_source(self.repo, 'test-project', self.commit)['ok'])

    def test_stale_checkout_cannot_be_reported_as_current(self):
        result = source.verify_source(self.repo, 'test-project', 'f' * 40)
        self.assertFalse(result['ok'])
        self.assertIn('head_mismatch', result['issues'])

    def test_changed_tracked_and_untracked_source_are_rejected(self):
        (self.repo / 'uncommitted.ts').write_text('export const changed = true;')
        self.assertIn('working_tree_changed', source.verify_source(self.repo, 'test-project', self.commit)['issues'])
        (self.repo / 'uncommitted.ts').unlink()
        (self.repo / '.openai/hosting.json').write_text(json.dumps({'project_id': 'another-project'}))
        result = source.verify_source(self.repo, 'test-project', self.commit)
        self.assertTrue({'working_tree_changed', 'project_mismatch'} <= set(result['issues']))

    def test_other_site_or_missing_native_commit_cannot_pass(self):
        self.assertIn('project_mismatch', source.verify_source(self.repo, 'another-project', self.commit)['issues'])
        self.assertIn('invalid_expected_commit', source.verify_source(self.repo, 'test-project', '')['issues'])
