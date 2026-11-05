# Farnaz recovery archive

This folder contains legacy JavaScript files moved out of the active `js/` directory on the isolated branch `recovery/core-baseline-20261024`.

These files were not referenced by the baseline `index.html` script list, which directly loads `js/core.js`, `js/chat-menu-v5.js`, `js/spaces.js`, and `js/calls.js`. They are preserved for comparison and possible selective restoration; they are not part of the active page load.

No Supabase tables, authentication users, storage objects, or live data were changed. This branch is for recovery/testing only and does not alter `main` or the published app.

## Additional recovery baseline notes

A second preserved candidate was recorded on branch `recovery/core-baseline-auth-20261025` at commit `40e83d48b3010ab36062dd04d383067517d70963`. It included an explicit email/password form handler and session restoration in the chat module. Static checks passed, but it was not runtime-tested on iPhone Safari. That candidate still loaded the Supabase SDK from external CDNs with a fallback, so it was not considered production-ready until SDK loading and real login/session flows were tested. Its archive listing was `app.js`, `chat.js`, `chat-delete-dialog-v2.js`, `chat-delete-dialog-v3.js`, and `chat-menu-v4.js`.
