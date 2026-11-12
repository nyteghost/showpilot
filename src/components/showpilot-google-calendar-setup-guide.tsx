import {ExternalLink,Info,ShieldCheck} from "lucide-react";

/** Google Cloud's current Desktop OAuth setup route. This guide contains
 * documentation only; it never handles Google account passwords or tokens. */
export function GoogleCalendarSetupGuide(){
 return <div className="space-y-3 rounded-lg border border-border bg-background p-3 text-sm">
   <div className="flex items-center gap-2 font-semibold"><Info size={17}/> Google Calendar connection — step by step</div>
   <p className="text-xs text-muted-foreground">
    <strong>Opening Google Calendar only shows your calendar.</strong> To give ShowPilot permission to update your shifts,
    first create a Google Desktop OAuth file, import it below, then sign in once.
   </p>
   <ol className="list-decimal space-y-2 pl-5 text-xs">
    <li>
      Open <a className="text-primary underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud — Create project <ExternalLink size={12} className="inline"/></a>.
      Sign in with the Google account you want to configure and create or select a project for ShowPilot.
    </li>
    <li>
      <a className="text-primary underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Enable the Google Calendar API <ExternalLink size={12} className="inline"/></a>
      {" "}for that same project.
    </li>
    <li>
      Open <a className="text-primary underline" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform → Branding <ExternalLink size={12} className="inline"/></a>,
      select <strong>Get started</strong> if prompted, name the application “ShowPilot Personal Calendar”, and enter the required support/contact email.
      Under <a className="text-primary underline" href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Audience</a>, choose Internal for an eligible Google Workspace organization or External for a personal Google account.
      If External is in Testing, add your own Google account as a test user.
    </li>
    <li>
      Go to <a className="text-primary underline" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Auth Platform → Clients <ExternalLink size={12} className="inline"/></a>,
      choose <strong>Create client</strong>, set <strong>Application type = Desktop app</strong>, and create it.
      Download the client's <strong>JSON</strong> file. Do not use an API key, a service-account JSON, or a Web application client.
    </li>
    <li>
      Back in <strong>ShowPilot → Settings &amp; AI → Google Calendar</strong> (or the setup panel here),
      click <strong>Select downloaded Desktop OAuth JSON</strong> and choose that file.
    </li>
    <li>
      Click <strong>Connect Google Calendar</strong>. Your normal browser opens Google's account-approval page.
      Choose the account where your shifts belong, approve access, and return to ShowPilot.
    </li>
    <li>
      Open <strong>My Shifts</strong>, review your dates, then click <strong>Update in Google</strong>.
      Confirm the added/updated/failed counts shown under that button.
      The separate “Verify in Google Calendar” link only lets you inspect the result.
    </li>
   </ol>
   <div className="space-y-1 rounded-md border border-amber-500/50 p-2 text-xs">
    <strong>Want to avoid signing in again every week?</strong>
    <p>For an External Google OAuth app left in <strong>Testing</strong>, Google normally expires the refresh authorization after 7 days.
    An eligible production publishing status avoids that specific testing limit but may require Google verification or Workspace IT approval.
    ShowPilot cannot override Google's security rules.</p>
   </div>
   <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>
    After connecting, ShowPilot encrypts its authorization with your operating system and saves it in your account's application-data folder,
    <strong>not</strong> beside ShowPilot.exe or inside the versioned ZIP.
    Installing a newer ShowPilot build on the same Windows account retains it. Never upload the JSON or token file to GitHub or share it in chat.
   </p>
   <p className="text-xs text-muted-foreground">If you use a company-managed Google account, your administrator may need to approve the app.
    If secure Windows credential storage is unavailable, direct sync is disabled and you can use .ics export instead.</p>
 </div>;
}
