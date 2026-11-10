# Claude experimental scheduling build — November 10, 2026

This is a **separate test branch** based on `beta`. It is not the production application and must not be installed over a working ShowPilot folder.

## Get the portable build
1. Open [ShowPilot Actions — claude branch](https://github.com/nyteghost/showpilot/actions/workflows/showpilot.yml?query=branch%3Aclaude).
2. Select the latest **green** workflow titled `ShowPilot claude build #...`. **Do not download a red/failed workflow**.
3. Under **Artifacts**, download `showpilot-windows-portable` (Windows) or `showpilot-linux-portable` / `showpilot-linux-appimage`.
4. Extract the archive to a **separate folder** (e.g. `ShowPilot-Claude-Test`). Do not overwrite `beta` or `main`. Do not migrate or delete the existing appdata.
5. Start the portable app and work from **copies** of your monthly workbook and Event Schedule report.

The test package has an isolated `-claude` version suffix and uses a separate **ShowPilot-Claude-Test** Electron user-data directory. Beta/main SQLite, Native Memory and credentials are not loaded by this test build. Still keep your production backups and avoid live Google Calendar sync during testing. Experimental in-app updates are disabled; download subsequent claude builds from GitHub Actions.

## Current experimental features

This test branch builds on the original Claude scheduling fixes and adds:
- **Event Schedule:** structural CGC row/date detection; booking-close coverage suggestions; operator-controlled manager regular line, manager-alone permission, preferred days off/usual weekdays and attendance threshold (no default threshold); seven-day staffing even with selected dark days; three-row OFF/PTO/Holiday interpretation.
- **Room review:** possible same-event gap holds and activity-only room use are flagged **VERIFY**, never inserted into the export without a human review; zero-length markers aren't printed as misleading ranges.
- **Engineering Excel:** approved-master selected-week export option; existing typed service-desk/escalator/CGC hours retained; booking-window proposal for CGC hours.
- **My Shifts:** standard `.xlsx` imported with ExcelJS, historical `.xls` supported by a compatibility parser; text-layer weekly PDFs accepted with visible warnings; source-name aliases; optional manually corrected week-start if the dates are stale; implausible shifts remain excluded until confirmed.
- **Safety and security:** recover a damaged encrypted cloud-AI vault without losing Settings; Google OAuth timeout cleanup and date-bounded calendar sync; pinned Bun lockfile in CI.

**Still pending:** complete real-published-schedule agreement, fully private roster migration, exact airwall EOC parity, historical evening-pattern calibration, PDF scans that require OCR, sixth-day exception review flow, and broader application refactors/security hardening. Details are in [CLAUDE_AUDIT_BACKLOG.md](CLAUDE_AUDIT_BACKLOG.md).

## Add or remove scheduling people (Claude build)

In **Event Schedule**, expand **Claude scheduling preferences (experimental)**, then **Schedule People — add, remove and edit days**.

- **Add a person:** enter their full name, role, optional badge, normal start/end shift and usual weekdays. New people appear in fresh generated week exports. The default for a new person is **requires another engineer on a show**, which can be changed explicitly.
- **Remove from future schedules:** select **Remove**, type **REMOVE**, then confirm. They disappear from new planner suggestions and newly generated fresh-layout staffing rows. **Restore** returns the existing person record without re-entering details. No previously published shifts or source data are erased.
- **Change one day:** choose a date/person and either add a manually selected shift or mark that day OFF. **Save day instruction** records the reviewable override; **Undo** removes just that instruction. The planner displays its reason in **Staffing Why** and does not replace PTO or shifts already typed in the uploaded master workbook.
- **Important master-template limit:** An approved original workbook is the formatting/shift authority. If your added person is missing an authorized three-row block, export stops and tells you to add the person to the source master or choose **Download week (fresh layout)**. Existing master employee rows are not automatically deleted or rearranged.
- Changes are saved **locally**, included in ShowPilot work-data backups, and isolated to the experimental Claude build. No Google Calendar events are created, altered or deleted by the roster editor.

## Testing the experimental settings

In **Event Schedule**, expand **Claude scheduling preferences (experimental)**. Start by comparing with default choices. You can turn off booking-close coverage to compare, or opt into a manager regular weekday line; manager-alone coverage remains disabled until explicitly enabled. Keep attendance threshold blank unless local staffing policy approves a number.

In **My Shifts**, try both your copied `.xlsx` monthly schedule and a selectable-text weekly `.pdf`. For stale FROM/TO dates, use the explicit weekday override only after checking the actual Monday in the published schedule. Never send unreviewed or implausible shifts to live Google Calendar.

To compare a **private local** event report and a folder of published weekly Excel files (developer environment with Bun), run:

`bun scripts/claude-agreement.ts --report "/path/to/event-report.xlsx" --published "/path/to/published-xlsx-folder"`

It prints aggregate counts only; source files stay on your computer. Its agreement metrics are experimental and need validation against known test weeks before being used as a scorecard.

## Test checklist
- Use a historical workbook copy with one or more staff rows inserted above HALLS. Confirm the week export recognizes Hall A–D and Ballroom A–G.
- Use a workbook copy with a blank or numeric row inserted between MON and actual dates. Confirm My Shifts reads the correct 2026 dates.
- Verify unreadable/ambiguous shifts are visible, and suspicious durations require confirmation.
- Compare a same-event day with rehearsals/access and a zero-length Doors Open function; look for sane, **reviewable** span and VERIFY label.
- Inspect booking-close coverage in Staffing Why; compare on/off settings, verify the source booking end, and do not approve staffing solely because the test planner generated it.
- Confirm you can still launch your normal `beta` folder unchanged.

Report any red CI run or discrepancy with the **check job error lines**, the tested branch version and a screenshot. Never upload real EOCs or employee details into the public GitHub issue.

## Developer continuity
All changes are recorded in [Issue #2](https://github.com/nyteghost/showpilot/issues/2). Treat `claude` as an experiment until the real published schedule comparison passes and the owner approves relevant policy changes.
