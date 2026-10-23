import { describe, expect, it } from "vitest";
import {
  classTone,
  confidenceLabel,
  filterFindings,
  formatBytes,
  formatDate,
  formatDateTime,
  isLiveJob,
  isOpenJob,
  paginate,
  pluralize,
  safeDownloadName,
  safeNextPath,
  shortId,
  statusLabel,
  statusTone,
  targetKindLabel,
  totalPages,
  workflowLabel,
} from "@/lib/ui";

describe("UI labels", () => {
  it("uses known labels and humanizes unknown values", () => {
    expect(workflowLabel("inspect_sqlite_database")).toBe("SQLite database");
    expect(workflowLabel("run_custom_task")).toBe("run custom task");
    expect(targetKindLabel("rust_binary")).toBe("Rust binary");
    expect(statusLabel("verified_relationship")).toBe("Verified relationship");
    expect(statusLabel("unknown_state")).toBe("unknown state");
  });

  it("maps semantic tones without inventing success", () => {
    expect(statusTone("succeeded")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("running")).toBe("live");
    expect(classTone("inferred")).toBe("warning");
    expect(classTone("proposed_code")).toBe("neutral");
  });
});

describe("UI formatting", () => {
  it("formats UTC dates deterministically", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate("2026-01-02T23:04:05.000Z")).toBe("2026-01-02");
    expect(formatDateTime("2026-01-02T03:04:05.000Z")).toBe("2026-01-02 03:04 UTC");
  });

  it("formats byte sizes and recessive values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(-1)).toBe("—");
  });

  it("formats confidence and counts", () => {
    expect(confidenceLabel(null)).toBe("—");
    expect(confidenceLabel(0.874)).toBe("87%");
    expect(pluralize(1, "job")).toBe("1 job");
    expect(pluralize(2, "finding")).toBe("2 findings");
  });

  it("truncates identifiers and sanitizes download names", () => {
    expect(shortId("123456789")).toBe("12345678");
    expect(shortId("123", 8)).toBe("123");
    expect(safeDownloadName("../../report final.json")).toBe("report-final.json");
    expect(safeDownloadName("..")).toBe("amethyst-output.txt");
    expect(safeDownloadName("///")).toBe("amethyst-output.txt");
  });
});

describe("UI filtering and safety", () => {
  const findings = [
    { title: "Auth flow", class: "observed", category: "auth", detail: "JWT", project_id: "a", project_name: "Alpha" },
    { title: "Cache guess", class: "inferred", category: "cache", detail: null, project_id: "b", project_name: "Beta" },
  ];

  it("filters by query, class, and project without mutating input", () => {
    expect(filterFindings(findings, { query: "jwt" })).toHaveLength(1);
    expect(filterFindings(findings, { findingClass: "inferred" })[0]?.title).toBe("Cache guess");
    expect(filterFindings(findings, { projectId: "a" })[0]?.title).toBe("Auth flow");
    expect(filterFindings(findings, {})).toHaveLength(2);
  });

  it("paginates defensively", () => {
    expect(paginate([1, 2, 3, 4], 1, 2)).toEqual([1, 2]);
    expect(paginate([1, 2, 3, 4], 0, 2)).toEqual([1, 2]);
    expect(totalPages(4, 2)).toBe(2);
    expect(totalPages(0, 2)).toBe(1);
  });

  it("only permits same-origin relative redirects", () => {
    expect(isOpenJob("claimed")).toBe(true);
    expect(isOpenJob("succeeded")).toBe(false);
    expect(isLiveJob("running")).toBe(true);
    expect(safeNextPath("/projects/1")).toBe("/projects/1");
    expect(safeNextPath("https://evil.example")).toBe("/overview");
    expect(safeNextPath("//evil.example")).toBe("/overview");
    expect(safeNextPath("/\\evil.example")).toBe("/overview");
    expect(safeNextPath(undefined, "/login")).toBe("/login");
  });
});
