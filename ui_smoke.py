"""UI smoke test for learn-m using Playwright sync API."""

from __future__ import annotations

import json
import threading
import http.server
import functools
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def main() -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        page.goto(f"http://127.0.0.1:{port}/?NODEMO", wait_until="networkidle")
        page.wait_for_selector("#terminal-input")

        page.fill("#terminal-input", 'West = Table.SelectRows(Sales, each [Region] = "West")')
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)

        row_meta = page.locator("#table-wrap .grid-meta").inner_text()
        steps = page.locator(".step-node").count()
        code = page.locator("#code-out").inner_text()

        page.click("[data-action='levels']")
        page.click("[data-level='table-2']")
        page.wait_for_timeout(150)
        title = page.locator("#level-title").inner_text()
        page.fill("#terminal-input", 'West = Table.SelectRows(Sales, each [Region] = "West")')
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        win_visible = page.locator("#win-banner").is_visible()

        page.screenshot(path=str(ROOT / "ui-smoke.png"), full_page=True)
        browser.close()

    server.shutdown()

    report = {
        "row_meta": row_meta,
        "steps": steps,
        "code": code,
        "title": title,
        "win_visible": win_visible,
        "errors": errors,
    }
    print(json.dumps(report, indent=2))

    assert "3 rows" in row_meta, row_meta
    assert steps >= 2, steps
    assert "SelectRows" in code
    assert win_visible, "win banner not shown"
    assert not errors, errors
    print("ui-smoke ok")


if __name__ == "__main__":
    main()
