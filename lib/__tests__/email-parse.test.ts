import { describe, expect, it } from "vitest";
import {
  decodeTrackingUrl,
  parseAlertEmail,
  splitCompanyLocation,
} from "@/lib/email-parse";

// Fixtures mirror the exact line structure of real forwarded alerts (the Apps
// Script stores the plain-text body), with fictional companies and jobs.

const LINKEDIN_ALERT = `View jobs in Spain

 (https://www.linkedin.com/comm/feed/)

 Your job alert for software engineer (https://www.linkedin.com/comm/jobs/search-results/)

 30+ new jobs match your preferences.

 (https://www.linkedin.com/comm/jobs/view/1111111111/)
 Full Stack Engineer (https://www.linkedin.com/comm/jobs/view/1111111111/)

 Northwind Netherlands (Remote)

 Actively recruiting

 Fast growing

 (https://www.linkedin.com/comm/jobs/view/2222222222)
 Software Engineer IAM SaaS (https://www.linkedin.com/comm/jobs/view/2222222222)

 Copperfen Humanes de Madrid, Community of Madrid, Spain

 Actively recruiting

 (https://www.linkedin.com/comm/jobs/view/3333333333/)
 Web Developer (https://www.linkedin.com/comm/jobs/view/3333333333/)

 Bluefern Systems Amsterdam Area (Hybrid)

 €3.8K-€4.8K / month

 See all jobs (https://www.linkedin.com/comm/jobs/search-results/)

 This email was intended for a subscriber.`;

const JOBGETHER_ALERT = `(https://x1.r.us-east-1.awstrack.me/L0/https:%2F%2Fjobgether.com%2F%3Futm_source=brevo%26utm_medium=email/1/0100-000000/sig=1)

 Hello there,

 We just identified a brand-new job posting:

 Software Engineer II (https://x1.r.us-east-1.awstrack.me/L0/https:%2F%2Fjobgether.com%2Foffer%2Fabc123-software-engineer-ii%3Futm_source=brevo%26utm_medium=email/1/0100-000000/sig=2)

 Remote from: Europe, United States

 86% Match

 25/08/26

 Backend Engineer (https://x1.r.us-east-1.awstrack.me/L0/https:%2F%2Fjobgether.com%2Foffer%2Fdef456-backend-engineer%3Futm_source=brevo%26utm_medium=email/1/0100-000000/sig=3)

 Salary: 120.0 - 160.0K

 Remote from: Spain

 81% Match

 Check My Matches (https://x1.r.us-east-1.awstrack.me/L0/https:%2F%2Fjobgether.com%2F%3Futm_source=brevo/1/0100-000000/sig=4)`;

describe("parseAlertEmail — LinkedIn", () => {
  const parsed = parseAlertEmail(LINKEDIN_ALERT);

  it("recognizes the format and extracts every card", () => {
    expect(parsed?.format).toBe("linkedin");
    expect(parsed?.jobs).toHaveLength(3);
  });

  it("canonicalizes /comm/jobs/view URLs (with and without trailing slash)", () => {
    expect(parsed?.jobs.map((j) => j.url)).toEqual([
      "https://www.linkedin.com/jobs/view/1111111111/",
      "https://www.linkedin.com/jobs/view/2222222222/",
      "https://www.linkedin.com/jobs/view/3333333333/",
    ]);
  });

  it("splits company from location and reads the work-mode badge", () => {
    const [remote, madrid, hybrid] = parsed?.jobs ?? [];
    expect(remote).toMatchObject({
      title: "Full Stack Engineer",
      company: "Northwind",
      location: "Netherlands (Remote)",
      workMode: "REMOTE",
    });
    expect(madrid).toMatchObject({
      company: "Copperfen",
      location: "Humanes de Madrid, Community of Madrid, Spain",
      workMode: null,
    });
    expect(hybrid).toMatchObject({
      company: "Bluefern Systems",
      location: "Amsterdam Area (Hybrid)",
      workMode: "HYBRID",
      salary: "€3.8K-€4.8K / month",
    });
  });

  it("skips noise lines (Actively recruiting, Fast growing)", () => {
    expect(parsed?.jobs[0].salary).toBeNull();
  });
});

describe("parseAlertEmail — Jobgether", () => {
  const parsed = parseAlertEmail(JOBGETHER_ALERT);

  it("recognizes the format, decoding awstrack redirects", () => {
    expect(parsed?.format).toBe("jobgether");
    expect(parsed?.jobs).toHaveLength(2);
    expect(parsed?.jobs[0].url).toBe(
      "https://jobgether.com/offer/abc123-software-engineer-ii",
    );
  });

  it("captures salary and remote-from location; company is unknown", () => {
    expect(parsed?.jobs[1]).toMatchObject({
      title: "Backend Engineer",
      company: null,
      salary: "120.0 - 160.0K",
      location: "Remote from: Spain",
      workMode: "REMOTE",
    });
  });
});

describe("parseAlertEmail — fallback", () => {
  it("returns null for unrecognized content", () => {
    expect(parseAlertEmail("A newsletter about something else entirely.")).toBeNull();
  });
});

describe("splitCompanyLocation", () => {
  it.each([
    ["Northwind Netherlands (Remote)", "Northwind", "Netherlands (Remote)"],
    ["Copperfen Madrid, Community of Madrid, Spain", "Copperfen", "Madrid, Community of Madrid, Spain"],
    ["Copperfen Humanes de Madrid, Community of Madrid, Spain", "Copperfen", "Humanes de Madrid, Community of Madrid, Spain"],
    ["Ria Money Transfer Alcobendas, Community of Madrid, Spain", "Ria Money Transfer", "Alcobendas, Community of Madrid, Spain"],
    ["El Corte Inglés Madrid, Community of Madrid, Spain", "El Corte Inglés", "Madrid, Community of Madrid, Spain"],
    ["Bluefern Systems Amsterdam Area (Hybrid)", "Bluefern Systems", "Amsterdam Area (Hybrid)"],
  ])("%s", (line, company, location) => {
    expect(splitCompanyLocation(line)).toEqual({ company, location });
  });

  it("keeps the whole line as company when no place-name is found", () => {
    expect(splitCompanyLocation("Van Lanschot Kempen Den Bosch")).toEqual({
      company: "Van Lanschot Kempen Den Bosch",
      location: null,
    });
  });
});

describe("decodeTrackingUrl", () => {
  it("decodes awstrack wrappers and strips utm params", () => {
    expect(
      decodeTrackingUrl(
        "https://x1.r.us-east-1.awstrack.me/L0/https:%2F%2Fjobgether.com%2Foffer%2Fabc%3Futm_source=brevo%26utm_medium=email/1/0100/sig=9",
      ),
    ).toBe("https://jobgether.com/offer/abc");
  });

  it("leaves plain URLs alone but still strips utm params", () => {
    expect(decodeTrackingUrl("https://example.com/job?id=5&utm_source=x")).toBe(
      "https://example.com/job?id=5",
    );
  });
});
