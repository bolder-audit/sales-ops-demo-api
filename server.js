#!/usr/bin/env node
/**
 * Sales Ops Demo API — a MOCK.
 *
 * This models the request/response contract of a document-generation workflow so an
 * integration can be built and tested against it. It is not connected to any production
 * system. Every project, artifact and URL below is synthetic.
 *
 * No dependencies. Node 18+.  Run:  node server.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.DEMO_API_KEY || "demo_key_public_sample_do_not_reuse";

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "projects.json"), "utf8"));
/** In-memory state. Restarting the server resets everything to the seed. */
let projects = JSON.parse(JSON.stringify(SEED));
const jobs = new Map();
let seq = 1000;

const RUN_ACTIONS = {
  extract: { seconds: 20, status: "clarifications_needed", artifact: null },
  draft_sow: { seconds: 45, status: "draft_ready", artifact: "sow" },
  revise: { seconds: 30, status: "draft_ready", artifact: "sow" },
  draft_proposal: { seconds: 40, status: "ready_for_approval", artifact: "proposal" },
};

const nowIso = () => new Date().toISOString();
const nextId = (prefix) => `${prefix}_${++seq}`;

function send(res, code, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const fail = (res, code, error, message, extra = {}) =>
  send(res, code, { error, message, ...extra });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Public view of a project. */
function view(p) {
  return {
    project_id: p.project_id,
    name: p.name,
    status: p.status,
    owner: p.owner,
    summary: p.summary,
    open_questions: p.open_questions,
    decided: p.decided,
    artifacts: p.artifacts,
    next_action: p.next_action,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

/** A run is asynchronous by design. Generation takes minutes, not milliseconds. */
function startJob(project, action) {
  const spec = RUN_ACTIONS[action];
  const id = nextId("job");
  const startedAt = Date.now();
  const job = {
    job_id: id,
    project_id: project.project_id,
    action,
    state: "running",
    started_at: nowIso(),
    estimated_seconds: spec.seconds,
    finished_at: null,
    result: null,
  };
  jobs.set(id, job);

  setTimeout(() => {
    const p = projects[project.project_id];
    if (!p) return;
    if (spec.artifact) {
      const prior = p.artifacts.filter((a) => a.type === spec.artifact);
      const version = prior.length ? Math.max(...prior.map((a) => a.version)) + 1 : 1;
      p.artifacts.push({
        type: spec.artifact,
        version,
        status: "draft",
        url: `https://example.invalid/demo/${p.project_id}/${spec.artifact}-v${version}`,
      });
    }
    p.status = spec.status;
    p.updated_at = nowIso();
    job.state = "succeeded";
    job.finished_at = nowIso();
    job.result = view(p);
  }, Math.min(spec.seconds, 8) * 1000); // demo runs finish in seconds, not the real duration

  return { job, elapsedMs: Date.now() - startedAt };
}

function classifyFeedback(note) {
  const t = String(note || "").toLowerCase();
  if (/\b(add|remove|instead of|swap|cut|drop|also need|change the scope)\b/.test(t)) return "scope_change";
  if (/\?\s*$|^(what|how|when|who|why|can you|could you|is it)\b/.test(t)) return "question";
  if (/\b(yes|confirmed|approved|that is right|correct|go ahead)\b/.test(t)) return "answer";
  return "discussion";
}

const routes = [
  {
    method: "GET",
    pattern: /^\/v1\/health$/,
    auth: false,
    handle: (_req, res) =>
      send(res, 200, { ok: true, service: "sales-ops-demo-api", mock: true, projects: Object.keys(projects).length }),
  },
  {
    method: "GET",
    pattern: /^\/v1\/projects$/,
    handle: (_req, res) => send(res, 200, { projects: Object.values(projects).map(view) }),
  },
  {
    method: "POST",
    pattern: /^\/v1\/projects$/,
    handle: async (req, res) => {
      const body = await readJson(req);
      if (!body.name) return fail(res, 400, "missing_field", "name is required");
      const id = nextId("proj");
      projects[id] = {
        project_id: id,
        name: String(body.name).slice(0, 120),
        status: "intake",
        owner: body.owner ? String(body.owner).slice(0, 60) : "demo.user",
        created_at: nowIso(),
        updated_at: nowIso(),
        summary: body.summary ? String(body.summary).slice(0, 600) : "Intake received. Nothing extracted yet.",
        open_questions: [],
        decided: [],
        artifacts: [],
        next_action: "Run the extract action against the supplied source material.",
        feedback_log: [],
      };
      return send(res, 201, view(projects[id]));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/projects\/([\w-]+)$/,
    handle: (_req, res, [id]) => {
      const p = projects[id];
      return p ? send(res, 200, view(p)) : fail(res, 404, "not_found", `no project ${id}`);
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/projects\/([\w-]+)\/run$/,
    handle: async (req, res, [id]) => {
      const p = projects[id];
      if (!p) return fail(res, 404, "not_found", `no project ${id}`);
      const body = await readJson(req);
      const action = String(body.action || "");
      if (!RUN_ACTIONS[action]) {
        return fail(res, 400, "unknown_action", `action must be one of: ${Object.keys(RUN_ACTIONS).join(", ")}`);
      }
      const inFlight = [...jobs.values()].find((j) => j.project_id === id && j.state === "running");
      if (inFlight) {
        return fail(res, 409, "run_in_flight", "this project already has a run in progress", { job_id: inFlight.job_id });
      }
      const { job } = startJob(p, action);
      return send(res, 202, {
        job_id: job.job_id,
        project_id: id,
        action,
        state: job.state,
        estimated_seconds: job.estimated_seconds,
        poll: `/v1/jobs/${job.job_id}`,
        note: "Generation is long-running. Poll the job; do not hold the request open.",
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs\/([\w-]+)$/,
    handle: (_req, res, [id]) => {
      const j = jobs.get(id);
      return j ? send(res, 200, j) : fail(res, 404, "not_found", `no job ${id}`);
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/projects\/([\w-]+)\/feedback$/,
    handle: async (req, res, [id]) => {
      const p = projects[id];
      if (!p) return fail(res, 404, "not_found", `no project ${id}`);
      const body = await readJson(req);
      if (!body.note) return fail(res, 400, "missing_field", "note is required");
      const entry = {
        at: nowIso(),
        source: body.source === "client" ? "client" : "internal",
        note: String(body.note).slice(0, 2000),
        classified_as: classifyFeedback(body.note),
      };
      p.feedback_log.push(entry);
      p.updated_at = entry.at;
      return send(res, 201, {
        project_id: id,
        recorded: entry,
        next_action:
          entry.classified_as === "scope_change"
            ? "Feedback changes scope. Run the revise action to regenerate the affected sections."
            : "Recorded. No regeneration required.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/projects\/([\w-]+)\/approve$/,
    handle: async (req, res, [id]) => {
      const p = projects[id];
      if (!p) return fail(res, 404, "not_found", `no project ${id}`);
      const body = await readJson(req);
      /**
       * Deliberate: an API caller can request approval, it can never grant it.
       * Pricing, payment terms and client send are decided by a named human, out of band.
       */
      return fail(res, 403, "requires_human_approval", "Approval is not grantable through this API.", {
        project_id: id,
        requested_artifact: body.artifact || null,
        gate: "commercial_approval",
        decided_by: "named human approver, out of band",
        why: "Pricing, payment terms and client send are held by a person, not a credential. An integration can surface the request and read the outcome. It cannot supply the decision.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/projects\/([\w-]+)\/send$/,
    handle: (_req, res, [id]) =>
      fail(res, 405, "not_implemented_by_design", "There is no send capability on this API.", {
        project_id: id,
        why: "Nothing reaches a client from an automated caller. Documents are produced as drafts and delivered to a human, who sends them.",
      }),
  },
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));

  if (!route) {
    return fail(res, 404, "no_route", `${req.method} ${url.pathname} is not a route on this API`);
  }
  if (route.auth !== false) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return fail(res, 401, "unauthorized", "Authorization: Bearer <key> required");
    if (token !== API_KEY) return fail(res, 403, "forbidden", "that key is not valid for this demo");
  }

  const params = url.pathname.match(route.pattern).slice(1);
  try {
    await route.handle(req, res, params);
  } catch (err) {
    fail(res, 400, "bad_request", err.message || "request could not be processed");
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`sales-ops-demo-api (MOCK) listening on http://localhost:${PORT}`);
    console.log(`demo key: ${API_KEY}`);
    console.log(`try: curl -s -H "Authorization: Bearer ${API_KEY}" http://localhost:${PORT}/v1/projects`);
  });
}

module.exports = { server, routes, classifyFeedback };
