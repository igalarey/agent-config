#!/usr/bin/env python3
"""Fetch one bounded YouTube caption track through an existing yt-dlp executable."""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
MAX_TRANSCRIPT_CHARS = 48_000
MAX_TRANSCRIPT_LINES = 1_900
MAX_METADATA_BYTES = 5 * 1024 * 1024
MAX_CAPTION_BYTES = 20 * 1024 * 1024


def normalize_video(value: str) -> tuple[str, str]:
    value = value.strip()
    if VIDEO_ID.fullmatch(value):
        return value, f"https://www.youtube.com/watch?v={value}"
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise ValueError("Expected a YouTube URL or 11-character video ID")
    host = (parsed.hostname or "").lower()
    candidate = parsed.path.strip("/").split("/")[0] if host == "youtu.be" else parse_qs(parsed.query).get("v", [""])[0]
    if not VIDEO_ID.fullmatch(candidate):
        raise ValueError("YouTube URL does not contain a valid video ID")
    return candidate, f"https://www.youtube.com/watch?v={candidate}"


def choose_language(metadata: dict, preferences: list[str]) -> tuple[str, bool]:
    for automatic, key in ((False, "subtitles"), (True, "automatic_captions")):
        tracks = metadata.get(key) or {}
        for preference in preferences:
            if preference in tracks:
                return preference, automatic
            prefix = f"{preference.lower()}-"
            match = next((name for name in tracks if name.lower().startswith(prefix)), None)
            if match:
                return match, automatic
    raise ValueError(f"No captions found for requested languages: {', '.join(preferences)}")


def caption_entries(payload: dict) -> list[tuple[float, str]]:
    entries = []
    for event in payload.get("events") or []:
        segments = event.get("segs") or []
        text = "".join(str(segment.get("utf8") or "") for segment in segments)
        text = html.unescape(re.sub(r"\s+", " ", text)).strip()
        if text:
            entries.append((float(event.get("tStartMs") or 0) / 1000.0, text))
    return entries


def timestamp(seconds: float) -> str:
    total = max(0, int(seconds)); hours, rest = divmod(total, 3600); minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def bounded_entries(entries: list[tuple[float, str]], with_timestamps: bool) -> tuple[str, bool]:
    lines = [f"[{timestamp(at)}] {text}" if with_timestamps else text for at, text in entries]
    output = "\n".join(lines[:MAX_TRANSCRIPT_LINES])
    truncated = len(lines) > MAX_TRANSCRIPT_LINES or len(output) > MAX_TRANSCRIPT_CHARS
    if len(output) > MAX_TRANSCRIPT_CHARS:
        output = output[:MAX_TRANSCRIPT_CHARS]
    if truncated:
        output += "\n[Transcript truncated.]"
    return output, truncated


def run(command: list[str], timeout: int) -> str:
    try:
        result = subprocess.run(command, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"yt-dlp timed out after {timeout}s") from error
    if result.returncode != 0:
        message = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"yt-dlp failed: {message[:1000] or f'exit {result.returncode}'}")
    if len(result.stdout.encode("utf-8")) > MAX_METADATA_BYTES:
        raise RuntimeError("yt-dlp output exceeded the metadata limit")
    return result.stdout


def fetch(value: str, languages: list[str], with_timestamps: bool, timeout: int) -> dict:
    video_id, url = normalize_video(value)
    executable = shutil.which("yt-dlp")
    if not executable:
        raise RuntimeError("yt-dlp is not installed or not on PATH")
    common = [executable, "--no-warnings", "--no-playlist", "--skip-download", "--socket-timeout", str(min(timeout, 30))]
    metadata = json.loads(run([*common, "--dump-single-json", "--", url], timeout))
    language, automatic = choose_language(metadata, languages)
    with tempfile.TemporaryDirectory(prefix="agent-config-youtube-") as directory:
        template = str(Path(directory) / "%(id)s.%(ext)s")
        mode = "--write-auto-subs" if automatic else "--write-subs"
        run([*common, mode, "--sub-langs", language, "--sub-format", "json3", "--output", template, "--", url], timeout)
        candidates = list(Path(directory).glob("*.json3"))
        if len(candidates) != 1:
            raise RuntimeError("yt-dlp did not produce exactly one JSON3 caption file")
        if candidates[0].stat().st_size > MAX_CAPTION_BYTES:
            raise RuntimeError("Caption file exceeded the download limit")
        payload = json.loads(candidates[0].read_text(encoding="utf-8"))
    transcript, truncated = bounded_entries(caption_entries(payload), with_timestamps)
    return {"id": video_id, "url": url, "title": metadata.get("title") or video_id, "language": language,
            "automatic": automatic, "truncated": truncated, "transcript": transcript}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Fetch one YouTube caption track")
    result.add_argument("video")
    result.add_argument("--languages", default="en", help="Comma-separated preference order")
    result.add_argument("--timestamps", action="store_true")
    result.add_argument("--json", action="store_true")
    result.add_argument("--timeout", type=int, default=45)
    return result


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = parser().parse_args(argv)
    try:
        languages = [item.strip() for item in args.languages.split(",") if re.fullmatch(r"[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)?", item.strip())]
        if not languages:
            raise ValueError("At least one valid language code is required")
        if not 5 <= args.timeout <= 120:
            raise ValueError("Timeout must be between 5 and 120 seconds")
        result = fetch(args.video, languages, args.timestamps, args.timeout)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"# {result['title']}\nLanguage: {result['language']} ({'automatic' if result['automatic'] else 'manual'})\n\n{result['transcript']}")
        return 0
    except (ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
