---
name: Browser runtime verification
description: Why real browser tests may require an explicit provisioned Chromium executable.
---

When using the environment-provided Playwright module, select the provisioned Chromium executable explicitly if its default browser cannot be found. Do not assume a missing default executable means browser testing is unavailable or download another browser immediately.

**Why:** The provisioned module expected an older browser revision than the Chromium already installed in this environment. Pointing it at the existing executable enabled real interaction checks without adding application dependencies.

**How to apply:** Locate the currently installed module and executable instead of relying on versioned paths from an earlier session. Use the test scripts' module/executable environment options when needed; keep environment-specific paths out of application runtime code.
