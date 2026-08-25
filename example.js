#!/usr/bin/env node
/**
 * Walk the full sequence against a running server and print what comes back.
 *
 *   node server.js &
 *   node example.js
 *
 * Point it elsewhere with BASE and DEMO_API_KEY.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE || "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.DEMO_API_KEY || "demo_key_public_sample_do_not_reuse";
const H = { authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const get = async (p) => (await fetch(BASE + p, { headers: H })).json();
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b || {}) });
  return { code: r.status, body: await r.json() };
};
const step = (n, s) => console.log(`\n${"=".repeat(70)}\n${n}. ${s}\n${"=".repeat(70)}`);

async function poll(jobId) {
  process.stdout.write("   polling");
  for (;;) {
    const j = await get(`/v1/jobs/${jobId}`);
    if (j.state !== "running") {
      console.log(` -> ${j.state}`);
      return j;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

(async () => {
  step(1, "Create a project");
  const created = await post("/v1/projects", { name: "Northwind Freight" });
  const id = created.body.project_id;
  console.log(`   ${created.code} ${id}  status=${created.body.status}  documents=${created.body.documents.length}`);

  step(2, "Attach source material");
  const text = fs.readFileSync(path.join(__dirname, "data", "northwind-discovery-call.md"), "utf8");
  const up = await post(`/v1/projects/${id}/documents`, {
    filename: "discovery-call.md",
    kind: "transcript",
    text,
  });
  console.log(`   ${up.code} ${up.body.document.filename}  ${up.body.document.words} words`);

  step(3, "Extract, asynchronously");
  const ex = await post(`/v1/projects/${id}/run`, { action: "extract" });
  console.log(`   ${ex.code} job=${ex.body.job_id}  poll=${ex.body.poll}  source_documents=${ex.body.source_documents}`);
  const busy = await post(`/v1/projects/${id}/run`, { action: "extract" });
  console.log(`   a second run while that one is live -> ${busy.code} ${busy.body.error} (job ${busy.body.job_id})`);
  await poll(ex.body.job_id);

  step(4, "What it read out of the document");
  const p = await get(`/v1/projects/${id}`);
  console.log(`   modules found: ${p.extraction.themes.map((t) => t.title).join(", ")}\n`);
  p.extraction.questions.slice(0, 3).forEach((q, i) => {
    console.log(`   Q${i + 1}. ${q.text}`);
    console.log(`        source: "${q.evidence}"\n`);
  });
  console.log(`   ...and ${p.open_questions.length - 3} more. Settled items: ${p.decided.length}`);

  step(5, "Generate the scope of work");
  const sow = await poll((await post(`/v1/projects/${id}/run`, { action: "draft_sow" })).body.job_id);
  console.log(`   artifact ${sow.artifact.artifact_id} v${sow.artifact.version}, ${sow.artifact.words} words`);
  const art = await get(sow.artifact.content);
  console.log(`   fetched ${art.markdown.length} characters from ${sow.artifact.content}\n`);
  console.log(art.markdown.split("\n").slice(0, 14).map((l) => `   | ${l}`).join("\n"));
  console.log("   | ...");

  step(6, "Feedback is classified");
  for (const note of [
    "Please add a shipper portal to the scope",
    "What is the timeline on this?",
    "Yes, confirmed, that is right",
  ]) {
    const fb = await post(`/v1/projects/${id}/feedback`, { note, source: "client" });
    console.log(`   "${note}"\n     -> ${fb.body.recorded.classified_as}: ${fb.body.next_action}`);
  }

  step(7, "Revise, and the version increments");
  const rev = await poll((await post(`/v1/projects/${id}/run`, { action: "revise" })).body.job_id);
  console.log(`   now at ${rev.artifact.type} v${rev.artifact.version}; v1 is still at /v1/artifacts/${sow.artifact.artifact_id}`);

  step(8, "The two refusals");
  const ap = await post(`/v1/projects/${id}/approve`, { artifact: "sow" });
  console.log(`   POST /approve -> ${ap.code} ${ap.body.error}`);
  console.log(`     ${ap.body.why}`);
  const sd = await post(`/v1/projects/${id}/send`);
  console.log(`\n   POST /send    -> ${sd.code} ${sd.body.error}`);
  console.log(`     ${sd.body.why}`);
  console.log("\n   Both are permanent. Render them as a state, not as an error to retry.\n");
})().catch((e) => {
  console.error("\nfailed:", e.message);
  console.error("is the server running?  node server.js &");
  process.exit(1);
});
