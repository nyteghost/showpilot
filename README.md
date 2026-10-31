# ShowPilot

**Cobb Convention Center-Atlanta | Show Services Operations Suite**

ShowPilot is a professional, work-focused application for convention-center event planning, engineering schedules, stage/deck setup, floor maps, shift calendars, and vendor comparisons. It was originally developed as the Work Tools portion of Pixel Pals, but has its own codebase, Windows portable application and release channels. **This repository is ShowPilot only, not Pixel Pals.**

**Current status:** Active beta. Use real work documents carefully, review automatically generated assignments and stage layouts before acting on them, and retain originals/backups. The Windows application does not require Node.js, Bun, Ollama, or Git on the work computer.

## Get ShowPilot

1. Open [ShowPilot GitHub Actions](https://github.com/nyteghost/showpilot/actions/workflows/showpilot.yml).
2. Choose the latest **successful** workflow run for the channel you want: `main` for stable or `beta` for testing.
3. Sign in to GitHub if prompted. Under **Artifacts**, download **`showpilot-windows-portable`**.
4. Extract the entire ZIP to a folder on Windows. Run `ShowPilot.exe` **from inside that extracted folder**. Keep its supporting files together.
5. Windows or your company's IT policies may warn about unsigned executables. Do not bypass organizational security restrictions without authorization.

The same workflow also creates **`showpilot-browser-beta`**, an offline-capable browser build that can be served locally. The Windows app is recommended for work-PC use because it has additional secure desktop connections.

### Update channels

Under **Settings → App Updates**, use the **Channel** dropdown:

| Channel | Git branch | Purpose |
| --- | --- | --- |
| **Main** | `main` | Stable/approved builds for regular use |
| **Beta** | `beta` | New features, fixes, and tests before promotion to Main |

Choose a channel, press **Check for Updates**, then **Download from GitHub** to open the appropriate successful workflow run. **Settings now shows your installed version and the latest available version**, as well as the GitHub build number and commit. If both versions match, ShowPilot says it is up to date. **The updater does not silently download, overwrite, or restart the running application**. Download the ZIP, close ShowPilot, then extract the updated folder. Settings persist between launches; use **Export work data** before updating or moving to another computer.

### Automatic build version numbers

Every GitHub Actions run receives a unique, increasing build number from `github.run_number`. A workflow script stamps the version into `package.json` **inside both temporary CI runners**, before building the browser app and Windows executable. The source manifest is not committed or changed by CI.

- Beta run **#18** becomes **`0.1.18-beta`**.
- Main run **#19** becomes **`0.1.19`**.
- The app's **Settings → App Updates** shows the installed and latest numbered versions. The footer shows the installed version and channel.
- The Windows ZIP is named **`ShowPilot-v<version>-Portable-Windows.zip`** inside the downloadable `showpilot-windows-portable` GitHub artifact.
- If a workflow run fails or is cancelled, its number is skipped; the next successful run still gets a higher version. Both jobs within a run use the **same** version.

To start a new release series, update the major/minor parts of the source `package.json` version. The build counter still comes from GitHub Actions. Older builds created before automatic versioning continue to display a commit identifier rather than a fabricated version.

## Features

### 1. Event Schedule

- Import **Ungerboeck For Scheduling** reports in PDF or Excel, including multiple reports for the same review.
- Optionally import an existing monthly Excel schedule as a template to preserve its formatting and already entered work.
- Classify and summarize move-ins, exhibitor move-ins, shows and move-outs, and suggest engineering preparation tasks.
- Review original report functions, edit proposed entries, compare changes, approve additions and export a new/reviewed **Excel workbook**.
- Switch the review between **Month**, **Week (Monday–Sunday)**, **Day**, or **All dates**, with previous/next-week navigation. The choice filters visible functions, entries and tasks only; **saved review projects and Excel exports still contain the entire reviewed report**.
- Save or resume a schedule review as a `.json` project file. If the resumed review needs the original monthly template, attach that template again.
- Show staffing requirements and work coverage as reviewable suggestions. Always verify the actual operating requirements, assigned personnel and special-event constraints.

**Venue scope:** ONLY **Cobb Convention Center-Atlanta**. **Cobb Energy Performing Arts Centre (CEPAC)** is a separate building and must never be included in automatically generated convention-center event or staffing plans. Unknown space labels require review rather than automatic approval.

### 2. My Shifts and calendar export

- Import your personal shifts from an Excel monthly schedule or paste rows directly from the schedule workbook.
- The paste dialog defaults to **the next Monday**, but the date remains editable.
- Review, add and edit shifts and notes; download your schedule as an **`.ics`** calendar file.
- **Update in Google** is a bulk action for adding or updating the displayed shifts in your Google Calendar (Windows desktop mode, internet required). Matching **ShowPilot-managed** events are updated; events previously added manually or via `.ics` may not be recognized and can be duplicated.
- Bulk sync does **not** automatically delete events when a shift is removed from ShowPilot. Confirm changes before syncing.
- Date/time handling uses the venue's **America/New_York** time zone.

#### One-time Google Calendar connection

1. In Google Cloud Console, enable **Google Calendar API** and configure an OAuth consent screen. Create an OAuth client with type **Desktop app**, and download its JSON credentials. A testing app may require adding your Google account as a test user.
2. Open **Settings → Google Calendar** in the portable Windows application and import that Desktop OAuth JSON file.
3. Click **Connect Google Calendar**. Your system browser opens Google's authorization screen; ShowPilot never requests your Google password.
4. Return to **My Shifts** and click **Update in Google** after checking the schedule.

Google Calendar access depends on your Google account, API access and any company-managed IT restrictions. Direct account sync is still subject to real-account testing. **Offline .ics export works without connecting Google.** Credentials and OAuth refresh tokens are encrypted using Windows-provided protection; they are not included in work-data backups.

### 3. Stage & Deck Planner

- Build one or multiple stages, each with a name, **width, length/depth and height**, and configure stairs, rails, skirts and ADA ramps.
- Count 4×8 stage decks and 1-, 2-, and 3-deck holders against the **shared equipment inventory**. Later stages use the inventory remaining after earlier stages.
- The automatic planner looks for valid **bridge-deck** layouts to reduce holder use, including mixed holder sizes when stock requires it. Bridges are highlighted in the onscreen plan.
- View holder/bridge positions, stage summaries, stock conflicts and optional manual placement controls.
- Save named plans, reopen, rename or delete them. **Custom manually placed pieces are not yet preserved** in saved plans; opening a saved plan regenerates that layout.
- The stage editor keeps the left **stage settings** panel visible on large screens while you scroll down through the right-side layout and holder details. The left controls scroll internally when taller than the window; small screens stack normally.
- **Print crew sheet** produces **one page per physical stage** with event name, stage name, **Build By Date**, **Show Date**, length, width, height, deck/holder counts and a clear overhead diagram. Repetitive deck-size labels and administrative tables are excluded. These dates are included in saved stage settings.
- Export a crew parts workbook as needed.

**Safety:** An algorithmically valid bridge arrangement is **not** a structural certification. Verify manufacturer instructions, permitted bridge spans, loads, equipment condition, local procedures and supervisor approval before setting up or using stages. Do not rely on auto-plan alone for safety-critical decisions.

### 4. Floor Maps

Use Show Services floor-map tools to review floor plans, color and annotate utility locations, and answer work-order/booth location questions. Work-data backups cover supported local floor-map selections and answers. Always confirm actual exhibitor utility needs against current work orders and floor plans.

### 5. Vendors

Keep local vendor quotes and compare purchasing/rental options. Live vendor scraping, automatic online quote collection and external vendor email integrations are **not available** yet.

### 6. AI Task Assistant

Event Schedule includes an optional **AI Task Assistant** for stage/room-turn and ballroom air-wall preparation checks.

- **Local GPU AI:** uses **WebLLM and WebGPU** within ShowPilot—no Ollama, local server, or API key required. First use downloads the selected model; cached models can work offline on supported hardware.
- **Settings → Local GPU AI:** choose/download a model, check GPU support and view the separate **Active AI** section. It distinguishes the **selected model** from the model **actually loaded in GPU memory**.
- **Online AI:** secure, encrypted provider-key storage in the portable Windows version. ShowPilot can recognize some provider key prefixes but may ask you to specify ambiguous ones.
- Task-generation adapters currently cover **OpenAI, Anthropic Claude and Google Gemini**. Additional services can be stored for future support; availability, model access and quota depend on the provider.
- **Local mode does not send reports to a cloud AI provider.** Online mode asks confirmation before sending scoped event names, rooms, phases and times. No full PDF, staff schedule or API key is sent as event context.
- AI suggestions show reasons/evidence and must be **edited/approved or dismissed** before they reach the reviewed schedule. AI does not directly modify employee shifts.
- If WebGPU or local-model loading fails, deterministic offline task rules remain usable. There is **no integrated CPU language-model fallback** yet.

AI may misinterpret inputs or suggest inappropriate work; treat its output as a review aid rather than an instruction.

## ShowPilot Memory — Obsidian-compatible Markdown notebook

The **portable Windows** application can keep a private-by-default, offline notebook of your approved engineering experience. This uses regular `.md` files: **Obsidian does not need to be installed or running**. If you use Obsidian, point it to the same parent folder as a vault. There is no remote Obsidian API, login or synchronization requirement.

1. Open **Settings & AI → AI Memory — Obsidian notebook**.
2. Choose **Create local notebook** to make a notebook in ShowPilot's Windows user-data directory, **or** choose **Choose Obsidian vault / folder** to attach an existing vault. The only files ShowPilot creates or changes are inside a **`ShowPilot/`** subfolder of that location.
3. Use the notebook manager to **search, read, add, edit or move notes to Trash**. The note folders are `Stage Setups`, `Ballroom Configurations`, `Recurring Events`, `Engineering Procedures`, `Approved Tasks`, and `Lessons Learned`.
4. Two independent switches control remembering: **approved AI tasks** and **explicitly saved stage configurations**. Both default ON **after you choose a notebook** and can be turned off independently. Merely importing an event report does not create memory notes.
5. For AI Task Assistant in **Local GPU mode**, ShowPilot searches up to three matching historical notebook notes, shows the selected titles, and supplies brief excerpts as **untrusted historical examples**, not instructions or proof of safe operating conditions.
6. **Online/cloud AI does not receive notebook content**, even when an online provider is configured.

### What is saved and what is not

- Clicking **Approve and add to schedule** on an AI-generated task still adds the task to the reviewed schedule, and can additionally save its task, reason and evidence to `ShowPilot/Approved Tasks/`.
- Clicking **Save** under **Stage & Deck Planner → Saved plans** still creates its existing local ShowPilot saved plan, and can additionally save a **readable reference summary** with stage dimensions, quantity of decks, bridge decks and 1/2/3-deck holders, show date and build-by date to `ShowPilot/Stage Setups/`.
- **Manual stage piece positions are not preserved by this notebook**; opening and editing a saved ShowPilot stage plan still uses the stage planner's separate saved-plan data. Memory notes are reference material, not `.json` stage-import files.
- Imported schedules, unapproved suggestions, personal shifts, API keys, Google Calendar credentials and arbitrary computer files **are not automatically copied into memory**.
- The notebook is a local directory of **plain-text files**, not an encrypted vault. Use an authorized work-data folder and follow company policies. An existing Obsidian vault may sync via external third-party software **only if you independently enable that sync**.
- The **Dashboard → Export work data** `.json` backup intentionally **does not include the Obsidian notebook**. To back up or migrate memory, copy the notebook folder itself. In the notebook UI, select **Open notebook folder** to find it.
- Deleted notes are **moved to `ShowPilot/Trash/`**, rather than permanently removed. Restore them with your file manager if necessary.

**Safety:** Similar past setups are suggestions for review only. Confirm current event functions, engineering requirements, equipment manufacturer bridge and loading limits, and applicable approval steps before reusing historical notes.

## Settings, local data and backups

- **App Updates:** select Main/Beta, check for builds and open the corresponding GitHub download.
- **Local GPU AI:** select a model and see model-loading state.
- **AI Memory — Obsidian notebook:** select a local Markdown folder, search/edit notes, and manage remembering switches.
- **Online AI Providers:** securely save or remove optional cloud API keys in the desktop application.
- **Google Calendar:** securely connect/disconnect the authorized Google account.
- **Dashboard → Export work data / Restore from backup:** export supported saved plans, vendor data, floor-map data and preferences to `.json`, or restore that data on another installation.

The work-data backup deliberately **does not contain** API keys, Google tokens, downloaded GPU models, Obsidian Markdown notes or arbitrary files from the computer. Some supported legacy local-storage key names still begin with `pixelpals:`; that is a compatibility detail, **not** a connection to Pixel Pals. Saved local plans, workbooks and settings are not automatically synced between computers.

Do not commit API keys, OAuth credentials, exported private work schedules, show reports or backups to this public repository.

## Offline/online behavior

| Feature | Offline | Internet / account required |
| --- | --- | --- |
| Event PDF/Excel parsing, review and workbook exports | Yes | No |
| My Shifts parsing and `.ics` export | Yes | No |
| Stage, saved plans, crew printout | Yes | No |
| Floor maps and offline vendor quotes | Yes | No |
| Local GPU AI | After first model download, if cached and supported | First download only |
| Cloud AI suggestions | No | Provider API key and access |
| Direct Google Calendar updates | No | Google account authorization |
| Update check / GitHub artifact download | No | Internet and GitHub session for artifacts |

## Build, test and development

The **work computer does not need development tools**. To modify/build ShowPilot yourself on a development computer, install Bun (or a compatible Node.js environment) and run:

```bash
git clone https://github.com/nyteghost/showpilot.git
cd showpilot
git switch beta
bun install
bun run check
bun test
bun run build
```

Run `bun run dev` for the development web frontend. Electron packaging uses `bunx electron-builder --win dir --x64 --publish never` on Windows after `bun run build`.

The automated GitHub Actions workflow `.github/workflows/showpilot.yml` checks types, JavaScript syntax, unit tests and browser builds on Ubuntu, then packages the Windows portable ZIP on Windows. Look under **Actions → ShowPilot standalone checks**. Tests include venue filtering, spreadsheets, shifts, staffing, stage/bridge allocation, crew printing, floor maps, AI validation and backups.

### Repository organization

- `src/components/` — dashboard, Event Schedule, Stage & Deck Planner, My Shifts, Floor Maps, Vendor and Settings UI.
- `src/lib/` — parsing, staffing, event review, stage/bridge solver, AI and backup rules.
- `desktop/` — Electron shell and narrow, sandboxed bridges for encrypted keys, Google Calendar and update checks.
- `src/test/` — Vitest tests.
- `scripts/generate-app-icon.mjs` — creates Windows app icon assets from the approved ShowPilot image.
- `.github/workflows/showpilot.yml` — main/beta CI and downloadable builds.

### Release process

Develop and test new changes on **`beta`**. Promote verified changes to **`main`** when suitable for daily work. Do not introduce Pixel Pals application files, unrelated entertainment/chat components or data into ShowPilot. Keep internal venue documents and people-specific schedules out of Git.

## Known limitations and troubleshooting

- **No automatic in-app replacement yet:** Update check opens the official GitHub Actions page; close the app and replace your extracted portable folder manually after downloading.
- **No active local AI:** a model selected in the dropdown is not necessarily loaded. Check the Active AI status and click Download / Load Local AI. GPU availability alone doesn't guarantee a particular model will run.
- **A stage doesn't reopen with manual placement:** saved stage configurations intentionally regenerate automatic layout; custom placement persistence remains a future enhancement.
- **Google Calendar duplicates:** entries previously imported from `.ics` or created manually aren't necessarily matched to ShowPilot-managed entries. Review your calendar after the first sync.
- **Calendar settings require Google Desktop OAuth:** simply pasting a generic API key does not establish personal Google Calendar authorization.
- **Missing or incorrect events:** ensure the report is Ungerboeck *For Scheduling*, check the proposed dates and rooms, and approve only actual convention-center locations.
- **Work PC restricts apps:** consult your IT policy before executing portable applications or connecting organizational Google accounts.
- **Stage layout seems physically unsafe:** stop and check approved manufacturer guidance, equipment and on-site supervisor; do not follow the diagram blindly.

## Project scope

ShowPilot serves **Cobb Convention Center-Atlanta**. It is an independent professional tool and should **not** schedule or cover Cobb Energy Performing Arts Centre events.

The project is a custom internal operational aid, not a substitute for official work orders, approved engineering staffing policies, structural stage specifications or safety procedures.
