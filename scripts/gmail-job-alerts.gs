/**
 * job-matchmaker — Gmail "email-in" forwarder (Google Apps Script).
 *
 * Forwards labeled job-alert emails (LinkedIn, Welcome to the Jungle, Jobgether,
 * etc.) to job-matchmaker, which stores them verbatim. An external agent then
 * extracts the jobs over MCP and adds + scores them. No domain / OAuth project /
 * app password needed — this runs in your own Google account.
 *
 * SETUP (one time, ~10 min):
 *  1. In Gmail, create a label "JobAlerts".
 *  2. Create a filter for each job board's alert sender (e.g. From contains
 *     "linkedin.com", subject contains "job alert") → "Apply label: JobAlerts".
 *     (Optionally backfill existing alert emails into the label.)
 *  3. Go to https://script.google.com → New project → paste this file.
 *  4. Set APP_URL and CRON_SECRET below.
 *  5. Run `ingestJobAlerts` once and authorize when prompted.
 *  6. Triggers (clock icon) → Add Trigger → ingestJobAlerts, Time-driven,
 *     every 30 minutes.
 */

const APP_URL = "https://job-matchmaker-ruby.vercel.app";
const CRON_SECRET = "PASTE_YOUR_CRON_SECRET_HERE";

const LABEL = "JobAlerts";
const DONE_LABEL = "JobAlerts/Done";

function ingestJobAlerts() {
  const label = GmailApp.getUserLabelByName(LABEL);
  if (!label) throw new Error('Create a Gmail label named "' + LABEL + '" first.');
  const done =
    GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);

  const threads = label.getThreads(0, 20);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const res = UrlFetchApp.fetch(APP_URL + "/api/email-ingest", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + CRON_SECRET },
        payload: JSON.stringify({
          provider: detectProvider(msg.getFrom()),
          subject: msg.getSubject(),
          html: msg.getBody(),
        }),
        muteHttpExceptions: true,
      });
      Logger.log(res.getResponseCode() + " " + res.getContentText());
    }
    thread.removeLabel(label).addLabel(done);
  }
}

function detectProvider(from) {
  from = (from || "").toLowerCase();
  if (from.indexOf("linkedin") >= 0) return "LinkedIn";
  if (from.indexOf("welcometothejungle") >= 0 || from.indexOf("welcomekit") >= 0)
    return "Welcome to the Jungle";
  if (from.indexOf("jobgether") >= 0) return "Jobgether";
  if (from.indexOf("himalayas") >= 0) return "Himalayas";
  return "Email";
}
