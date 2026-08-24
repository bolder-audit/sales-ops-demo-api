# Sales Ops Demo API

A **mock** of the request/response contract for a sales-document workflow: intake a client
brief, generate a scope of work, take feedback, revise, and produce a proposal draft.

Build and test an integration against this. It runs locally, has no dependencies, and returns
realistic shapes for every call.

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

Override with `PORT` and `DEMO_API_KEY` if you want different values. State is in memory, so
restarting resets everything to the seed data in `data/projects.json`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | liveness, no auth |
| GET | `/v1/projects` | list projects |
| POST | `/v1/projects` | create from a brief (`name`, optional `summary`, `owner`) |
| GET | `/v1/projects/{id}` | current status, open questions, artifacts, next action |
| POST | `/v1/projects/{id}/run` | start generation (`action`: `extract`, `draft_sow`, `revise`, `draft_proposal`) |
| GET | `/v1/jobs/{id}` | poll a run |
| POST | `/v1/projects/{id}/feedback` | append feedback (`note`, `source`: `client` or `internal`) |
| POST | `/v1/projects/{id}/approve` | request approval. **Always refuses.** See below. |
| POST | `/v1/projects/{id}/send` | not implemented, by design. See below. |

Auth is `Authorization: Bearer <key>` on everything except `/v1/health`. Missing key returns
401, wrong key returns 403.

## Three behaviours worth building against

These are the parts that make an integration correct rather than merely working. They are
modelled here deliberately.

**1. Generation is asynchronous.** `POST /run` returns `202` with a `job_id` and a `poll` path.
It does not return the document. Real generation takes tens of minutes, so an integration that
holds a request open will time out and an integration that assumes a synchronous result will be
wrong about state. Post a receipt, poll the job, update when it lands.

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"action":"draft_sow"}' http://localhost:8787/v1/projects/proj_nwf_8817/run
```

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

- `proj_nwf_8817` Northwind Freight, `clarifications_needed`, three open questions
- `proj_hvd_4402` Harborview Dental, `draft_ready`, carries a feedback entry
- `proj_kes_2231` Kestrel Outdoor Co, `ready_for_approval`, exercises the approval refusal

## Files

```
server.js              the mock, ~250 lines, no dependencies
openapi.yaml           the same contract as a spec
data/projects.json     seed data, all synthetic
```
