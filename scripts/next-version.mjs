import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const BUMPS = ["major", "minor", "patch"];

/** @param {string} tag */
const parts = tag => /** @type {RegExpExecArray} */ (TAG.exec(tag)).slice(1).map(Number);

/** @param {string[]} tags @returns {string | null} */
export function latestVersion(tags) {
  const versions = tags.filter(t => TAG.test(t)).map(t => ({ t, p: parts(t) }));
  versions.sort((a, b) => b.p[0] - a.p[0] || b.p[1] - a.p[1] || b.p[2] - a.p[2]);
  return versions[0]?.t ?? null;
}

/** @param {string | null} latest @param {string} bump */
export function nextVersion(latest, bump) {
  if (!BUMPS.includes(bump)) throw new Error(`Unknown bump “${bump}”.`);
  const [major, minor, patch] = latest ? parts(latest) : [0, 0, 0];
  if (bump === "major") return `v${major + 1}.0.0`;
  if (bump === "minor") return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

/** @param {string[]} labels @returns {string | null} */
export function bumpFromLabels(labels) {
  const release = labels.filter(l => l.startsWith("release: "));
  if (release.length > 1) throw new Error("More than one release label.");
  const bump = release[0]?.slice("release: ".length);
  return bump && BUMPS.includes(bump) ? bump : null;
}

// Prints the next version for the labels in PR_LABELS (a JSON array), or nothing when the PR doesn't release.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bump = process.env.BUMP || bumpFromLabels(JSON.parse(process.env.PR_LABELS ?? "[]"));
  if (bump) {
    const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
    process.stdout.write(nextVersion(latestVersion(tags), bump));
  }
}
