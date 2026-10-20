"""Dependency-free bootstrap hygiene, not application or conformance testing."""

from pathlib import Path
import re
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    required = (
        "README.md", "LICENSE", "SECURITY.md", ".github/CODEOWNERS",
        ".github/dependabot.yml", ".github/pull_request_template.md",
        ".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/proposal.yml",
        ".github/ISSUE_TEMPLATE/config.yml", ".github/workflows/hygiene.yml",
    )
    errors = [f"Missing required file: {name}" for name in required
              if not (root / name).is_file()]
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=root
    ).decode("utf-8").split("\0")
    count = 0
    for name in filter(None, tracked):
        path = root / name
        if path.is_dir():
            continue
        count += 1
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            errors.append(f"{name}: expected UTF-8 bootstrap text")
            continue
        if text and not text.endswith("\n"):
            errors.append(f"{name}: missing final newline")
        for number, line in enumerate(text.splitlines(), 1):
            if line.rstrip() != line:
                errors.append(f"{name}:{number}: trailing whitespace")
        if path.suffix == ".md":
            for target in re.findall(r"\[[^\]]*\]\(([^)\s]+)\)", text):
                if "://" in target or target.startswith(("#", "mailto:")):
                    continue
                local = target.split("#", 1)[0]
                if local and not (path.parent / local).exists():
                    errors.append(f"{name}: broken local link {target}")
        if name.startswith(".github/workflows/"):
            for action in re.findall(r"^\s*uses:\s*(\S+)", text, re.MULTILINE):
                if not re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", action):
                    errors.append(f"{name}: action must use full commit SHA: {action}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Repository hygiene passed: {count} tracked files; required files, "
          "UTF-8, whitespace, local Markdown links and action pins checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
