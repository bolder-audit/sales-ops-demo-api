#!/usr/bin/env node
/**
 * Exercise the mock end to end against a running server.
 *
 *   node server.js &
 *   node test.js
 *
 * Point it elsewhere with BASE and DEMO_API_KEY. Run this against your deployment before
 * debugging your own integration, so you know which side is at fault.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE || "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.DEMO_API_KEY || "demo_key_public_sample_do_not_reuse";
const H = { authorization: `Bearer ${KEY}`, "content-type": "application/json" };

let pass = 0;
const failures = [];
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name} ${extra}`.trim());
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

const get = async (p) => {
  const r = await fetch(BASE + p, { headers: H });
  return { code: r.status, body: await r.json() };
};
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b || {}) });
  return { code: r.status, body: await r.json() };
};
const poll = async (jobId, ms = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const { body } = await get(`/v1/jobs/${jobId}`);
    if (body.state !== "running") return body;
    if (Date.now() - t0 > ms) throw new Error(`job ${jobId} never left running`);
    await new Promise((r) => setTimeout(r, 700));
  }
};

(async () => {
  console.log(`\nsales-ops-demo-api test  ->  ${BASE}\n`);

  console.log("contract");
  ok("health needs no auth", (await (await fetch(`${BASE}/v1/health`)).json()).ok === true);
  ok("no key is 401", (await fetch(`${BASE}/v1/projects`)).status === 401);
  ok("wrong key is 403", (await fetch(`${BASE}/v1/projects`, { headers: { authorization: "Bearer nope" } })).status === 403);

  const created = await post("/v1/projects", { name: "Test Co" });
  ok("create is 201 and intake", created.code === 201 && created.body.status === "intake", `got ${created.code}`);
  const empty = created.body.project_id;

  const r1 = await post(`/v1/projects/${empty}/run`, { action: "draft_sow" });
  ok("run is 202 with a poll path", r1.code === 202 && !!r1.body.job_id && !!r1.body.poll, `got ${r1.code}`);
  ok("a run with no source material says so", !!r1.body.warning);
  const r2 = await post(`/v1/projects/${empty}/run`, { action: "draft_sow" });
  ok("second run is 409 and keeps the first job", r2.code === 409 && r2.body.job_id === r1.body.job_id, `got ${r2.code}`);
  ok("unknown action is 400", (await post(`/v1/projects/${empty}/run`, { action: "nope" })).code === 400);

  const j1 = await poll(r1.body.job_id);
  ok("job reaches succeeded", j1.state === "succeeded", j1.state);
  ok("a sourceless document is visibly a shell", /No source material/.test((await get(j1.artifact.content)).body.markdown));

  ok("feedback: scope change", (await post(`/v1/projects/${empty}/feedback`, { note: "Please add invoicing" })).body.recorded.classified_as === "scope_change");
  ok("feedback: question", (await post(`/v1/projects/${empty}/feedback`, { note: "What is the timeline?" })).body.recorded.classified_as === "question");
  ok("feedback: answer", (await post(`/v1/projects/${empty}/feedback`, { note: "Yes, confirmed" })).body.recorded.classified_as === "answer");
  ok("feedback: discussion", (await post(`/v1/projects/${empty}/feedback`, { note: "Sharing this with my partner tonight." })).body.recorded.classified_as === "discussion");

  ok("approve is always 403", (await post(`/v1/projects/${empty}/approve`)).code === 403);
  ok("send is always 405", (await post(`/v1/projects/${empty}/send`)).code === 405);

  console.log("\nsource material");
  const seed = await get("/v1/projects/proj_nwf_8817");
  ok("the seed project ships with a document", (seed.body.documents || []).length === 1 && seed.body.documents[0].words > 1000);

  const transcriptPath = path.join(__dirname, "data", "northwind-discovery-call.md");
  const transcript = fs.readFileSync(transcriptPath, "utf8");
  const p = (await post("/v1/projects", { name: "Northwind Freight (test)" })).body.project_id;
  const up = await post(`/v1/projects/${p}/documents`, { filename: "discovery-call.md", kind: "transcript", text: transcript });
  ok("documents is 201 with a word count", up.code === 201 && up.body.document.words > 1000, `${up.code}`);
  ok("documents without text is 400", (await post(`/v1/projects/${p}/documents`, { filename: "x.md" })).code === 400);
  ok("an oversize document is 413", (await post(`/v1/projects/${p}/documents`, { text: "x".repeat(400001) })).code === 413);
  ok("a brief at create becomes a document", (await post("/v1/projects", { name: "Brief Co", brief: "We need offline capture." })).body.documents.length === 1);

  console.log("\nextraction reads what you sent");
  const ex = await poll((await post(`/v1/projects/${p}/run`, { action: "extract" })).body.job_id);
  const proj = ex.result;
  const q = proj.extraction.questions;
  ok("questions are derived", proj.open_questions.length >= 4, `${proj.open_questions.length}`);
  ok("exclusions are derived", proj.decided.length >= 3, `${proj.decided.length}`);
  ok("every question cites a source line", q.every((x) => x.evidence && x.evidence.length > 20));
  const flat = transcript.replace(/\s+/g, " ");
  ok("every citation is really in the document", q.every((x) => flat.includes(x.evidence.replace(/\.\.\.$/, "").trim().slice(0, 60))));
  ok("no two questions cite the same line", new Set(q.map((x) => x.evidence)).size === q.length);
  ok("citations carry no speaker labels", q.every((x) => !/^\*\*[A-Z]/.test(x.evidence)));
  ok("modules come from the text", proj.extraction.themes.length >= 5, proj.extraction.themes.map((t) => t.key).join(","));

  // The control: a different document must produce a different scope, or none of this means anything.
  const other = (await post("/v1/projects", {
    name: "Bramble Books",
    brief: "An independent bookshop wants an events calendar and a members newsletter. Staff schedule readings and we report attendance monthly. We keep using our till.",
  })).body.project_id;
  const exOther = await poll((await post(`/v1/projects/${other}/run`, { action: "extract" })).body.job_id);
  const a = proj.extraction.themes.map((t) => t.key).sort().join(",");
  const b = exOther.result.extraction.themes.map((t) => t.key).sort().join(",");
  ok("a different document yields a different scope", a !== b, `${a} vs ${b}`);

  console.log("\ngenerated documents");
  const sow = await poll((await post(`/v1/projects/${p}/run`, { action: "draft_sow" })).body.job_id);
  ok("the job returns an artifact pointer", !!sow.artifact && !!sow.artifact.content);
  const art = await get(sow.artifact.content);
  ok("the artifact fetches as markdown", art.code === 200 && typeof art.body.markdown === "string");
  ok("the document is long enough to be awkward in a thread", art.body.words > 700, `${art.body.words} words`);
  ok("it names the project", art.body.markdown.includes("Northwind Freight (test)"));
  ok("it cites the source file", art.body.markdown.includes("discovery-call.md"));
  ok("it carries every derived module", proj.extraction.themes.every((t) => art.body.markdown.includes(t.title)));
  ok("it carries the open questions", art.body.markdown.includes(proj.open_questions[0].slice(0, 40)));
  ok("its section numbering has no gaps", (() => {
    const ns = [...art.body.markdown.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));
    return ns.length > 3 && ns.every((n, i) => n === i + 1);
  })(), [...art.body.markdown.matchAll(/^## (\d+)\./gm)].map((m) => m[1]).join(","));

  const rev = await poll((await post(`/v1/projects/${p}/run`, { action: "revise" })).body.job_id);
  ok("revise produces version 2", rev.artifact.version === 2, `v${rev.artifact.version}`);
  ok("version 1 is still retrievable", (await get(`/v1/artifacts/${sow.artifact.artifact_id}`)).code === 200);

  const prop = await poll((await post(`/v1/projects/${p}/run`, { action: "draft_proposal" })).body.job_id);
  ok("a proposal is produced", prop.artifact.type === "proposal");
  ok("the proposal states no price", /Not stated in this document/.test((await get(prop.artifact.content)).body.markdown));
  ok("approve is still 403 on a real project", (await post(`/v1/projects/${p}/approve`)).code === 403);
  ok("send is still 405 on a real project", (await post(`/v1/projects/${p}/send`)).code === 405);
  ok("an unknown artifact is 404", (await get("/v1/artifacts/art_nope")).code === 404);

  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error("\nharness error:", e.message);
  process.exit(1);
});
