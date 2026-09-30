# Arena Games site template
Reusable SR/EN entry page with the existing Arena palette, interactive logo die, language switch, game cards and native description dialogs.

- [Site template features and separated code](SITE_TEMPLATE_FEATURES.md)
- [Render Free deployment instructions](UPUTSTVO_RENDER.md)
- Serbian/browser-language entry: index.html
- Explicit English entry: en.html
- One shared CSS and JavaScript implementation in shared/.

This folder is saved on branch template/arena-site-features. It does not change the running Jamb app and should remain separate from main as a template. Copies can be used for new game sites.

Use the branch-specific Arena site template GitHub Actions workflow for checks. It runs Node 22 tests without dependency installation or production game requests. Tests cover language selection, complete SR/EN dictionaries, decorative die state/accessibility, translated placeholders, game links and the browser module import graph.

Actual deployment and responsive visual review require a separate pass. Render settings and current account quotas are described in UPUTSTVO_RENDER.md.
