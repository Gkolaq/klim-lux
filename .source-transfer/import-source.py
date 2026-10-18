#!/usr/bin/env python3
"""One-shot, bounded v41 source import. No Sites history or application execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
import zipfile

REPOSITORY = "Gkolaq/klim-lux"
REMOTE = "https://github.com/" + REPOSITORY + ".git"
TARGET = "recovery/klim-lux-2-20261016"
TRANSPORT = "transport/klim-v41-20261017"
PARENT = "7e250b8cd5e01209dd2fd7f4c1ab3ebde0c669c5"
MAIN = "87fbd9147837cd7151896015af22c682cb560fb7"
TREE = "28cfad0d37cfaa6eeaead9cc18b436db23d7b8c6"
SOURCE = "09e1674048ca63452a6db7c7f779dc700ab4fd35"
PROJECT = "appgprj_6ac13fc8d10481918e5df6e700854015"
ARCHIVE_SHA = "1e7546c7836e9c82b27b5117dfc122cba2fcd702ab8523d695d871291b3782f5"
ARCHIVE_BYTES, SOURCE_BYTES, FILES = 68618522, 69894145, 1073
CHUNK_BYTES, CHUNKS = 23068672, 3


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(*args, cwd=None, data=None, env=None):
    return subprocess.check_output(
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", *args],
        cwd=cwd, input=data, env=env, stderr=subprocess.PIPE,
    ).decode("utf-8").strip()


def checked_name(name):
    require(name and not any(ord(c) < 32 for c in name), "Control character in archive path")
    require("\\" not in name and not name.startswith("/"), "Non-relative archive path")
    path = PurePosixPath(name)
    require(all(p not in ("", ".", "..") and p.casefold() != ".git" for p in path.parts),
            "Unsafe archive component")
    require(str(path) == name.rstrip("/"), "Non-canonical archive path")
    return path


def validate_archive(archive, destination):
    require(archive.stat().st_size == ARCHIVE_BYTES, "Archive size mismatch")
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA, "Archive SHA mismatch")
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        require(len(entries) <= 1200, "Excess archive entries")
        seen, files, total = set(), [], 0
        for item in entries:
            path = checked_name(item.filename)
            require(str(path) not in seen, "Duplicate archive path")
            seen.add(str(path))
            kind = stat.S_IFMT(item.external_attr >> 16)
            require(kind in (0, stat.S_IFDIR if item.is_dir() else stat.S_IFREG), "Non-regular ZIP entry")
            require(not (item.flag_bits & 1), "Encrypted archive entry")
            if not item.is_dir():
                files.append((item, path))
                total += item.file_size
        require(len(files) == FILES and total == SOURCE_BYTES, "Archive content bounds mismatch")
        for item, path in files:
            out = destination.joinpath(*path.parts)
            out.parent.mkdir(parents=True, exist_ok=True)
            with package.open(item) as source, out.open("xb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)
            require(out.stat().st_size == item.file_size, "Extracted size mismatch")
            out.chmod(0o644)
    hosting = json.loads((destination / ".openai/hosting.json").read_text())
    require(PROJECT in json.dumps(hosting), "Sites project mismatch")
    return sorted(str(path) for _, path in files)


def build_index(repository, paths):
    git("read-tree", "--empty", cwd=repository)
    blob_ids = git("hash-object", "-w", "--no-filters", "--stdin-paths", cwd=repository,
                   data=("\n".join(paths) + "\n").encode()).splitlines()
    require(len(blob_ids) == FILES and all(re.fullmatch(r"[0-9a-f]{40}", s) for s in blob_ids),
            "Git blob count mismatch")
    index = b"".join(("100644 " + sha + "\t" + path + "\0").encode()
                     for path, sha in zip(paths, blob_ids))
    git("update-index", "-z", "--index-info", cwd=repository, data=index)
    tree = git("write-tree", cwd=repository)
    require(tree == TREE, "Public Git tree mismatch")
    require(len(git("ls-files", cwd=repository).splitlines()) == FILES, "Index file count mismatch")
    return tree


def remote_refs():
    refs = git("ls-remote", "--refs", REMOTE, "refs/heads/main", "refs/heads/" + TARGET,
               "refs/heads/" + TRANSPORT)
    return {line.split("\t")[1]: line.split("\t")[0] for line in refs.splitlines()}


def require_parent(actual):
    require(actual == PARENT, "Recovery branch advanced: stop without overwriting")


def prepare_archive(transport, output):
    manifest = json.loads((transport / ".source-transfer/manifest.json").read_text())
    expected = {
        "repository": REPOSITORY, "target_branch": TARGET, "transport_branch": TRANSPORT,
        "expected_github_parent": PARENT, "expected_main": MAIN, "public_tree": TREE,
        "source_commit": SOURCE, "source_version": 41, "archive_sha256": ARCHIVE_SHA,
        "archive_bytes": ARCHIVE_BYTES, "uncompressed_bytes": SOURCE_BYTES,
        "tracked_files": FILES, "chunk_size": CHUNK_BYTES, "chunks": CHUNKS,
        "contains_git_history_or_runtime_data": False,
    }
    require(all(manifest.get(k) == v for k, v in expected.items()), "Transfer manifest mismatch")
    parts = transport / ".source-transfer"
    names = [f"bulk{n:04d}.part" for n in range(CHUNKS)]
    require(sorted(p.name for p in parts.glob("bulk*.part")) == names, "Missing or extra transfer parts")
    with output.open("xb") as joined:
        for number, name in enumerate(names):
            part = parts / name
            require(part.is_file() and not part.is_symlink(), "Invalid transfer part")
            expected_size = min(CHUNK_BYTES, ARCHIVE_BYTES - number * CHUNK_BYTES)
            require(part.stat().st_size == expected_size, "Transfer part size mismatch")
            with part.open("rb") as incoming:
                shutil.copyfileobj(incoming, joined, length=1024 * 1024)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--parent-repository", type=Path)
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="klim-source-import-") as temporary:
        root = Path(temporary)
        checkout = root / "source"
        if arguments.validate_only:
            require(arguments.archive is not None and arguments.parent_repository is not None,
                    "Local validation needs archive and parent repository")
            require_parent(git("rev-parse", "HEAD", cwd=arguments.parent_repository))
            git("cat-file", "-e", MAIN + "^{commit}", cwd=arguments.parent_repository)
            checkout.mkdir()
            git("init", "--quiet", cwd=checkout)
            archive = arguments.archive
        else:
            require(arguments.archive is None and arguments.parent_repository is None,
                    "Remote run rejects local override arguments")
            require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "Unexpected repository")
            require(os.environ.get("GITHUB_EVENT_NAME") == "push", "Unexpected event")
            require(os.environ.get("GITHUB_REF") == "refs/heads/" + TRANSPORT, "Unexpected branch")
            seed = os.environ.get("GITHUB_SHA", "")
            require(re.fullmatch(r"[0-9a-f]{40}", seed), "Invalid transport commit")
            transport = Path(__file__).resolve().parent.parent
            require(git("rev-parse", "HEAD", cwd=transport) == seed, "Transport checkout changed")
            before = remote_refs()
            require_parent(before.get("refs/heads/" + TARGET))
            require(before.get("refs/heads/main") == MAIN, "Main changed: stop")
            require(before.get("refs/heads/" + TRANSPORT) == seed, "Transport branch changed")
            archive = root / "source.zip"
            prepare_archive(transport, archive)
            git("clone", "--no-checkout", "--single-branch", "--branch", TARGET, REMOTE, str(checkout))
            require_parent(git("rev-parse", "HEAD", cwd=checkout))

        paths = validate_archive(archive, checkout)
        tree = build_index(checkout, paths)
        proof = {"status": "VALIDATED", "source_version": 41, "source_commit": SOURCE,
                 "public_tree": tree, "files": FILES, "archive_sha256": ARCHIVE_SHA,
                 "github_parent": PARENT, "target_branch": TARGET, "main_preserved": MAIN}
        if not arguments.validate_only:
            identity = os.environ.copy()
            identity.update({"GIT_AUTHOR_NAME": "Klim-Lux Engineering",
                             "GIT_COMMITTER_NAME": "Klim-Lux Engineering",
                             "GIT_AUTHOR_EMAIL": "49121975+Gkolaq@users.noreply.github.com",
                             "GIT_COMMITTER_EMAIL": "49121975+Gkolaq@users.noreply.github.com"})
            message = ("Import verified Klim-Lux Sites v41 source\n\n"
                       "Sites source: " + SOURCE + "\n"
                       "1073 reviewed files; seven operational documents sanitized.\n"
                       "Single GitHub parent; no private Sites Git ancestry or runtime data.\n")
            commit = git("commit-tree", tree, "-p", PARENT, cwd=checkout,
                         data=message.encode(), env=identity)
            # Ordinary non-force push rejects any branch divergence after the initial guard.
            git("push", "--porcelain", "origin", commit + ":refs/heads/" + TARGET, cwd=checkout)
            after = remote_refs()
            require(after.get("refs/heads/" + TARGET) == commit, "Recovery readback mismatch")
            require(after.get("refs/heads/main") == MAIN, "Main readback mismatch")
            require(git("rev-list", "--parents", "-n", "1", commit, cwd=checkout) == commit + " " + PARENT,
                    "Imported commit ancestry mismatch")
            # Keep transport evidence until independent remote commit/tree/blob readback succeeds.
            # This job never deletes a ref. Later cleanup needs its own guarded, supported action.
            proof.update(status="IMPORTED", github_commit=commit,
                         transport_cleanup="PENDING_INDEPENDENT_READBACK")
        result = json.dumps(proof, sort_keys=True)
        print(result)
        if not arguments.validate_only and os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
                summary.write("```json\n" + result + "\n```\n")


if __name__ == "__main__":
    main()
