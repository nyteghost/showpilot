# Claude experimental scheduling build — November 10, 2026

This is a **separate test branch** based on `beta`. It is not the production application and must not be installed over a working ShowPilot folder.

## Get the portable build
1. Open [ShowPilot Actions — claude branch](https://github.com/nyteghost/showpilot/actions/workflows/showpilot.yml?query=branch%3Aclaude).
2. Select the latest **green** workflow titled `ShowPilot claude build #...`. **Do not download a red/failed workflow**.
3. Under **Artifacts**, download `showpilot-windows-portable` (Windows) or `showpilot-linux-portable` / `showpilot-linux-appimage`.
4. Extract the archive to a **separate folder** (e.g. `ShowPilot-Claude-Test`). Do not overwrite `beta` or `main`. Do not migrate or delete the existing appdata.
5. Start the portable app and work from **copies** of your monthly workbook and Event Schedule report.

The test package has an isolated `-claude` version suffix and uses a separate **ShowPilot-Claude-Test** Electron user-data directory. Beta/main SQLite, Native Memory and credentials are not loaded by this test build. Still keep your production backups and avoid live Google Calendar sync during testing. Experimental in-app updates are disabled; download subsequent claude builds from GitHub Actions.

## Implemented experiments (as of this checkpoint)
- Detect the actual ordered CGC Hall/Ballroom section at a moved row offset; keep other-venue rows excluded.
- Scan up to five rows below MON for seven consecutive, weekday-aligned dates. Refuse the incorrect 1904 date implied by spacer numerals.
- Import shift annotations `+` and `(TBD)`; tolerate typographic dashes, semicolons and compact clock times.
- Show unreadable shift cells and date problems. Calendar export/sync excludes shifts outside 2–14 hours until individually confirmed.
- Treat skipped access/rehearsal function rows as occupancy evidence for *the same event and room*, without separately declaring a show.
- Render zero-length entries as `VERIFY marker`, not fictional time ranges.
- Read event booking start/end and contracted attendance for review. For a tentative `MO?` entry, use the booking end when later than its function end; do not silently modify staffing coverage or apply an attendance threshold.
- Count a regular 3:30p–11:59p closing shift as eight worked hours, while retaining its exact calendar clock time.

**Not yet implemented:** the full Claude staffing-pattern, manager/on-call defaults, holiday/OFF policy, dark-day assignments, full roster migration, PDF shift parser, every event hold/airwall/escalator recalibration, full template alias support, and the local agreement-number harness. These remain backlog items. No staffing policy defaults were changed without owner approval.

## Test checklist
- Use a historical workbook copy with one or more staff rows inserted above HALLS. Confirm the week export recognizes Hall A–D and Ballroom A–G.
- Use a workbook copy with a blank or numeric row inserted between MON and actual dates. Confirm My Shifts reads the correct 2026 dates.
- Verify unreadable/ambiguous shifts are visible, and suspicious durations require confirmation.
- Compare a same-event day with rehearsals/access and a zero-length Doors Open function; look for sane, **reviewable** span and VERIFY label.
- Inspect Event Schedule for source booking close and attendance data; check staff defaults remain unchanged.
- Confirm you can still launch your normal `beta` folder unchanged.

Report any red CI run or discrepancy with the **check job error lines**, the tested branch version and a screenshot. Never upload real EOCs or employee details into the public GitHub issue.

## Developer continuity
All changes are recorded in [Issue #2](https://github.com/nyteghost/showpilot/issues/2). Treat `claude` as an experiment until the real published schedule comparison passes and the owner approves relevant policy changes.
