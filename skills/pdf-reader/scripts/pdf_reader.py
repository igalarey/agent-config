#!/usr/bin/env python3
"""Bounded, read-only PDF inspection helper."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

MAX_PAGES = 100
MAX_TEXT_CHARS = 50_000
MAX_MATCHES = 100
MAX_RENDER_PAGES = 20
MAX_TOTAL_MEGAPIXELS = 40.0


def load_fitz():
    try:
        import fitz  # type: ignore
        return fitz
    except ImportError as error:
        raise RuntimeError("PyMuPDF is required. See the skill setup instructions; do not install it without authorization.") from error


def source_path(raw: str) -> Path:
    value = raw[1:] if raw.startswith("@") else raw
    result = Path(value).expanduser().resolve()
    if not result.is_file():
        raise ValueError(f"PDF file not found: {result}")
    if result.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a .pdf file: {result}")
    return result


def parse_pages(spec: str | None, page_count: int, limit: int = MAX_PAGES) -> list[int]:
    if page_count < 1:
        return []
    if not spec:
        return list(range(min(page_count, limit)))
    pages: set[int] = set()
    for token in spec.split(","):
        token = token.strip()
        match = re.fullmatch(r"(\d+)(?:-(\d+))?", token)
        if not match:
            raise ValueError(f"Invalid page range: {token}")
        first = int(match.group(1)); last = int(match.group(2) or first)
        if first < 1 or last < first or last > page_count:
            raise ValueError(f"Page range outside 1-{page_count}: {token}")
        pages.update(range(first - 1, last))
        if len(pages) > limit:
            raise ValueError(f"At most {limit} pages may be selected")
    return sorted(pages)


def bounded(text: str, maximum: int = MAX_TEXT_CHARS) -> tuple[str, bool]:
    lines = text.splitlines()
    output = "\n".join(lines[:2000])
    truncated = len(lines) > 2000 or len(output) > maximum
    if len(output) > maximum:
        output = output[:maximum]
    if truncated:
        output += "\n[Output truncated; select fewer pages.]"
    return output, truncated


def open_document(file: Path):
    fitz = load_fitz()
    document = fitz.open(file)
    if document.needs_pass:
        document.close()
        raise ValueError("Encrypted PDF requires a password; password handling is intentionally unsupported")
    return document


def info(file: Path) -> dict:
    document = open_document(file)
    try:
        metadata = {key: value for key, value in (document.metadata or {}).items() if value}
        sample_pages = parse_pages(None, document.page_count, min(3, document.page_count))
        text_pages = sum(bool(document.load_page(index).get_text("text").strip()) for index in sample_pages)
        return {"file": str(file), "pages": document.page_count, "metadata": metadata,
                "sample_text_pages": text_pages, "sampled_pages": len(sample_pages)}
    finally:
        document.close()


def extract(file: Path, page_spec: str | None) -> str:
    document = open_document(file)
    try:
        chunks = []
        for index in parse_pages(page_spec, document.page_count):
            chunks.append(f"\n--- Page {index + 1} ---\n{document.load_page(index).get_text('text').strip()}")
            if sum(map(len, chunks)) > MAX_TEXT_CHARS:
                break
        return bounded("\n".join(chunks).strip())[0]
    finally:
        document.close()


def search(file: Path, needle: str, page_spec: str | None, context: int) -> list[dict]:
    if not needle.strip():
        raise ValueError("Search text cannot be empty")
    document = open_document(file)
    matches: list[dict] = []
    try:
        for index in parse_pages(page_spec, document.page_count):
            text = document.load_page(index).get_text("text")
            lowered = text.casefold(); target = needle.casefold(); start = 0
            while len(matches) < MAX_MATCHES:
                found = lowered.find(target, start)
                if found < 0:
                    break
                lo = max(0, found - context); hi = min(len(text), found + len(needle) + context)
                matches.append({"page": index + 1, "text": re.sub(r"\s+", " ", text[lo:hi]).strip()})
                start = found + max(1, len(target))
            if len(matches) >= MAX_MATCHES:
                break
        return matches
    finally:
        document.close()


def default_render_dir(file: Path) -> Path:
    stat = file.stat()
    identity = f"{file}\0{stat.st_size}\0{stat.st_mtime_ns}".encode()
    return Path(tempfile.gettempdir()) / "agent-config-pdf" / hashlib.sha256(identity).hexdigest()[:16]


def render(file: Path, page_spec: str | None, dpi: int, output_dir: str | None) -> list[str]:
    if not 72 <= dpi <= 300:
        raise ValueError("DPI must be between 72 and 300")
    document = open_document(file)
    try:
        pages = parse_pages(page_spec, document.page_count, MAX_RENDER_PAGES)
        scale = dpi / 72.0
        total_pixels = sum(document.load_page(i).rect.width * scale * document.load_page(i).rect.height * scale for i in pages)
        if total_pixels > MAX_TOTAL_MEGAPIXELS * 1_000_000:
            raise ValueError(f"Rendering would exceed {MAX_TOTAL_MEGAPIXELS:g} megapixels; lower DPI or select fewer pages")
        destination = Path(output_dir).expanduser().resolve() if output_dir else default_render_dir(file)
        destination.mkdir(parents=True, exist_ok=True)
        outputs = []
        matrix = load_fitz().Matrix(scale, scale)
        for index in pages:
            target = destination / f"page-{index + 1}.png"
            document.load_page(index).get_pixmap(matrix=matrix, alpha=False).save(target)
            outputs.append(str(target))
        return outputs
    finally:
        document.close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Inspect local PDF documents without modifying them")
    commands = result.add_subparsers(dest="command", required=True)
    for name in ("info", "extract", "search", "render"):
        command = commands.add_parser(name)
        command.add_argument("pdf")
        if name in ("extract", "search", "render"):
            command.add_argument("--pages", help="One-based ranges such as 1-3,7")
        if name == "search":
            command.add_argument("query")
            command.add_argument("--context", type=int, default=120)
        if name == "render":
            command.add_argument("--dpi", type=int, default=144)
            command.add_argument("--output-dir")
    return result


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = parser().parse_args(argv)
    try:
        file = source_path(args.pdf)
        if args.command == "info": output = json.dumps(info(file), ensure_ascii=False, indent=2)
        elif args.command == "extract": output = extract(file, args.pages)
        elif args.command == "search":
            context = min(1000, max(0, args.context))
            output = json.dumps(search(file, args.query, args.pages, context), ensure_ascii=False, indent=2)
        else:
            output = json.dumps(render(file, args.pages, args.dpi, args.output_dir), ensure_ascii=False, indent=2)
        print(bounded(output)[0])
        return 0
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
