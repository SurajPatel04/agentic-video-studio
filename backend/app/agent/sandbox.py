"""File tools for the component agent, locked to safe folders.

- Read / search:  rendering/src, rendering/examples, library, docs  (never .env, node_modules, out, audio)
- Write / edit:   this job's draft folder only (workspace/jobs/<job>/), small text files
- Delete:         only inside the draft folder

All paths are relative to the project root (e.g. "rendering/src/scenes/StepsScene.tsx").
"""

import fnmatch
import re
from pathlib import Path

from app.config import PROJECT_ROOT

READ_ROOTS = ["rendering/src", "rendering/examples", "library", "docs"]
DENY_PARTS = {"node_modules", ".git", "out", ".venv", "__pycache__", "tts"}
DENY_NAMES = re.compile(r"^\.env|secret|credential|\.pem$|\.key$", re.I)
WRITE_EXT = {".tsx", ".ts", ".json", ".md"}
MAX_READ_BYTES = 10_000
MAX_WRITE_BYTES = 80_000


class SandboxError(ValueError):
    pass


class Sandbox:
    def __init__(self, job_dir: Path):
        self.root = PROJECT_ROOT.resolve()
        self.job_dir = job_dir.resolve()
        self.job_dir.mkdir(parents=True, exist_ok=True)
        self.job_rel = self.job_dir.relative_to(self.root).as_posix()

    # --------------------------------------------------------------- path rules

    def _resolve(self, path: str) -> Path:
        p = (self.root / path.strip().lstrip("/")).resolve()
        if not p.is_relative_to(self.root):
            raise SandboxError(f"{path}: outside the project")
        rel = p.relative_to(self.root)
        if DENY_PARTS & set(rel.parts) or any(DENY_NAMES.search(part) for part in rel.parts):
            raise SandboxError(f"{path}: not allowed")
        return p

    def _readable(self, path: str) -> Path:
        p = self._resolve(path)
        rel = p.relative_to(self.root).as_posix()
        if not any(rel == r or rel.startswith(r + "/") for r in READ_ROOTS + [self.job_rel]):
            raise SandboxError(f"{path}: can only read {', '.join(READ_ROOTS)} and your draft folder {self.job_rel}")
        return p

    def _writable(self, path: str) -> Path:
        p = self._resolve(path)
        if not p.is_relative_to(self.job_dir):
            raise SandboxError(f"{path}: you can only write in your draft folder {self.job_rel}/")
        if p.suffix not in WRITE_EXT:
            raise SandboxError(f"{path}: only {', '.join(sorted(WRITE_EXT))} files")
        return p

    def rel(self, p: Path) -> str:
        return p.relative_to(self.root).as_posix()

    # -------------------------------------------------------------------- tools

    def list_dir(self, path: str) -> str:
        p = self._readable(path)
        if not p.is_dir():
            raise SandboxError(f"{path}: not a folder")
        items = []
        for c in sorted(p.iterdir()):
            if c.name in DENY_PARTS or DENY_NAMES.search(c.name):
                continue
            items.append(c.name + ("/" if c.is_dir() else f"  ({c.stat().st_size} B)"))
        return "\n".join(items) or "(empty)"

    def read_file(self, path: str, start_line: int | None = None, end_line: int | None = None) -> str:
        p = self._readable(path)
        if not p.is_file():
            raise SandboxError(f"{path}: no such file")
        lines = p.read_text(errors="replace").splitlines()
        a = max(1, start_line or 1)
        b = min(len(lines), end_line or (a + 159))
        out, size = [], 0
        for i in range(a - 1, b):
            line = f"{i + 1:5}| {lines[i]}"
            size += len(line)
            if size > MAX_READ_BYTES:
                out.append(f"... (cut; read from line {i + 1} with start_line)")
                break
            out.append(line)
        if b < len(lines) and size <= MAX_READ_BYTES:
            out.append(f"... (more; read from line {b + 1} with start_line)")
        return f"{self.rel(p)} ({len(lines)} lines)\n" + "\n".join(out)

    def write_file(self, path: str, content: str) -> str:
        p = self._writable(path)
        if len(content.encode()) > MAX_WRITE_BYTES:
            raise SandboxError("file too large")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return f"wrote {self.rel(p)} ({len(content.splitlines())} lines)"

    def edit_file(self, path: str, old_str: str, new_str: str) -> str:
        p = self._writable(path)
        if not p.is_file():
            raise SandboxError(f"{path}: no such file (use write_file first)")
        text = p.read_text()
        n = text.count(old_str)
        if n != 1:
            raise SandboxError(f"old_str found {n} times; it must match exactly once (include more surrounding lines)")
        p.write_text(text.replace(old_str, new_str, 1))
        return f"edited {self.rel(p)}"

    def delete_file(self, path: str) -> str:
        p = self._writable(path)
        if not p.is_file():
            raise SandboxError(f"{path}: no such file")
        p.unlink()
        return f"deleted {self.rel(p)}"

    def glob(self, pattern: str) -> str:
        hits = []
        for root in READ_ROOTS + [self.job_rel]:
            base = self.root / root
            for p in base.rglob("*"):
                rel = self.rel(p)
                if p.is_file() and not (DENY_PARTS & set(Path(rel).parts)) and fnmatch.fnmatch(rel, pattern if "/" in pattern else f"*{pattern}"):
                    hits.append(rel)
        return "\n".join(sorted(hits)[:200]) or "no files match"

    def grep(self, pattern: str, path: str = "rendering/src") -> str:
        try:
            rx = re.compile(pattern)
        except re.error as exc:
            raise SandboxError(f"bad regex: {exc}") from exc
        base = self._readable(path)
        files = [base] if base.is_file() else [p for p in base.rglob("*") if p.is_file() and p.suffix in {".ts", ".tsx", ".json", ".md", ".mjs"}]
        hits = []
        for f in files:
            if DENY_PARTS & set(f.relative_to(self.root).parts):
                continue
            for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
                if rx.search(line):
                    hits.append(f"{self.rel(f)}:{i}: {line.strip()[:200]}")
                    if len(hits) >= 120:
                        return "\n".join(hits) + "\n... (more; narrow the search)"
        return "\n".join(hits) or "no matches"
