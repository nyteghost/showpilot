# ShowPilot

**Cobb Convention Center-Atlanta | Show Services Operations Suite**

ShowPilot is a professional, work-focused application for convention-center event planning, engineering schedules, stage/deck setup, floor maps, shift calendars, and vendor comparisons. It was originally developed as the Work Tools portion of Pixel Pals, but has its own codebase, portable Windows and Linux desktop applications, and release channels. **This repository is ShowPilot only, not Pixel Pals.**

**Current status:** Active beta. Use real work documents carefully, review automatically generated assignments and stage layouts before acting on them, and retain originals/backups. The packaged desktop applications do not require Node.js, Bun, Ollama, or Git on the destination computer.

## Get ShowPilot

1. Open [ShowPilot GitHub Actions](https://github.com/nyteghost/showpilot/actions/workflows/showpilot.yml).
2. Choose the latest **successful** workflow run for the channel you want: `main` for stable or `beta` for testing.
3. Sign in to GitHub if prompted. Under **Artifacts**, select your operating system:
   - **Windows:** `showpilot-windows-portable` — extract the ZIP and run `ShowPilot.exe` inside the extracted folder.
   - **Linux / CachyOS / Arch x86_64:** `showpilot-linux-appimage` — a versioned AppImage; no package manager or administrator rights required.
   - **Linux portable fallback:** `showpilot-linux-portable` — a versioned `.tar.gz` archive of the full desktop app, including a `showpilot` launcher.
4. The Linux artifacts contain a **`ShowPilot-Linux-SHA256SUMS.txt`** file with both package checksums. Use `sha256sum -c` in a directory containing the downloaded files if you want to check integrity.
5. Windows, Linux, and company IT policies may restrict unsigned apps. Do not bypass your organization's restrictions without approval.

### Run ShowPilot on CachyOS / KDE Plasma

**Recommended — Linux AppImage** (choose your extracted filename, starting with `ShowPilot-v`):

```bash
chmod +x ShowPilot-v*-Linux-x86_64.AppImage
./ShowPilot-v*-Linux-x86_64.AppImage
```

You can also make it executable in Dolphin's file properties, then double-click the AppImage. The build uses the modern AppImage runtime intended to avoid a `libfuse2` requirement on Arch-based systems.

**Fallback — portable archive** (no AppImage/FUSE dependency):

```bash
mkdir -p "$HOME/Applications/ShowPilot"
tar -xzf ShowPilot-v*-Linux-x86_64.tar.gz -C "$HOME/Applications/ShowPilot"
cd "$HOME/Applications/ShowPilot"
./showpilot
```

Keep the extracted files together, rather than copying only the `showpilot` executable. When replacing a build, close ShowPilot first; the app's user data is stored separately under your Linux account's application data directory.

**KDE/KWallet:** Before saving Google Calendar authorization or cloud AI keys, unlock/configure **KWallet**. ShowPilot refuses the insecure Linux `basic_text` credential-backend fallback. If the wallet is unavailable, schedule exports, local plans, native memory, and other offline features still work. Local GPU AI depends on whether the Electron/Chromium WebGPU implementation and your NVIDIA driver support WebGPU on that system; the build does not guarantee accelerated inference.

**If the Linux window fails to render:** On NVIDIA systems try the existing application with `--ozone-platform=x11` from a Plasma X11 session; don't disable Chromium's sandbox to work around a launch problem. You can share the terminal output so the launch issue can be fixed properly.

The workflow also creates **`showpilot-browser-beta`**, an offline-capable browser build that can be served locally. The **Windows and Linux desktop builds** provide the desktop-specific integrations, including direct native SQLite memory file access.

### Update channels

Under **Settings → App Updates**, use the **Channel** dropdown:

| Channel | Git branch | Purpose |
| --- | --- | --- |
| **Main** | `main` | Stable/approved builds for regular use |
| **Beta** | `beta` | New features, fixes, and tests before promotion to Main |

Choose a channel and press **Check for Updates**. **Settings shows your installed version, the latest available version, GitHub Actions build number and commit.** For a newer **Windows Beta** with a published official GitHub Release, press **Download & Install Update**. ShowPilot asks for confirmation (save any unsaved schedule or floor-map edits first), downloads the ZIP from public GitHub Releases with **no GitHub token**, verifies its published **SHA-256 checksum and file size**, stages/extracts the build safely, closes the running app, swaps the installation directory via a detached Windows PowerShell helper, and relaunches ShowPilot. No administrator rights are needed **if the folder containing the portable app is writable**. Local SQLite memory, show catalog, Pre/Post-Con records and event-document files remain in the app's separate user-data folder. The complete previous application folder is retained as an adjacent hidden `.showpilot-previous-...` directory for rollback; updating never deletes it or your other work files. If anything fails before the app closes, the original installation stays unchanged. If the new app immediately fails to start, the helper attempts to restore and relaunch the previous app. The helper writes `ShowPilot Updates/last-update.log` in the private user-data folder for troubleshooting. **An update is never installed silently:** users explicitly choose Download & Install and approve restart.

**Release publishing:** on beta builds, the GitHub Actions `publish-beta-windows` job creates a public pre-release at `showpilot-beta-v<version>` after the Windows packaging job passes, with a single versioned `ShowPilot-v<version>-Portable-Windows.zip` and corresponding `.sha256` file. No personal token, separate updater service, or production deployment is required. Linux and Main channel continue to offer **View GitHub build (manual)** while their respective automatic install pipelines are not implemented. If the latest Windows build has passed but the release is still being published, retry Check for Updates after publication. If company IT policies prohibit writing to the portable directory or PowerShell execution, use the GitHub download for a manual update instead.

**First-time upgrade:** versions of ShowPilot built before this feature (such as `v0.1.267-beta`) do not contain the auto-updater. Upgrade once by downloading a newer Windows portable ZIP from GitHub, closing ShowPilot and replacing the previous app folder **after backing up your data**. Subsequent beta releases can be installed inside ShowPilot. Switching channels by itself never installs anything.

### Automatic build version numbers

Every GitHub Actions run receives a unique, increasing build number from `github.run_number`. A workflow script stamps the version into `package.json` **inside the temporary CI runners**, before building the browser app, Windows executable, and Linux desktop versions. The source manifest is not committed or changed by CI.

- Beta run **#18** becomes **`0.1.18-beta`**.
- Main run **#19** becomes **`0.1.19`**.
- The app's **Settings → App Updates** shows the installed and latest numbered versions. The footer shows the installed version and channel.
- The Windows ZIP is named **`ShowPilot-v<version>-Portable-Windows.zip`**; Linux artifacts contain **`ShowPilot-v<version>-Linux-x86_64.AppImage`** and **`ShowPilot-v<version>-Linux-x86_64.tar.gz`**.
- If a workflow run fails or is cancelled, its number is skipped; the next successful run still gets a higher version. All platform jobs within a run use the **same** version.

To start a new release series, update the major/minor parts of the source `package.json` version. The build counter still comes from GitHub Actions. Older builds created before automatic versioning continue to display a commit identifier rather than a fabricated version.

## Features

### Today — current CGC events and week at a glance

- The **Today** sidebar tab reads saved CGC shows from the same offline SQLite event catalog used by **Events** (or its browser-only cache when the desktop bridge is unavailable). A show appears for each day within its saved start/end date range; this is **not** a claim that a specific function or staffing shift is scheduled that day.
- Each of today's shows displays its Event ID, CGC rooms, dates, and **Open EOC** actions for actual attached originals. The link opens the local saved document via the existing protected Electron event-file bridge. Missing/unavailable EOCs are explicitly marked; there are no invented URLs.
- Airwall notes are extracted from saved indexed EOC sections and reviewed ZIP schedule evidence. Movement instructions, mentions, and explicit no-change statements are distinguished and attributed to the source document and PDF page where known. Undated event-document notes must be verified for the specific day; absence of notes **does not** establish that no airwall needs moving.
- If a previously imported Event Schedule is locally saved, the Today tab also shows **dated airwall configuration suggestions** calculated by the existing scheduling logic, labeled as unapproved suggestions rather than work orders. Excluded CEPAC events and unconfirmed/ cancelled source rows are not used.
- A straightforward **Monday–Sunday week view** appears underneath Today, with Previous, Next and This Week buttons, daily show cards, EOC availability, airwall flags and any dated schedule suggestions.
- **Show/function deduplication:** Event Schedule and weekly engineering Excel activity are grouped under confirmed Events records by Event ID first; where no ID is present, a uniquely identified show active that day and covering the same CGC rooms can receive the function as a clearly marked `room/day match — verify`. Function descriptions such as Client Arrival, Program Start, MO?, Vendor Load-In, and Tables & Chairs Inc. Move-In never create extra show cards. Ambiguous function rows are retained under **Functions to match** without changing saved event IDs, EOC attachments, or the SQLite catalog. This matching works offline and does not need an AI model; uncertain cases are flagged rather than hallucinated. Dates are local day-only values and the weekly view supports horizontal scrolling on smaller screens.
- **Today Operations Checklist:** The Today tab has a dated, interactive checklist for **building-wide engineering work and every active CGC show**. The **building-wide** airwall and lighting checks are schedule-driven rather than permanent: the dated engineering Excel TASKS rows and saved Event Schedule review recommendations are checked for actual wall-change instructions (for example, `Make ABE`, `Make full ballroom`, or `Make Hall AB`). For each unique instruction dated **today**, the checklist creates **Set / verify airwalls** and **Verify lighting settings after airwall setup** as separate, consecutive checkoffs. **Automatic airwall inference** also compares consecutive days of actual CGC Event Schedule ballroom configurations. For example, Thursday `Ballroom CDF` + `Ballroom ABEG` followed by Sunday `Full Ballroom` produces a handoff-window task to **Make Full Ballroom**, followed by a separate lighting-zone check; this task is shown from Thursday after occupancy through Saturday/before Sunday setup (Sunday shows a deadline reminder), even without an explicit `Make` instruction. The same inferred transition uses one persistent completion record across the window, so finishing it on Friday remains checked Saturday. Source uncertainty/overlapping configurations are flagged rather than fabricated. This is offline deterministic room-layout intelligence; it does not depend on a loaded LLM or control equipment. Identical configurations from both sources are deduplicated, with original workbook instructions preferred. On days without a dated movement instruction, the building-wide checklist retains review and shift-handoff tasks and explains that absent schedule evidence is not proof that no move is required. Event-specific setup checks remain visible; undated EOC mentions are separately flagged for review, not treated as confirmed same-day movement orders. All completion is manual and never controls real walls/lights or rewrites schedules.
  - Checkboxes, completion counts and manual tasks are stored by **local date and event key**, with a separate building-wide group; previous dates and other shows are unaffected. Custom tasks can be added and removed. No AI model is needed. The Windows desktop persists this private file at `%APPDATA%\\ShowPilot\\Today Checklists\\checklists.json` with a `.bak` previous snapshot, outside the portable executable folder. The browser-only build uses its own local browser storage; these do not automatically sync. Back up this folder when moving computers or protecting against local disk failure.
- **View in Events** opens that specific show's documents section, with its correct Event ID rather than the last-selected show. Refresh reads the latest imported catalog and attachments without changing notes, approved Excel templates, staffing schedules or event files. All records remain on the device; no network account is required for the Today tab.

### 1. Event Schedule

- Import **Ungerboeck For Scheduling** reports in PDF or Excel, including multiple reports for the same review.
- Optionally import an existing monthly Excel schedule as a template to preserve its formatting and already entered work.
- Classify and summarize move-ins, exhibitor move-ins, shows and move-outs, and suggest engineering preparation tasks.
- Review original report functions, edit proposed entries, compare changes, approve additions and export a new/reviewed **Excel workbook**.
- Switch the review between **Month**, **Week (Monday–Sunday)**, **Day**, and **All dates**. The selected period now controls Excel downloads: Week produces one weekly worksheet only (no other weeks or staffing-summary tabs); Month produces only weeks containing selected-month events; All dates exports the full reviewed report. **Saved review projects continue to contain the entire source and all edits**. For the closest match to your original formatting, upload a matching monthly engineering workbook and choose Update original template; the fresh exporter uses a compact CGC layout but cannot perfectly replicate a workbook that was not uploaded.
- **Automatic desktop session recovery:** the Windows portable Event Schedule now saves the imported Ungerboeck report rows, included-pending switch, approved venue labels, every review edit/addition/removal, and selected Month/Week/Day/All view into a private atomic JSON snapshot under `%APPDATA%\\ShowPilot\\Event Schedule\\current-review.json`. On the next launch, reopening Event Schedule automatically restores this session; the imported Excel template is stored separately as `uploaded-template.xlsx` in the same private folder. Saving works offline with no separate server or administrator rights. The UI displays whether the session was restored and when it was last saved. This snapshot is **not** the Native Memory weekly JSON backup; protect the `Event Schedule` folder separately if moving computers or protecting against disk failure.
- **Week exports using the saved master:** the exporter first searches for the exact week in the original Excel. If the approved master has uncached formula date cells or a different source week, the selected week can be stamped into a COPY of the compatible CGC master, retaining formatting, PTO, shifts, and print style; old event-grid text in the copy is removed before reviewed events are written. The saved master is not modified, and manually uploaded scheduling workbooks are never silently retargeted. Existing merged-room conflicts still require review. **Download week (fresh layout)** is an explicitly labeled alternative when the approved master cannot be used.
- You can also download and resume a schedule review as a `.json` project file. When manually resuming a project on another PC, reattach the original engineering workbook if needed.
- Show staffing requirements and work coverage as reviewable suggestions. Always verify the actual operating requirements, assigned personnel and special-event constraints.

**Venue scope:** ONLY **Cobb Convention Center-Atlanta**. **Cobb Energy Performing Arts Centre (CEPAC)** is a separate building and must never be included in automatically generated convention-center event or staffing plans. Unknown space labels require review rather than automatic approval.

### 2. My Shifts and calendar export

- Import your personal shifts from an Excel monthly schedule or paste rows directly from the schedule workbook.
- The paste dialog defaults to **the next Monday**, but the date remains editable.
- Review, add and edit shifts and notes; download your schedule as an **`.ics`** calendar file.
- **Update in Google** is a bulk action for adding or updating the displayed shifts in your Google Calendar (Windows or Linux desktop mode, internet required). Matching **ShowPilot-managed** events are updated; events previously added manually or via `.ics` may not be recognized and can be duplicated.
- Bulk sync does **not** automatically delete events when a shift is removed from ShowPilot. Confirm changes before syncing.
- Date/time handling uses the venue's **America/New_York** time zone.

#### One-time Google Calendar connection

1. In Google Cloud Console, enable **Google Calendar API** and configure an OAuth consent screen. Create an OAuth client with type **Desktop app**, and download its JSON credentials. A testing app may require adding your Google account as a test user.
2. Open **Settings → Google Calendar** in the Windows or Linux desktop app and import that Desktop OAuth JSON file.
3. Click **Connect Google Calendar**. Your system browser opens Google's authorization screen; ShowPilot never requests your Google password.
4. Return to **My Shifts** and click **Update in Google** after checking the schedule.

Google Calendar access depends on your Google account, API access and any company-managed IT restrictions. Direct account sync is still subject to real-account testing. **Offline .ics export works without connecting Google.** Credentials and OAuth refresh tokens are encrypted using Windows-provided protection or a supported Linux OS keyring (KWallet/libsecret); they are not included in work-data backups.

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
- **Online AI:** secure, encrypted provider-key storage in the portable desktop version. ShowPilot can recognize some provider key prefixes but may ask you to specify ambiguous ones.
- Task-generation adapters currently cover **OpenAI, Anthropic Claude and Google Gemini**. Additional services can be stored for future support; availability, model access and quota depend on the provider.
- **Local mode does not send reports to a cloud AI provider.** Online mode asks confirmation before sending scoped event names, rooms, phases and times. No full PDF, staff schedule or API key is sent as event context.
- AI suggestions show reasons/evidence and must be **edited/approved or dismissed** before they reach the reviewed schedule. AI does not directly modify employee shifts.
- If WebGPU or local-model loading fails, deterministic offline task rules remain usable. There is **no integrated CPU language-model fallback** yet.

AI may misinterpret inputs or suggest inappropriate work; treat its output as a review aid rather than an instruction.

## Real-World Diagnostics — one-click local hardware and workflow testing

Under **Settings & AI → Real-World Diagnostics**, press **Run all diagnostics** on the actual Windows portable work PC. It tests:

- The packaged Windows/Electron environment and hardware GPU availability.
- A real WebGPU compute-shader dispatch with GPU readback (a four-byte synthetic result) to distinguish actual compute capability from merely detecting an adapter.
- Synthetic stage inventory and bridge-solving, floor-map booth/utility parsing, CGC-only engineer staffing, Post-Con venue filtering, and safety validation of AI suggestions.
- Read-only native SQLite integrity checks, table schema, in-process JSON export/restore round-trip, historical-memory counts, saved Post-Con counts, and the latest automatic JSON backup's readability. It does **not** overwrite live memory or create/delete backup files.
- With **Include actual Local GPU AI generation** enabled, a tiny actual on-device inference plus synthetic Stage Planner, Floor Maps, Event Schedule, and engineering-task requests, provided a local model is **already loaded**. No model download or model switch occurs during diagnostics. Small models can return invalid proposals; those cases appear as warnings/failures with static, privacy-safe codes.
- A separate checklist for **manual validation with real workbooks, floor maps, printing and offline runtime**; these checks cannot be claimed as passed automatically.

After testing, use **Download diagnostic log** (plain text) or **Copy report** and send the result to support/ChatGPT. The log includes only allowlisted environment capabilities, test status codes, safe counts, durations and your own manual-check flags. **It does not include** filenames, paths, staff, event names, notes, private schedule data, API keys, prompts, or raw model output. Diagnostics run locally and do not upload information anywhere. No real project is modified.

If GPU tests are skipped, open **Settings & AI → Local GPU AI**, click **Download / Load Local AI**, verify **Active AI → Ready**, then rerun diagnostics. If backup checks warn, create a private backup under **Settings & AI → ShowPilot Native Memory** on an IT-approved separate drive. For a full real-world sign-off, also complete the manual checklist after inspecting an actual stage crew sheet, floor map, Excel export, and saved/reopened Post-Con.

## ShowPilot Native Memory — local SQLite database

The Windows and Linux desktop apps include a private, offline SQLite memory database (`showpilot-memory.sqlite` under ShowPilot's OS user-data folder). SQLite runs inside the app using bundled WebAssembly; **Obsidian, a database server, an AI server, and administrator privileges are not required**.

- In **Settings & AI → ShowPilot Native Memory**, see memory and historical-record counts, search/edit/archive notes, or use **Import JSON memory** and **Export JSON backup**. No memory is uploaded to GitHub or a cloud service.
- Native memory automatically migrates valid notes from the previous `ShowPilot/` Markdown notebook (if one was configured) into SQLite **once**, preserving the original Markdown files and old task/stage remembering preferences.
- Approved AI tasks and explicitly saved stage plans can be remembered (the switches are on by default); simply importing an event report does not add memories.
- **Remember reviewed schedule exports** is optional and **off by default**. When enabled, ShowPilot stores CGC-only event/task history after an actual Excel export. These are marked reviewed, not confirmed staff assignments.
- **Historical memory import:** extract a private ShowPilot memory ZIP from a local drive, click **Import JSON memory**, and select `ShowPilot-Memory-Import-2025-2026.json`. Re-imports skip identical IDs. Records include provenance and uncertainty; old schedules and shift examples are historical references, not standing instructions.
- The Local GPU AI Task Assistant retrieves up to three matching short historical references, which are untrusted data. The scheduling/stage solvers continue to enforce the existing explicit rules; native memory does **not** yet change engineer assignments automatically.
- Cloud AI does not receive the native historical memory.
- **Weekly automatic backups:** Enabled by default in the desktop Native Memory screen. ShowPilot writes a verified portable JSON snapshot of active notes, archived notes, and historical records to its private `ShowPilot Memory Backups` folder after the first history import, when due on launch, and after every seven days while open. It checks every six hours while running, or catches up on the next launch if closed. Keeps the newest **12 automatic snapshots** (manual exports and unrelated files are not deleted). Choose a different IT-approved local, external or network folder for protection against PC/disk failure; the default is on the same computer and cannot protect against complete disk loss. Backups are unencrypted JSON and may contain employee/work details, so follow IT data-handling policy. Use **Back up now** for an immediate copy, or **Import JSON memory** to recover a snapshot. Disable this option any time in Settings & AI.
- The **Dashboard → Export work data** backup does not include native AI memory. Use **Export JSON backup** in native memory to transfer it to another computer; keep that JSON private and follow company IT policy.
- Archiving a note hides it from search and future AI references. Export only the active notes. Existing legacy Markdown notes are left untouched after migration.

### Local GPU planning assistants — Stage, Floor Map, Event Schedule

ShowPilot uses one optional **WebLLM/WebGPU local language model** across the AI Task Assistant and the three planning modules. In **Settings & AI → Local GPU AI**, choose/download a compatible model and check that **Active AI** says Ready. Cached models can run offline; the separate future CUDA/llama.cpp foundation is not used by these assistants.

- **Stage Planner:** each stage has **Suggest stage configurations**. The local model sees current dimensions, inventory, existing deck/bridge solver counts, and matching historical Native Memory. Proposed stage width/length/height are individually validated with the deterministic deck solver **before** they can be applied. Click **Apply validated dimensions** to update the stage inputs; verify the resulting holder and bridge layout and load safety before construction.
- **Floor Maps:** after selecting a CGC event/work-order and plan, **Analyze unanswered booths** asks the model to prioritize existing unresolved work-order questions. AI may select an existing question for review, but **cannot invent coordinates or color booths**; use the manual plan tools to verify the precise location. Never treat a note-based booth number as confirmed.
- **Event Schedule:** alongside AI Task Assistant, **Analyze staffing with historical memory** reviews the current rule-based draft assignments using matching historical schedules and Post-Con notes. Suggested staff/date combinations must already exist in the deterministic staffing output; the AI cannot assign otherwise-excluded personnel or alter the approved template. Staff availability and shifts in the original workbook still require manager review.
- **Save reviewed idea to memory** is an explicit opt-in action in each assistant, saving a labeled **AI planning idea** (not a confirmed historical event) into private Native Memory. This is distinct from actually saving the stage plan or exporting the workbook.
- **Local only:** Post-Con reports and historical memory excerpts go only to the local GPU model, not to an online AI service. An AI suggestion is not approval and does not automatically become a requirement.

### Pre-Con — next 30 days
Open **Pre-Con Notes** in the sidebar. ShowPilot displays the CGC shows found in imported Event Schedule reports that overlap **today through the next 29 days** (30 calendar days total), including multi-day shows. The dropdown uses your locally remembered show name, first scheduled date, event ID, and combined CGC room names. Import an Event Schedule covering the next 30 days to populate the list; you can still enter a show manually.

For each show, save separate **pre-show overview and requirements, engineering/staffing notes, stage/deck plans, floor-map and utility notes, and outstanding decisions/follow-ups**. Saved notes can be reopened and edited from the searchable list even after a show leaves the upcoming-date dropdown. No changes are made to existing Event Schedule, shifts, stage plans, or floor maps.

Pre-Con content is saved as structured **Recurring Events** notes in ShowPilot's existing private SQLite memory. This avoids a database migration, works offline in the Windows/Linux portable applications, and is automatically included in the existing ShowPilot weekly JSON backups and manual memory exports. Pre-Con notes are references, not instructions to AI or permission to change shifts. Archived notes remain in backups.

### Post-Con — completed show review

Open the **Post-Con Reports** tab. After importing an Event Schedule, the dropdown lists CGC shows completed in the **previous 30 days including today**; older saved reports remain searchable. You can also enter a CGC show manually. Record **what went well, issues, engineer staffing, stage setup, floor-map/utility lessons, follow-ups, and an optional 1–5 rating**. Save the review explicitly; it becomes a searchable local historical reference for future GPU recommendations. Archived reports remain in automatic JSON backups.

Native Memory's weekly backups and manual JSON export include Post-Con reports. When restoring, use **Settings & AI → ShowPilot Native Memory → Import JSON memory**. No company schedule documents or Post-Con contents are uploaded to GitHub.

## Settings, local data and backups

- **App Updates:** select Main/Beta, check for builds and open the corresponding GitHub download.
- **Local GPU AI:** select a model and see model-loading state.
- **ShowPilot Native Memory:** search/edit SQLite notes, import historical JSON, export backups, and control what approved work is remembered.
- **Online AI Providers:** securely save or remove optional cloud API keys in the Windows/Linux desktop application.
- **Google Calendar:** securely connect/disconnect the authorized Google account.
- **Dashboard → Export work data / Restore from backup:** export supported saved plans, vendor data, floor-map data and preferences to `.json`, or restore that data on another installation.

The work-data backup deliberately **does not contain** API keys, Google tokens, downloaded GPU models, native SQLite memories or arbitrary files from the computer. Some supported legacy local-storage key names still begin with `pixelpals:`; that is a compatibility detail, **not** a connection to Pixel Pals. Saved local plans, workbooks and settings are not automatically synced between computers.

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
| Direct Google Calendar updates | No | Google account authorization and secure OS credential storage |
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

The automated GitHub Actions workflow `.github/workflows/showpilot.yml` checks types, JavaScript syntax, unit tests and browser builds on Ubuntu, packages the Windows portable ZIP on Windows, and packages Linux AppImage and tar.gz builds on Ubuntu. Look under **Actions → ShowPilot standalone checks**. Tests include venue filtering, spreadsheets, shifts, staffing, stage/bridge allocation, crew printing, floor maps, AI validation and backups.

### Repository organization

- `src/components/` — dashboard, Event Schedule, Stage & Deck Planner, My Shifts, Floor Maps, Vendor and Settings UI.
- `src/lib/` — parsing, staffing, event review, stage/bridge solver, AI and backup rules.
- `desktop/` — Electron shell and narrow, sandboxed bridges for encrypted keys, Google Calendar and update checks.
- `src/test/` — Vitest tests.
- `scripts/generate-app-icon.mjs` — creates Windows and Linux/KDE app icon assets from the approved ShowPilot image.
- `.github/workflows/showpilot.yml` — main/beta CI and downloadable builds.

### Release process

Develop and test new changes on **`beta`**. Promote verified changes to **`main`** when suitable for daily work. Do not introduce Pixel Pals application files, unrelated entertainment/chat components or data into ShowPilot. Keep internal venue documents and people-specific schedules out of Git.

## Known limitations and troubleshooting

- **Windows portable updater limitations:** newer beta builds can download and install verified public GitHub releases in-app, but restart and file-swap behavior may depend on Windows file locks, PowerShell policy and IT permissions. Check `ShowPilot Updates/last-update.log` if it fails. On a work PC where it does not restart correctly, close ShowPilot and manually replace the extracted program directory after backing up, keeping the original folder for rollback. The separate Event Schedule snapshot and SQLite memory are not inside the replaceable application directory.
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


## ShowPilot Local Intelligence — Phase 1 (beta)

The Windows portable application now includes an optional **Local Intelligence — foundation** section in Settings & AI.

- Its desktop Electron IPC stores enablement, preferred backend (automatic/CUDA/CPU), and permission for future background analysis in a local settings file. These preferences do **not** launch an AI model.
- The status reports **Not installed** until a future bundled local inference engine actually exists. Existing WebGPU AI is separate and remains available.
- **Choose master XLSX** copies an approved Excel workbook (maximum 30 MB) to the app's local data directory as `local-intelligence/approved-schedule-template.xlsx`. Only explicitly selected files are copied. The reference is not uploaded.
- The saved approved master now supplies the original Excel layout for selected-week export. Formula-only date rows are re-dated only in the exported copy after CGC layout checks. A clearly labeled fresh-layout export remains available if the master cannot be used. Uploaded originals and saved master files are never overwritten by exporting.
- Neither llama.cpp nor a GGUF model is bundled yet. No model downloads or silent background scheduling edits are introduced.

The portable release must continue to work without internet and without a model. Check workplace IT policy before storing company documents in local application data.


### Approved master workbook preview export (Phase 1.5)
In the packaged Windows app, choose an approved XLSX under **Settings & AI → ShowPilot Local Intelligence**. Then import and review an event schedule and choose **Export using master template (preview)**.
This opt-in path reads the saved local reference and validates that its weekly date rows include all requested event dates before using the existing workbook-merging exporter. If not, it displays an error; the ordinary **Download reviewed schedule (fresh)** remains available.
**Caution:** Workbook merging preserves existing nonempty shifts and PTO but can retain historical event text. Always review output before publishing. Automated re-dating, clearing outdated event cells, and exact-template fidelity for new months remain future work. No new AI engine is required for this feature.

### Original engineering workbook is the only official Excel layout
For template-faithful Event Schedule exports, provide the original **11 November 2026** engineering workbook locally, either alongside the ShowPilot - Event Schedule report or as the approved master workbook in **Settings & AI**. Do **not** upload an employee schedule to the public GitHub repository. ShowPilot does not embed or publish the original workbook.

The **Preview original Excel** and **Download ... (original layout)** controls generate the same template-based output. ShowPilot does not silently replace this with an approximate freshly designed schedule. The template preserves its employee rows, shifts, PTO, notes, formulas, room order, colors, borders, original merges, column widths, and row heights; only reviewed event cells and supporting event calculations are changed. Excel Week view extracts only the chosen Monday–Sunday worksheet. Its date header is materialized from the original cached values so it no longer depends on deleted reference sheets.

The source template uses **HALLS row 54, Hall A–D rows 55–58, BALLROOM row 60, and BallRoom A/B/E/G/C/D/F rows 61–67**. Combined Hall AB (and shorthand AB) maps to **Hall A and Hall B**; similarly explicit ballroom combinations map to their own pre-existing ballroom rows. Never invent an **Other Spaces** section. Unknown rooms or incompatible existing merges now produce actionable errors rather than incorrect workbooks. When a worksheet does not exist for the selected week, choose a matching template instead of creating a differently formatted sheet.

The original workbook contains historical data and additional tabs; ShowPilot must not import any **CEPAC** functions into CGC event schedules. Existing unrelated cells in the uploaded template are preserved, not cleared. As always, verify the downloaded workbook in Microsoft Excel before publishing. If Excel reports corruption, retain the original template, unmodified downloaded XLSX, and Excel's repair log.

### In-app Excel preview (Beta)
In **Event Schedule**, choose the review **Month / Week / Day** first. After importing and reviewing events, choose **Preview format** (Fresh, Original workbook, or Approved template when available), then **Preview Excel**. A read-only table opens inside ShowPilot, generated from the exact workbook bytes that the matching download would create. Select a worksheet, adjust the zoom, and inspect date headers, room cells, staffing blocks, merged rooms and activity colors. The preview never uploads or modifies the source workbook. Complex Excel print features and formulas may not appear exactly as in Microsoft Excel; verify important published workbooks in Excel.
A Week export is limited to one Monday–Sunday worksheet. Original or approved templates must contain exactly that week. Original blank-cell styles are retained as supplied; manually entered shifts, PTO, and unrelated cells are not cleared. If Excel still offers to repair a workbook, retain the unrepaired output plus Excel's repair log for further diagnosis; don't publish a recovered workbook without verifying it.

### Events ZIP import and nested Pre/Post-Con (Beta)
**Events** is now the single top-level sidebar location for show records, with nested **Overview & Notes**, **Event Documents**, **Pre-Con Notes**, and **Post-Con Reports** sections. Previously saved Pre-Con and Post-Con records remain in their original private SQLite tables/notes; moving the menus does not delete or rewrite them. The 30-day Pre-Con/Post-Con quick selectors are retained, while selecting any saved show in Events can open its corresponding pre/post notes directly.

Drop an **event ZIP anywhere in the Events screen** (or click its **Drop event .zip here** box). **EOC cover autofill:** ShowPilot reads a text-based Event Order Confirmation PDF and looks for the cover heading `Event Order Confirmation`, the next-line show name and numeric ID such as `Hospitality Industry Ministries (41622)`, and the following date range such as `Fri 11/6/2026 - Fri 11/6/2026`. It pre-populates **Actual show name**, **Event ID**, **Start date**, and **End date** from the EOC, before considering ZIP filename or event.json suggestions. EOC cover data takes priority; **only numeric Event IDs** are valid (non-numeric placeholders like `tes` are discarded), while genuine conflicts between different numeric IDs are flagged for review and never silently attached to an unrelated event. Original documents are kept, and the user reviews all fields before confirming. **Conflicting Event IDs:** if a secondary document/manifest/ZIP filename conflicts with exactly one readable EOC-cover ID, the importer requires the user to select an **existing event with that exact EOC ID** and check the explicit conflict-review acknowledgement before attaching any files. The recorded local ZIP evidence notes the override time and chosen ID. If EOC covers disagree with each other, there is no override; split the documents into separate ZIPs. Creating a new event from a conflicting-ID ZIP is always blocked. After a successful import, ShowPilot **clears the uploaded ZIP, show name, Event ID, dates, room selection, conflict acknowledgement, and targeted event**, ready for the next upload; a multiple-ZIP batch automatically stages the next file for review instead of reusing the previous show's fields. Image-only scanned EOCs may not provide readable text; in that case the form uses the best available evidence with a visible warning and the user can enter details manually.

 This works **even when the Events dropdown has zero shows**. ShowPilot inspects the archive locally, lists supported files, and lets you attach it to an existing CGC show or **create a new show** with its confirmed name, ID, dates and exact rooms. A ZIP may contain nested folders with PDF, image, Word, Excel, CSV, TXT, DWG or DXF files. Optional `event.json` or `showpilot-event.json` may suggest `showName`, `eventId`, `startDate`, `showDate`, and comma-separated `rooms`; these values must still be reviewed, and the user must explicitly confirm the import. No event names, dates or halls are silently invented.

A ZIP is limited to 150 MB compressed, 120 entries and 220 MB expanded, with a 25 MB per-document limit. Potentially unsafe archives (path traversal, symlinks, encrypted files, ZIP64, excessive compression ratios, corrupt checksums) are rejected. Unsupported file types inside otherwise valid archives are skipped and listed in the preview. Original **supported documents** are individually saved in the existing local event-file vault and participate in verified companion-file backups; the source ZIP itself is not automatically copied, so retain it separately if needed. Reimporting identical document names and bytes into the same show skips duplicates. The EOC focus panel still prioritizes **Event Notes, Engineering, and Utility**, and the original EOC PDFs stay intact.

The Events dropdown and imported file links are restored from the SQLite database on future launches and portable updates. Importing a ZIP does not alter any Excel engineering schedules, shifts, stage plans, floor maps, or production data. Update the **beta** portable installation only after the Windows build passes; keep backups of the full ShowPilot user-data folder or export JSON together with its **ShowPilot Event Files** companion folder.

### Events — one folder for every CGC show (Beta)
Open **Events** in the left sidebar (separate from **Event Schedule**). Choose a named CGC show from your imported ShowPilot Event Schedule. This is an **all-shows** catalog, not limited to the Pre-Con/Post-Con 30-day windows. The show record includes its Event ID, dates and actual halls/ballrooms. Individual function names such as Move In or Program are not treated as separate events.

The Events page displays saved **Pre-Con preparation** and **Post-Con lessons** together with a separate **General event notes** editor. Save Event Notes to the existing private SQLite memory; they participate in weekly and manual JSON backups. Editing Pre-Con/Post-Con remains in their dedicated tabs, and their saved content is displayed read-only in Events.

Select a document kind, or **Detect from filename**, then drag and drop files into the show or click to browse. Choose from **Work orders**, **Event Order Confirmations (EOC)**, **Event layout diagrams**, and **Other event documents**. Supported extensions are PDF, PNG, JPG/JPEG, WebP, DOCX, XLSX, XLS, CSV, TXT, DWG and DXF, with a 25 MB per-file and 30-files-per-batch limit. Documents are associated with the selected Event ID/catalog record and may be opened in their native Windows/Linux software. PDF and common image files can also be previewed inside ShowPilot.

**EOC quick reference:** For EOC PDF documents, ShowPilot extracts only headings corresponding to **Event Notes, Engineering, and Utility**, and shows matching text with the source page number. Extraction uses only local PDF text; no AI/cloud upload is involved. Scanned PDFs or differently labeled EOC sections may not have extractable text. The original uploaded EOC remains available and is authoritative for instructions and orders. An EOC must be classified as EOC (select manually if its filename is ambiguous).

**Persistence and backups:** Original document bytes are stored under ShowPilot's private user-data folder in **ShowPilot Event Files**, separately from the program binary, and metadata is in the existing SQLite database. Replacing the portable application does not intentionally remove them. The **Back up attachments** button, existing manual memory JSON export, and weekly backups save verified original attachment bytes to a companion **ShowPilot Event Files** folder beside the JSON backup. **To restore documents on another computer, copy the JSON and its companion folder together** and import that JSON through Settings & AI. A JSON file alone cannot restore large PDF, diagram or work-order binaries. Archive only hides an attachment; it does not delete original bytes. Review workplace policies before attaching confidential documents; everything stays on-device unless you manually transfer a backup.
