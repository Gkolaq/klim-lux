import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_smoke', Path(__file__).resolve().parents[1] / 'scripts/release-smoke.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)


def page(path, extra=''):
    return (f'<html lang="{path.split("/")[1]}"><link rel="canonical" href="{release.ORIGIN + path}">'
            f'<h1>Page</h1><nav id="mobile-nav"></nav>{extra}</html>').encode()


class ReleaseChecks(unittest.TestCase):
    def check(self, path, body, status=200, final_url=None):
        return release.check_response(path, status, final_url or release.ORIGIN + path, body)

    def test_healthy_page(self):
        self.assertTrue(self.check('/pl/', page('/pl/'))['ok'])

    def test_http_error_is_not_hidden_by_valid_body(self):
        self.assertIn('http_not_200', self.check('/pl/', page('/pl/'), status=503)['issues'])

    def test_signin_or_wrong_origin_redirect_fails(self):
        self.assertIn('unexpected_redirect', self.check('/pl/', page('/pl/'), final_url='https://chatgpt.com/')['issues'])

    def test_canonical_language_and_navigation_failures(self):
        result = self.check('/pl/', b'<html lang="ru"><h1>Page</h1></html>')
        self.assertEqual(set(result['issues']), {'html_language', 'canonical_mismatch', 'mobile_navigation_missing'})

    def test_draft_contact_mode_fails(self):
        form = '<form id="contact-form" data-delivery="draft"><input name="name" required><input name="contact" required><textarea name="message" required></textarea></form>'
        self.assertIn('contact_not_server', self.check('/pl/contacts/', page('/pl/contacts/', form))['issues'])

    def test_healthy_contact_and_missing_required_field(self):
        form = '<form id="contact-form" data-delivery="server"><input name="name" required><input name="contact" required><textarea name="message" required></textarea></form>'
        self.assertTrue(self.check('/ru/contacts/', page('/ru/contacts/', form))['ok'])
        broken = form.replace('name="contact" required', 'name="contact"')
        self.assertIn('required_contact_fields_missing', self.check('/ru/contacts/', page('/ru/contacts/', broken))['issues'])

    def test_photo_controls_required(self):
        for locale in ('pl', 'ru', 'en'):
            path = f'/{locale}/portfolio/987/'
            self.assertIn('photo_controls_missing', self.check(path, page(path))['issues'])
            self.assertTrue(self.check(path, page(path, '<a id="open-photo-viewer"></a><dialog id="photo-viewer"></dialog>'))['ok'])

    def test_noindex_is_a_release_failure(self):
        self.assertIn('unexpected_noindex', self.check('/en/', page('/en/', '<meta name="robots" content="noindex,follow">'))['issues'])

    def test_only_current_same_origin_same_locale_work_links_are_selected(self):
        links = ('<a href="https://foreign.example/en/portfolio/303/">foreign</a>'
                 '<a href="/ru/portfolio/303/">another language</a>'
                 '<a href="/en/portfolio/303/?preview=1">preview</a>'
                 '<a href="/en/portfolio/987/">current visible work</a>')
        result = self.check('/en/', page('/en/', links))
        self.assertEqual(result['visible_work'], '/en/portfolio/987/')

    def test_balanced_locales_follow_current_work_without_hardcoded_photo(self):
        def respond(path):
            result = {'path': path, 'status': 200, 'ok': True, 'issues': []}
            if path in ('/pl/', '/ru/', '/en/'):
                result['visible_work'] = path + 'portfolio/987/'
            return result
        with patch.object(release, 'probe', side_effect=respond) as probe, patch('builtins.print'):
            self.assertEqual(release.main([]), 0)
        paths = {call.args[0] for call in probe.call_args_list}
        for locale in ('pl', 'ru', 'en'):
            self.assertTrue({f'/{locale}/', f'/{locale}/contacts/', f'/{locale}/portfolio/987/'} <= paths)
        self.assertNotIn('/pl/portfolio/303/', paths)

    def test_absent_work_is_recorded_without_requesting_removed_photo(self):
        def respond(path):
            return {'path': path, 'status': 200, 'ok': True, 'issues': []}
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'probe', side_effect=respond) as probe, patch('builtins.print'):
            output = Path(temp) / 'result.json'
            self.assertEqual(release.main(['--output', str(output)]), 0)
            result = json.loads(output.read_text())
            self.assertEqual({x['locale'] for x in result['skipped']}, {'pl', 'ru', 'en'})
            self.assertTrue(all('/portfolio/' not in call.args[0] for call in probe.call_args_list))

    def test_health_requires_both_stores(self):
        for checks in ({'content': False, 'files': True}, {'content': True, 'files': False}, {'content': 'true', 'files': True}):
            body = json.dumps({'status': 'ok', 'checks': checks}).encode()
            self.assertIn('storage_unhealthy', self.check('/api/health/', body)['issues'])
        body = b'{"status":"ok","checks":{"content":true,"files":true}}'
        self.assertTrue(self.check('/api/health/', body)['ok'])

    def test_invalid_health_json_and_non_object_fail(self):
        self.assertIn('invalid_health_json', self.check('/api/health/', b'<html>Error</html>')['issues'])
        self.assertFalse(self.check('/api/health/', b'[]')['ok'])

    def test_failed_probe_returns_nonzero_without_further_requests(self):
        failed = {'path': '/api/health/', 'status': 503, 'ok': False, 'issues': ['storage_unhealthy']}
        with tempfile.TemporaryDirectory() as temp, patch.object(release, 'probe', side_effect=lambda path: {**failed, 'path': path}) as probe, patch('builtins.print'):
            output = Path(temp) / 'result.json'
            self.assertEqual(release.main(['--output', str(output)]), 1)
            self.assertEqual({call.args[0] for call in probe.call_args_list}, set(release.ROUTES))
            self.assertFalse(json.loads(output.read_text())['ok'])


if __name__ == '__main__':
    unittest.main()
