#!/usr/bin/env python3
"""
AcaClaw docs preview server.
Renders Jekyll Markdown files (with front matter) as HTML and serves them locally.
Usage: python3 preview.py [port]
"""
import sys
import os
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import frontmatter
import markdown

DOCS_DIR = Path(__file__).parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000

# Read i18n data files
import yaml

def load_i18n():
    data = {}
    for lang_file in (DOCS_DIR / "_data" / "i18n").glob("*.yml"):
        lang = lang_file.stem
        with open(lang_file) as f:
            data[lang] = yaml.safe_load(f)
    return data

I18N = load_i18n()

CSS_PATH = DOCS_DIR / "assets" / "css" / "style.css"

def render_page(md_path: Path) -> str:
    post = frontmatter.load(md_path)
    lang = post.get("lang", "en")
    t = I18N.get(lang, I18N.get("en", {}))
    nav = t.get("nav", [])
    strings = t.get("strings", {})
    title = post.get("title", "AcaClaw")
    page_url = post.get("permalink", "/")

    # Fix relative_url filters in content — extract the path, don't erase it
    content_md = post.content
    content_md = re.sub(
        r"\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}",
        lambda m: m.group(1),
        content_md,
    )
    content_md = re.sub(
        r'\{\{\s*"([^"]+)"\s*\|\s*relative_url\s*\}\}',
        lambda m: m.group(1),
        content_md,
    )
    # Strip any remaining {{ }} and {% %} liquid tags
    content_md = re.sub(r"\{\{[^}]*\}\}", "", content_md)
    content_md = re.sub(r"\{%.*?%\}", "", content_md)

    body_html = markdown.markdown(
        content_md,
        extensions=["tables", "fenced_code", "codehilite", "toc", "nl2br"],
    )

    # Build nav HTML
    nav_html = ""
    for item in nav:
        active = " active" if item.get("url") == page_url else ""
        nav_html += f'<a href="{item["url"]}" class="sidebar-link{active}">{item["title"]}</a>\n'

    switch_lang = strings.get("switch_lang", "EN")
    switch_url = strings.get("switch_lang_url", "/en/")

    css = CSS_PATH.read_text()

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — AcaClaw</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo/AcaClaw.svg">
  <style>{css}</style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="/en/" class="site-logo">
        <img src="/assets/logo/AcaClaw.svg" alt="AcaClaw" class="site-logo-img">
        AcaClaw
      </a>
      <nav class="header-nav">
        <a href="https://github.com/acaclaw/acaclaw" class="nav-link" target="_blank">GitHub</a>
        <a href="{switch_url}" class="lang-switch">{switch_lang}</a>
        <button class="theme-toggle" id="theme-toggle" title="Toggle dark/light mode" aria-label="Toggle dark/light mode">🌙</button>
      </nav>
    </div>
  </header>  <script>
    (function() {{
      var saved = localStorage.getItem('acaclaw-theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = saved || (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);

      function updateIcon(t) {{
        var btn = document.getElementById('theme-toggle');
        if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
      }}

      updateIcon(theme);

      document.addEventListener('DOMContentLoaded', function() {{
        updateIcon(document.documentElement.getAttribute('data-theme'));
        document.getElementById('theme-toggle').addEventListener('click', function() {{
          var current = document.documentElement.getAttribute('data-theme');
          var next = current === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('acaclaw-theme', next);
          updateIcon(next);
        }});
      }});
    }})();
  </script>
  <div class="site-wrapper">
    <aside class="sidebar">
      <nav class="sidebar-nav">
        {nav_html}
      </nav>
    </aside>
    <main class="content">
      <article class="page-content">
        {body_html}
      </article>
    </main>
  </div>
  <footer class="site-footer">
    <div class="footer-inner">
      <span>Powered by OpenClaw · MIT License</span>
      <span><a href="https://github.com/acaclaw/acaclaw">GitHub</a></span>
    </div>
  </footer>
</body>
</html>"""


def find_page(url_path: str):
    """Map a URL path to a markdown file."""
    # Normalize
    url_path = url_path.rstrip("/") or "/"

    # Direct index redirect
    if url_path in ("", "/"):
        # Root redirect → /en/
        return None  # handled specially

    # Try to find matching file by permalink
    for md_file in DOCS_DIR.rglob("*.md"):
        if "_original" in str(md_file):
            continue
        try:
            post = frontmatter.load(md_file)
            permalink = post.get("permalink", "")
            if permalink.rstrip("/") == url_path.rstrip("/"):
                return md_file
        except Exception:
            continue
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.path}  →  {args[1]}")

    def do_GET(self):
        path = self.path.split("?")[0]

        # Serve CSS
        if path == "/assets/css/style.css":
            css = CSS_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/css")
            self.end_headers()
            self.wfile.write(css)
            return

        # Serve logo assets
        if path.startswith("/assets/logo/"):
            filename = path[len("/assets/logo/"):]
            logo_path = DOCS_DIR / "assets" / "logo" / filename
            if logo_path.exists():
                mime = "image/svg+xml" if filename.endswith(".svg") else "image/png"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.end_headers()
                self.wfile.write(logo_path.read_bytes())
                return

        # Root redirect
        if path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/en/")
            self.end_headers()
            return

        md_file = find_page(path)
        if md_file:
            html = render_page(md_file).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html)
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>404 Not Found</h1>")


if __name__ == "__main__":
    server = HTTPServer(("localhost", PORT), Handler)
    print(f"\n  AcaClaw docs preview →  http://localhost:{PORT}/\n")
    print("  Pages:")
    for md in sorted(DOCS_DIR.rglob("*.md")):
        if "_original" in str(md):
            continue
        try:
            p = frontmatter.load(md)
            pl = p.get("permalink", "")
            if pl:
                print(f"    http://localhost:{PORT}{pl}")
        except Exception:
            pass
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
