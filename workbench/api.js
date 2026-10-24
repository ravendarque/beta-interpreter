import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { addPhrase, addWords, movePhrase, removePhrase } from "./vocab-edit.js";

const run = promisify(execFile);
const root = new URL("..", import.meta.url);
const TERMS = new URL("vocabulary/terms.json", root);
const WORDS = new URL("vocabulary/words.json", root);
const BIOME = new URL("node_modules/.bin/biome", root);

/** @param {string[]} args */
const git = async args => (await run("git", args, { cwd: root })).stdout;
/** @param {URL} file */
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
/** @param {URL} file @param {unknown} data */
async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  await run(BIOME.pathname, ["format", "--write", file.pathname], { cwd: root });
}

async function status() {
  const [sha, diff, stat] = await Promise.all([
    git(["rev-parse", "--short", "HEAD"]),
    git(["diff", "--", "vocabulary"]),
    git(["diff", "--numstat", "--", "vocabulary"]),
  ]);
  return { sha: sha.trim(), diff, changed: stat.split("\n").filter(Boolean).length };
}

/** @type {Record<string, (body: any) => Promise<unknown>>} */
const POST = {
  async "/api/vocabulary/phrase"({ action, termId, fromTermId, phrase }) {
    const { terms } = await readJson(TERMS);
    const next =
      action === "add"
        ? addPhrase(terms, termId, phrase)
        : action === "remove"
          ? removePhrase(terms, termId, phrase)
          : action === "move"
            ? movePhrase(terms, fromTermId, termId, phrase)
            : null;
    if (!next) throw new Error(`Unknown action “${action}”.`);
    await writeJson(TERMS, { terms: next });
    return { ok: true };
  },
  async "/api/vocabulary/words"({ list, words: items, region }) {
    if (!Array.isArray(items) || !items.every(w => typeof w === "string")) throw new Error("Send the words as a list.");
    const [{ terms }, words] = await Promise.all([readJson(TERMS), readJson(WORDS)]);
    const result = addWords(words, list, items, terms, region);
    if (result.added.length) await writeJson(WORDS, result.words);
    return { added: result.added, skipped: result.skipped };
  },
};

/** @type {Record<string, () => Promise<unknown>>} */
const GET = {
  async "/api/vocabulary"() {
    const [{ terms }, words] = await Promise.all([readJson(TERMS), readJson(WORDS)]);
    return { terms, words };
  },
  "/api/status": status,
};

/** @param {import("node:http").IncomingMessage} req */
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("The request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** @param {import("node:http").IncomingMessage} req */
function isLocalJson(req) {
  const origin = req.headers.origin;
  const local = !origin || /^http:\/\/(localhost|127\.0\.0\.1):5174$/.test(origin);
  return local && req.headers["content-type"]?.startsWith("application/json") === true;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => void} next
 */
export async function handle(req, res, next) {
  const path = req.url?.split("?")[0] ?? "";
  const handler = req.method === "POST" ? POST[path] : req.method === "GET" ? GET[path] : undefined;
  if (!handler) return next();
  if (req.method === "POST" && !isLocalJson(req)) {
    res.statusCode = 403;
    return res.end();
  }
  res.setHeader("Content-Type", "application/json");
  try {
    res.end(JSON.stringify(await handler(req.method === "POST" ? await body(req) : undefined)));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}
