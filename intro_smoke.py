"""Verify intro modal buttons render with visible labels."""

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
    threading.Thread(target=server.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page()
        page.goto(f"http://127.0.0.1:{port}/?NODEMO", wait_until="networkidle")
        page.wait_for_timeout(300)
        # intro should be open on first load
        sandbox = page.locator("#intro-sandbox")
        levels = page.locator("#intro-levels")
        if not sandbox.is_visible():
            page.click("[data-action='intro']")
            page.wait_for_timeout(200)
        report = {
            "sandbox_text": sandbox.inner_text(),
            "levels_text": levels.inner_text(),
            "sandbox_visible": sandbox.is_visible(),
            "levels_visible": levels.is_visible(),
            "sandbox_bg": sandbox.evaluate("el => getComputedStyle(el).backgroundColor"),
            "levels_bg": levels.evaluate("el => getComputedStyle(el).backgroundColor"),
            "sandbox_color": sandbox.evaluate("el => getComputedStyle(el).color"),
        }
        page.screenshot(path=str(ROOT / "ui-smoke.png"), full_page=True)
        # click Open levels
        levels.click()
        page.wait_for_timeout(200)
        report["levels_modal"] = page.locator("#modal").is_visible()
        browser.close()

    server.shutdown()
    print(json.dumps(report, indent=2))
    assert report["sandbox_visible"] and report["levels_visible"]
    assert report["sandbox_text"].strip() == "Sandbox"
    assert report["levels_text"].strip() == "Open levels"
    # labels must not be white-on-white
    assert report["sandbox_color"] != "rgb(255, 255, 255)" or report["sandbox_bg"] not in ("rgba(0, 0, 0, 0)", "rgb(255, 255, 255)")
    assert report["levels_modal"]
    print("intro-buttons ok")


if __name__ == "__main__":
    main()
