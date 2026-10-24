import { describe, expect, it } from "vitest";
import { bumpFromLabels, latestVersion, nextVersion } from "../scripts/next-version.mjs";

describe("release versions", () => {
  it("bumps from the latest version", () => {
    expect([nextVersion("v0.1.0", "patch"), nextVersion("v0.1.3", "minor"), nextVersion("v0.4.2", "major")]).toEqual([
      "v0.1.1",
      "v0.2.0",
      "v1.0.0",
    ]);
  });

  it("starts from v0.0.0 when nothing has been released", () => {
    expect([nextVersion(null, "minor"), nextVersion(null, "patch")]).toEqual(["v0.1.0", "v0.0.1"]);
  });

  it("picks the highest version tag, ignoring anything else", () => {
    expect(latestVersion(["v0.2.0", "v0.10.1", "v0.9.9", "nightly", "v1.0.0-rc.1", "v0.10.0"])).toBe("v0.10.1");
    expect(latestVersion([])).toBe(null);
  });

  it("reads the bump from the release label, and none or no label means no release", () => {
    expect(bumpFromLabels(["bug", "release: minor"])).toBe("minor");
    expect(bumpFromLabels(["release: none"])).toBe(null);
    expect(bumpFromLabels([])).toBe(null);
  });

  it("refuses more than one release label", () => {
    expect(() => bumpFromLabels(["release: minor", "release: patch"])).toThrow("More than one release label.");
  });

  it("refuses an unknown bump", () => {
    expect(() => nextVersion("v0.1.0", "huge")).toThrow("Unknown bump “huge”.");
  });
});
