# ShowPilot — Developer Recovery and Operating Instructions

This file is the **first-read handoff** for any AI coding assistant or fresh development chat in this repository.

## Recovery command: "Remember Yourself"

When the user says **"Remember Yourself"**, **"Remember Yourself ShowPilot"**, "continue our ShowPilot work", or refers to losing the earlier assistant:

1. Open **[ShowPilot continuity issue #2](https://github.com/nyteghost/showpilot/issues/2)**.
2. Read its **entire issue body and latest comments** before proposing edits.
3. Inspect the *actual* current GitHub `beta` branch, relevant files, commits and GitHub Actions `showpilot.yml` status. Do not assume a previously reported commit passed CI.
4. Respond with a compact factual summary of the project role, current decisions, completed changes, blockers and immediate next steps. Then proceed with the user's request.
5. At meaningful checkpoints, add a concise comment to **issue #2** containing new non-sensitive requirements, choices, code changes, commit SHAs, build status and open questions. If the user says to record a decision, add it there during that conversation. Do not claim automatic background logging between chats.

This is a **project continuity record**, not a way to recreate hidden model state or guarantee an assistant will automatically read a repository. A new agent must be given access to this repository and must read this file.

## Standing development contract

- Repository: `nyteghost/showpilot`.
- Active development: **`beta`**. Do not alter `main` without explicit authorization. Prefer direct updates to `beta` with testing and verified successful CI; PRs only when justified or requested.
- **CGC only:** Cobb Galleria Centre, Atlanta. Exclude CEPAC/Cobb Energy Performing Arts Centre entirely from schedule, assignments and room setup inference.
- Primary Windows portable/offline use; preserve Linux/CachyOS compatibility, local saves and original user data. No administrator access or separate AI server as a prerequisite.
- Local AI: optional, GPU/local whenever enabled, **advisory review of deterministic rules**. Never assume AI certainty authorizes physically moving airwalls, overwriting approved records, changing shifts, or modifying code without safeguards.
- Hall A–D and ballroom configurations may change **within the same event** for room turns and receptions; use actual Event ID, EOC and function times. Explain reasons by show name, room and overlapping sections, not just dates.
- "Correct ShowPilot" sidebar chat must talk to the loaded model and **answer briefly**. "Save verified correction" creates local memory context; it is not a code edit.
- Destructive chat actions (currently *selected event-catalog removal*) require **exact preview → explicit typed `yes` → verified backup → bounded operation**. Never silently delete attachments, EOCs, originals or backups.
- Keep GitHub issue content professional and non-sensitive. Do not post raw customer EOCs, employee personal records, private local paths, secrets or entire chat transcripts to public GitHub.

## Sources of truth

- **Continuity decisions and work journal:** [issue #2](https://github.com/nyteghost/showpilot/issues/2).
- **Product/user guidance:** [README.md](README.md).
- **Actual software state:** current source code and passing Actions runs, not earlier promises.

## First check for a new session

Read issue #2 and latest comments, then inspect current `beta` and newest `ShowPilot standalone checks` GitHub Actions run. If red, identify and fix the precise failing step before assuming an update is ready for download.
