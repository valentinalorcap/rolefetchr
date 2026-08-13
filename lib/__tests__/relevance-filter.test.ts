import { describe, expect, it } from "vitest";
import { isIrrelevant } from "@/lib/relevance-filter";

describe("isIrrelevant (title-based relevance gate)", () => {
  it.each([
    "Full Stack Engineer",
    "Senior Frontend Engineer (Angular)",
    "Backend Developer (Node.js)",
    "Software Engineer",
    "TypeScript Developer",
    "Tech Lead",
    "React Native Engineer",
  ])("keeps targeted software roles: %s", (title) => {
    expect(isIrrelevant(title)).toBe(false);
  });

  it.each([
    "Marketing Manager",
    "Customer Success Manager",
    "Registered Nurse",
    "Account Executive",
  ])("drops roles with no software signal: %s", (title) => {
    expect(isIrrelevant(title)).toBe(true);
  });

  it.each([
    "Civil Engineer",
    "Electrical Engineer",
    "Sales Engineer",
    "Solutions Engineer",
    "Support Engineer",
    "DevOps Engineer",
    "Security Engineer",
    "Platform Engineer",
  ])("drops out-of-scope engineering roles: %s", (title) => {
    expect(isIrrelevant(title)).toBe(true);
  });

  it.each([
    "Junior React Developer",
    "Software Engineer Intern",
    "Staff Software Engineer",
    "Graduate Software Engineer",
  ])("drops seniorities outside the target: %s", (title) => {
    expect(isIrrelevant(title)).toBe(true);
  });
});
