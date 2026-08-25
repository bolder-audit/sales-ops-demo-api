# Sales Ops Demo API

A **mock** of the request/response contract for a sales-document workflow: attach source
material, extract what it says, generate a scope of work, take feedback, revise, and produce a
proposal draft.

Build and test an integration against this. It has no dependencies and returns realistic shapes
for every call.

> **This is a demonstration server with synthetic data.**
> It is not connected to any production system. Every project, client, artifact and URL in
> here is invented. `example.invalid` is a reserved non-resolving domain, by design.

## Run it

```bash
node server.js
# sales-ops-demo-api (MOCK) listening on http://localhost:8787
```

Node 18 or newer. No `npm install` required.

```bash
export KEY=demo_key_public_sample_do_not_reuse
curl -s -H "Authorization: Bearer $KEY" http://localhost:8787/v1/projects
```

Override with `PORT` and `DEMO_API_KEY`. State is in memory, so restarting resets everything to
the seed data in `data/`.

## Deploy it

To reach it over HTTPS, run it anywhere that hosts a Node process: Render, Railway, Fly, Cloud
Run. There is no build step and no database.

```bash
PORT=$PORT DEMO_API_KEY=<pick your own> node server.js
```

Set `DEMO_API_KEY` to a value you choose rather than the sample above, so the credential in your
connection form is yours.

## Test it

```bash
node server.js &
node test.js
```

44 checks covering the whole contract, including the refusals and the derivation. Point it at a
deployment with `BASE` and `DEMO_API_KEY`. Run this before debugging your own integration, so
you know which side is at fault.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | liveness, no auth |
| GET | `/v1/projects` | list projects |
| POST | `/v1/projects` | create (`name`, optional `summary`, `owner`, `brief`) |
| GET | `/v1/projects/{id}` | status, open questions, extraction, artifacts, next action |
| POST | `/v1/projects/{id}/documents` | **attach source material** (`text`, optional `filename`, `kind`) |
| POST | `/v1/projects/{id}/run` | start generation (`extract`, `draft_sow`, `revise`, `draft_proposal`) |
| GET | `/v1/jobs/{id}` | poll a run |
| GET | `/v1/artifacts/{id}` | **fetch a generated document body** |
| POST | `/v1/projects/{id}/feedback` | append feedback (`note`, `source`) |
| POST | `/v1/projects/{id}/approve` | request approval. **Always refuses.** |
| POST | `/v1/projects/{id}/send` | not implemented, by design. |

Auth is `Authorization: Bearer <key>` on everything except `/v1/health`. Missing key returns
401, wrong key returns 403.

## Documents in, documents out

Everything a run produces is derived from the documents attached to the project. Nothing is
derived from the project name.

`example.js` walks the whole sequence and prints what comes back at each step:

```bash
node server.js &
node example.js
```

The same thing by hand, against the seed project that already carries a transcript:

```bash
# start a run and note the job_id
curl -s -X POST -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"action":"extract"}' \
  http://localhost:8787/v1/projects/proj_nwf_8817/run

# poll it
curl -s -H "Authorization: Bearer $KEY" http://localhost:8787/v1/jobs/<job_id>

# read the derived questions and the evidence behind each one
curl -s -H "Authorization: Bearer $KEY" http://localhost:8787/v1/projects/proj_nwf_8817
```

`extract` returns an `extraction` block on the project: the capability themes it found, the
open questions those raise, and what the source settled. **Every derived item quotes the
sentence it came from**, so you can show a reader why a question is being asked.

`draft_sow` produces a document of roughly two thousand words. The job returns a *pointer*;
fetch the body from `/v1/artifacts/{id}`. That length is deliberate. Deciding how to present a
document that does not fit in a chat message is most of the integration work.

A project with no source material still runs, and produces a shell that says so. The `202`
response carries a `warning` when that is about to happen. An integration that renders that
shell as a finished document is reporting work that did not happen.

`data/northwind-discovery-call.md` is a 1,400-word synthetic discovery call, seeded onto
`proj_nwf_8817` so the difference between a project with source material and one without is
visible immediately.

## Three behaviours worth building against

These are the parts that make an integration correct rather than merely working. They are
modelled here deliberately.

**1. Generation is asynchronous.** `POST /run` returns `202` with a `job_id` and a `poll` path.
It does not return the document. Real generation takes tens of minutes, so an integration that
holds a request open will time out and an integration that assumes a synchronous result will be
wrong about state. Post a receipt, poll the job, update when it lands.

One run per project at a time. A second concurrent run returns `409` with the in-flight
`job_id`, because two generators writing the same document is a corruption, not a queue.

**2. Feedback is classified, not just stored.** `POST /feedback` returns what the note was read
as: `scope_change`, `question`, `answer` or `discussion`, and whether that requires
regeneration. Not every message in a thread changes a document.

**3. Approval and send are not API operations.**

`POST /approve` always returns `403 requires_human_approval`. `POST /send` always returns
`405 not_implemented_by_design`. This is the contract, not an unfinished feature.

Pricing, payment terms and client send are held by a named person and decided out of band. An
integration can surface that a decision is needed and read the outcome afterwards. It cannot
supply the decision, and no credential grants it. A workflow that could approve its own
proposal and send it to a client has removed the only control that made it safe to automate the
rest.

Build the request-and-notify path. Treat both refusals as expected responses and render them as
a state ("waiting on a human"), never as an error to retry.

## Status values

`intake` → `clarifications_needed` → `draft_ready` → `ready_for_approval`

`GET /v1/projects/{id}` also returns `open_questions` (what a human must answer before the work
can proceed) and `decided` (what has been settled and should not be reopened). An integration
that surfaces both gives a reader the state of a deal in one message.

## Seed data

Three synthetic projects at different stages:

- `proj_nwf_8817` Northwind Freight, carries the discovery transcript, three open questions
- `proj_hvd_4402` Harborview Dental, `draft_ready`, carries a feedback entry
- `proj_kes_2231` Kestrel Outdoor Co, `ready_for_approval`, exercises the approval refusal

## Files

```
server.js                          the mock, no dependencies
generate.js                        derives questions and document bodies from source text
test.js                            44 checks against a running server
openapi.yaml                       the same contract as a spec
data/projects.json                 seed projects, all synthetic
data/northwind-discovery-call.md   synthetic discovery call, 1,400 words
```
