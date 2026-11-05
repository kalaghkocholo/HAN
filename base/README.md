# Farnaz — Base Framework

This folder contains a separate baseline snapshot for rebuilding Farnaz step by step.

## Source
- Historical source commit: `3de3d88d211d38505c7370bff1fe439a7449af21`
- Source date: 2026-10-19
- Source file: the single-file `index.html` from before the major feature additions on 2026-10-21.
- Original source file SHA: `f726f5ab06c1d92181231c37b0f042592fe087bc`

## Scope
- Kept separate from the current app in the repository root.
- This is a historical baseline, not the current production app.
- It does not include the later Settings interface, theme-customization UI, later group/channel features, or the later modular files.
- Core original screen, authentication, profile/contact flow, and private-message flow from this snapshot are retained rather than rewritten.
- Supabase URL and publishable key are part of the historical source; the folder does not change the Supabase project or database.

## Important
This folder is intentionally isolated and is not the GitHub Pages entry point. The live app remains in the repository root. Add future features here one at a time, and test each before considering any move to production.
