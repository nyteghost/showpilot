# Claude audit implementation ledger — ShowPilot experimental branch

**Branch:** `claude` only. No merge into `beta` or `main` authorized. **Last reviewed:** 2026-11-10.
The two Claude prompts encompass both scheduling corrections and wider application maintenance. This ledger distinguishes implemented code from independent real-schedule verification. All committed test fixtures are synthetic.

## Scheduling comparison against published CGC workbooks

| Item | Status on `claude` | Remaining verification or decision |
|---|---|---|
| D16 — moved CGC Hall/Ballroom section rows | Implemented, synthetic-tested | Compare against all 114 live weekly sheets; do not match CEPAC sections |
| D17 — Mon–Sun date row spacers | Implemented, synthetic-tested | Check real formula-only and merged date rows |
| B9 — access/rehearsal/noise occupancy | Partial | Neutral function spans and activity-only VERIFY warnings; compare actual room occupancy |
| B10 — zero-length activities | Implemented, synthetic-tested | Instant VERIFY markers rather than zero-length S ranges |
| A1 — booking-close coverage | Experimental ON by default | Uses source booking-end to suggest one-person coverage; verify real building close rather than assume all booking ends are authoritative |
| A2 — preferred days off / usual weekdays | Implemented as editable soft preferences | Compare published roster patterns; hard PTO/other leave still takes precedence |
| A3 — evening pair patterns | Partial | Prefer close-reaching patterns on equivalent coverage; historical pair staggering not calibrated |
| A4 — manager regular line | Configurable, OFF by default | Operator chooses regular weekday 9a–6p and whether manager may cover shows alone; neither auto-enabled |
| A5 — on-call | Implemented as suggestion | Additional 5p–10:30p pattern; never auto-assigns, even when evening gap remains |
| A6 — dark-day plans | Partial | Generates all seven days when a week is selected; need published dark-week parity |
| A7 — human OFF/PTO/third-row notes | Implemented, synthetic-tested | Reads three staff rows and preserves notes; explicit option can relax human OFF handling |
| B8 — possible venue holds | Partial | Same-Event-ID gaps and activity-only candidates are VERIFY-only; booking-period edges remain to implement |
| B11 — unknown description becomes S | Not automatically changed | Re-measure against actual sessions; prefer reviewed correction over silently relabeling show days |
| B12 — tentative MO? close | Implemented, synthetic-tested | Uses source booking end when later |
| B13 — contracted attendance | Parsed; staffing threshold optional | **No threshold is chosen**: null by default; user must explicitly set an approved value |
| C14 — wall tasks | Partial | Adds AM/PM and observed groups plus EOC VERIFY; must compare physical shape, previous-event transition, and human Tasks row |
| C15 — escalator, service desk, building hours | Partial | Manual cells preserved; proposed CGC hours use source booking window, but parity remains unverified |
| E18 — offline comparison harness | Experimental CLI added | Run against copies of real published schedules locally; validate metrics and collect aggregate results only |

## Monthly engineering workbook / My Shifts audit

| Item | Status | Notes |
|---|---|---|
| 1. Row spacers / Excel serial | Implemented | Shared Mon–Sun detector; rejects wrong-year serial dates |
| 2. FROM/TO / duplicate weeks | Implemented for review | Visible warnings and explicit per-worksheet Monday override; source file never rewritten |
| 3. Time strings / unreadable shifts | Implemented | Handles annotated clocks; displays unreadable spreadsheet and pasted cells |
| 4. Implausible shifts / 11:59 PM | Implemented | Individual human confirmation required before calendar sync |
| 5. Human OFF, Holiday, PTO, SD | Implemented for experimental staffing | Three rows inspected; notes copied to Staffing Why |
| 6. Roster name detection / aliases | Partial | Editable aliases; legacy hardcoded defaults are not yet fully migrated into a private validated roster |
| 7. Room aliases / other rooms | Partial | Known CGC row aliases; unknown/other-venue rows still require explicit review |
| 8. Typed Escalator/Service Desk | Implemented preservation | Never clobber typed cells; comparison of suggestions needs real workbooks |
| 9. Weekly PDF My Shifts | Experimental text-layer parser | Synthetic date/column tests; scanned/image-only PDFs warn; needs real-PDF validation |
| 10. Configurable staffing patterns | Partial | Preferred days, manager/on-call options, solo rules; six-day exceptions remain review-only/pending |
| 11. Fresh approved-master export | Implemented for test | Selected-week shortcut retains master layout; validate unusual formulas and original formatting |

## General modernization audit

| Topic | Status on `claude` |
|---|---|
| Updater version regex | Previous Claude diagnosis was incorrect; live regex already matches digits correctly; regression coverage still desirable |
| CI test script | Uses `bun run test` and Vitest |
| Reproducible dependency installs | Bun 1.3.1 pinned; `bun.lock` committed; CI runs `bun install --frozen-lockfile` |
| Corrupt AI vault | Non-throwing settings status; RESET requires explicit confirmation, preserves encrypted corrupt file as archive; synthetic tests |
| Google OAuth timeout and unbounded historical list | Non-async Promise executor, cleared timer; bounded 60-day-padded reconciliation window and tests |
| Dead Pixel Pals UI | Broken standalone links/tips and unused calendar handoff props removed; public WorkTools wrapper retained pending full usage audit |
| Personal names/roster extraction | **Partial**: editable, zod-validated local settings with aliases and work backup; real legacy defaults still in source |
| Venue rule/source, model catalog | Pending verification; CGC/CEPAC boundary never weakened |
| Strict TypeScript / checked storage / typed IPC | Partial, major work pending |
| Large component/library splitting | Pending; do not rewrite deck/staffing algorithms without regression harness |
| Local-storage key namespace and migrations | Pending; preserve all existing personal data and Google shift IDs |
| Redundant Excel library | XLSX primary reader now ExcelJS; legacy `.xls` still uses xlsx for compatibility. Cannot remove xlsx until binary .xls replacement is tested |
| Combinatorial staffing search | Bounded to 7 weekdays, order-preserving iterative enumeration, synthetic test |
| Electron CSP, navigation, permissions | Pending full secure/offline-AI compatibility checks |
| ESLint / Prettier / component smoke tests / error boundaries | Pending |

## Safety and test procedure

- `claude` packages carry `-claude` versions and isolated Electron data under `ShowPilot-Claude-Test`. Never install over regular ShowPilot or point them at production appdata.
- Every change requires successful GitHub Actions **check**, Windows package and Linux package before being described as release-ready.
- Real Event Schedule exports, EOCs, published employee schedules, names, secrets, and customer files are never committed.
- Use the local `scripts/claude-agreement.ts` with **private paths** to compare against published workbooks; the script is under active validation and its metrics are not yet a proven historical benchmark.
- The user has authorized building experimental alternatives, **not** merging proposed operational-policy changes into the stable branch.

See [CLAUDE_TESTING.md](CLAUDE_TESTING.md) and [Issue #2](https://github.com/nyteghost/showpilot/issues/2).
