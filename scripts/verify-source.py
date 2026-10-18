#!/usr/bin/env python3
"""Reject an audit of a different checkout than the native published source.

Read project/commit from the current native Site and successful deployment first.
This command validates that evidence against the local checkout; it never guesses
the publication from a cached file or treats a saved version as a live release.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess


def verify_source(repo, expected_project, expected_commit):
    result = {'expected_project': expected_project, 'expected_commit': expected_commit, 'issues': []}
    if not re.fullmatch(r'[0-9a-f]{40}', expected_commit):
        result['issues'].append('invalid_expected_commit')
    try:
        manifest = json.loads((repo / '.openai/hosting.json').read_text())
        result['project_id'] = manifest.get('project_id')
        if result['project_id'] != expected_project:
            result['issues'].append('project_mismatch')
    except (OSError, ValueError, AttributeError):
        result['issues'].append('hosting_manifest_invalid')
    try:
        head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()
        changed = subprocess.run(['git', 'status', '--porcelain'], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()
        result['head'] = head
        result['working_tree_clean'] = not changed
        if head != expected_commit:
            result['issues'].append('head_mismatch')
        if changed:
            result['issues'].append('working_tree_changed')
    except (OSError, subprocess.CalledProcessError):
        result['issues'].append('git_unavailable')
    result['ok'] = not result['issues']
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-id', required=True, help='Exact project ID from native Sites.')
    parser.add_argument('--published-commit', required=True, help='Exact source commit of the successful current publication.')
    args = parser.parse_args(argv)
    result = verify_source(Path(__file__).resolve().parents[1], args.project_id, args.published_commit)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
