import { describe, expect, it } from "vitest";
import { assertCanLinkExistingProjectSpan } from "../../src/calendar/calendar-linking-rules.js";
import type { Initiative } from "../../src/repositories/initiatives.js";

describe("calendar linking rules", () => {
  it("rejects an existing project span that already has an active binding before callers mutate it", () => {
    expect(() =>
      assertCanLinkExistingProjectSpan({
        initiative: project({ startDate: "2026-06-01", endDate: "2026-06-05" }),
        initiativeId: 1,
        hasActiveBinding: true,
        initialDirection: "google_to_dmax"
      })
    ).toThrow("already linked");
  });

  it("rejects DMAX-to-Google linking for an undated existing project span", () => {
    expect(() =>
      assertCanLinkExistingProjectSpan({
        initiative: project({ startDate: null, endDate: null }),
        initiativeId: 1,
        hasActiveBinding: false,
        initialDirection: "dmax_to_google"
      })
    ).toThrow("both startDate and endDate");
  });
});

function project(input: { startDate: string | null; endDate: string | null }): Initiative {
  return {
    id: 1,
    categoryId: 1,
    parentId: null,
    type: "project",
    projectPhase: "doing",
    name: "Project",
    status: "active",
    summary: null,
    markdown: "",
    startDate: input.startDate,
    endDate: input.endDate,
    isLocked: false,
    sortOrder: 1000,
    isSystem: false,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  };
}
