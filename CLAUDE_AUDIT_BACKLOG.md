# Claude scheduling audits — experiment status

**Branch:** `claude`, originating from `beta`. **No merge authorized.** This file tracks the two user-provided Claude audit prompts. Tests use fabricated shows, people and times; never commit real exported schedules.

Status: **implemented for experimental testing** is not equivalent to passing CI or validating against the published schedule baseline.

## Audit 1 — grouped Event Schedule and engineering plans

| Item | Status | Notes |
|---|---|---|
| D16 Dynamic CGC template sections | Implemented for test | Structural ordered blocks at shifted row offsets; protects lower other-venue Ballroom rows |
| D17 Aligned date-row scan | Implemented for test | Consecutive Mon–Sun row within 5 rows after MON; supports spacer and rejects 1904 serial |
| B9 Noise/access occupancy span | Partial | Skipped function ranges extend an existing same-event show span; noise-only days still need reviewed VERIFY hold candidates |
| B10 Zero-length entries | Implemented for test | Render instant VERIFY marker, not a fictitious 0-minute range |
| A1 Building-close coverage | Evidence only | Booking window parsed and displayed; **do not change default staffing coverage without owner approval** |
| A6 Dark-day staffing | Pending policy approval | Normal baseline on days without event rows |
| A7 Hand-typed OFF / third-row leave | Pending policy approval | Explicit respect-existing-OFF setting, parse PTO/Holiday and avoid contradictory staffing |
| A2 Usual weekdays/days off | Pending policy approval | Data-driven preferences and break-reason text |
| A3 Evening pair shifts | Pending policy approval | Re-evaluate after approved closing-coverage setting |
| A4 Manager line | Pending policy approval | Regular 5-day manager option; not-alone permission |
| A5 On-call | Pending policy approval | Additional 5p–10:30p pattern and gap suggestion |
| B8 Room holds before/after function gaps | Pending | Reviewed VERIFY suggestions only; never silently insert |
| B11 Classification fallback | Pending | Re-measure after B9/B10 and suggest corrections |
| B12 MO? booking close | Implemented for test | If booking end is later, use it for tentative MO? end; otherwise preserve fallback |
| B13 Attendance | Evidence only | Capture and display; threshold left unset pending owner decision |
| C14 Airwall tasks | Pending | Show all resulting partitions and AM/PM; reviewed suggestions |
| C15 Escalator/service desk/building hours | Pending | Respect typed cells, compare changes, use booking hours |
| E18 Agreement harness | Pending | External local fixtures only, compare published schedules |

## Audit 2 — monthly engineering workbooks and shifts

| Item | Status | Notes |
|---|---|---|
| 1 Date row spacer / serial | Implemented for test | Shared date scan in reader/writer; reject numeric 1904 dates |
| 2 Date/weekday sanity | Partial | Enforce weekday alignment; FROM/TO cross-sheet comparison and correction UI pending |
| 3 Shift annotation / unreadables | Implemented for test | Trailing +, (TBD), dash/semicolon, compact times; workbook AND pasted unreadables shown |
| 4 Implausible shifts | Implemented for test | 2–14 hour review; confirmed-only calendar export/sync; 11:59p close-hour accounting |
| 5 Human OFF / third row | Pending policy approval | PTO and Holiday status parsing; SD assignment; preserve staff notes |
| 6 Roster/name matching | Partial | Detect on-call/blank-badge people and offer name dropdown; alias/roster merging pending |
| 7 Row aliases and other spaces | Pending | Region-scoped room labels, alias table, unsupported-space report |
| 8 Typed escalator and desk | Pending | Compare suggestions but preserve human-entered values |
| 9 Weekly PDF My Shifts | Pending | Positional text-layer reader; image-only warning |
| 10 Configurable staffing patterns | Pending policy approval | Pattern history, on-call 5p–10:30p, reviewed 6th day |
| 11 Fresh-from-template export | Pending | Use approved blank template without disturbing formulas or styles |

## Release and data safety

- GitHub Actions builds the `claude` branch into separate Windows and Linux artifacts after check/test/build pass. The branch uses a `-claude` version suffix.
- **User data isolation:** packaged `-claude` app uses `ShowPilot-Claude-Test` Electron userData, not normal `ShowPilot`. Beta/main in-app update installation is disabled in experimental packages.
- Tests are synthetic only. Exact operational staffing, venue exclusion, stage/deck geometry and permission rules remain unchanged.
- Use [CLAUDE_TESTING.md](CLAUDE_TESTING.md) for hands-on instructions and [issue #2](https://github.com/nyteghost/showpilot/issues/2) for continuation notes.
