"use strict";
/**
 * Derivation for the mock: read the source documents attached to a project and produce
 * open questions, settled items, and a document body FROM THAT TEXT.
 *
 * Deterministic and rule-based. The point is that the output visibly depends on what was
 * sent in, so an integration can tell a real intake from an empty one. It is not a model
 * and it is not our production pipeline.
 */

/** Split a corpus into sentences, keeping them short enough to quote back. */
function sentences(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    // Speaker labels are transcript formatting, not part of the quote.
    .map((s) => s.replace(/^\*{0,2}[A-Z][\w.'-]{0,20}:\*{0,2}\s*/, ""))
    .filter((s) => s.length > 25 && s.length < 400);
}

/** Words that mark a sentence as stating an intention or a constraint rather than describing. */
const INTENT = /\bwant\b|\bneed\b|\bmust\b|\bshould\b|\bdo not\b|\bwould\b|\brather\b|\bprefer\b|\bmatters\b|\bcannot\b/i;

/**
 * The best quotable sentence for a rule, not merely the first.
 *
 * Picking the first match produced citations that were technically hits and obviously the
 * wrong line, which undermines the point of citing anything. Score by how strongly the
 * sentence carries the theme, prefer sentences that state an intention, and never reuse a
 * sentence already spent on another item.
 */
function evidenceFor(sents, re, used = new Set()) {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let best = null;
  // Any match beats no match. The scores below RANK candidates; they must never be able to
  // reject the only one, which silently dropped a true exclusion when this floor was -1.
  let bestScore = -Infinity;
  for (const s of sents) {
    if (used.has(s)) continue;
    global.lastIndex = 0;
    const hits = (s.match(global) || []).length;
    if (!hits) continue;
    let score = hits * 3;
    if (INTENT.test(s)) score += 4;
    if (s.length >= 70 && s.length <= 260) score += 2;
    if (s.length < 45) score -= 4; // a fragment is a poor citation even when it matches
    if (/\?$/.test(s)) score -= 2; // a question in the transcript is rarely the best statement of a need
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best) return null;
  used.add(best);
  return best.length > 220 ? `${best.slice(0, 217)}...` : best;
}

/**
 * Themes are the capability areas the mock knows how to describe. A theme enters the scope
 * only when the source text mentions it, so a different document produces a different scope.
 */
const THEMES = [
  {
    key: "offline",
    title: "Offline Capture and Sync",
    match: /\boffline\b|\bno (?:signal|service|connectivity|reception)\b|\bbad reception\b|\blose (?:people|signal|them)\b|\bfive bars\b|\bconnectivity\b/i,
    question:
      "Offline behaviour: which actions must complete with no connectivity and sync afterwards, and which may require a live connection?",
    blocks: {
      description:
        "Field actions are captured on the device and queued locally when connectivity is unavailable, then synchronised when the device regains a connection. The queue survives an app restart and a device restart.",
      flow: "The user completes an action with no connection. The app confirms capture locally and marks the item pending. On reconnection the queue drains oldest first and each item resolves to synced or conflicted.",
      edges:
        "Connection returns mid-upload. The same item is queued twice from two devices. The queue exceeds its storage budget. Server state changed while the device was offline.",
      criteria: [
        "An action captured offline is visible in the local queue with a pending state.",
        "The queue drains automatically on reconnection with no user action.",
        "A conflicting item is surfaced for resolution rather than silently discarded.",
        "Queued items survive an app restart.",
      ],
    },
  },
  {
    key: "matching",
    title: "Assignment and Offer Sequencing",
    match: /\bmatch(?:ing|ed)?\b|\bassign(?:ment|ing)?\b|\boffer\b|\bdispatch(?:er|ers|ing)?\b|\bshort ?list\b|\bauction\b|\btier\b/i,
    question:
      "Offer sequence tiers: how many recipients are in the first tier, and how long before an unaccepted item opens to the next?",
    blocks: {
      description:
        "Work is offered to a filtered, ordered set of recipients rather than broadcast to everyone. Hard filters exclude anyone who cannot perform the work. Remaining recipients are ordered into tiers and the offer widens on a timer.",
      flow: "An item is posted. Hard filters run. The first tier is notified. On acceptance the item closes and the remaining recipients are told it is gone. With no acceptance inside the window the next tier is added.",
      edges:
        "Two recipients accept within the same second. Nobody accepts at any tier. The item is cancelled while an offer is live. A recipient's eligibility changes mid-offer.",
      criteria: [
        "An ineligible recipient never receives the offer.",
        "Exactly one acceptance is recorded when two arrive simultaneously.",
        "The offer widens on the configured timer without manual action.",
        "An exhausted offer sequence escalates rather than failing silently.",
      ],
    },
  },
  {
    key: "visibility",
    title: "Status Visibility and Notifications",
    match: /\bvisibility\b|\btrack(?:ing)?\b|\bwhere (?:their|the|it|that)\b|\bstatus\b|\bnotif(?:y|ication)/i,
    question:
      "External visibility: a portal at launch, or notifications only with the portal staged to a later phase?",
    blocks: {
      description:
        "Status is recorded as it changes and made available to the parties entitled to see it, through notification on change and a read-only view of current state.",
      flow: "A status change is recorded. Subscribed parties receive a notification on their chosen channel. The current state is available on demand without contacting anyone.",
      edges:
        "Status changes several times inside the notification window. A recipient has no valid contact channel. A party is entitled to some fields but not others.",
      criteria: [
        "Every status change is timestamped and attributed.",
        "Notifications are grouped rather than sent once per change inside the window.",
        "A read-only viewer sees only the fields their role permits.",
      ],
    },
  },
  {
    key: "capture",
    title: "Proof of Completion Capture",
    match: /\bphoto\b|\bsignature\b|\bproof\b|\bbill of lading\b|\bpaperwork\b|\bscan\b|\bupload\b|\bdocument capture\b/i,
    question:
      "Capture requirements: what must be present on a submission before it is accepted as complete?",
    blocks: {
      description:
        "Completion is evidenced by capture on the device at the point of work: an image, a signature, and the structured fields that make the record usable downstream.",
      flow: "The user marks work complete, captures the image and signature, confirms the structured fields, and submits. The submission is queued if offline and acknowledged when it lands.",
      edges:
        "The image is unreadable. The signature is skipped. A submission arrives twice. A correction is needed after acceptance.",
      criteria: [
        "A submission missing a required element cannot be marked complete.",
        "An accepted submission is immutable and corrections create a new version.",
        "Captured media is retained at a resolution that stays legible after compression.",
      ],
    },
  },
  {
    key: "payments",
    title: "Payment Trigger and Settlement Timing",
    match: /\bpay(?:ment|ing|s)?\b|\bach\b|\binvoic(?:e|ing)\b|\bbilling\b|\bsettle(?:ment)?\b|\bget paid\b/i,
    question:
      "Payment trigger: does an accepted submission release payment automatically, or does it enter an approval queue first?",
    blocks: {
      description:
        "An accepted completion record starts the payment clock. The system holds the state a payment run reads, and records what was paid against which work.",
      flow: "A submission is accepted. The item enters the payable state with its amount and date. The payment run reads payable items for the period and marks them settled.",
      edges:
        "A submission is accepted after the period closes. An amount is disputed after entering payable. A payment run partially fails.",
      criteria: [
        "Payable state is derived from acceptance, never entered by hand.",
        "Every settled item references the completion record that released it.",
        "A partially failed run is resumable without double paying.",
      ],
    },
  },
  {
    key: "accounting",
    title: "Accounting System Boundary",
    match: /\bquickbooks\b|\bxero\b|\bsage\b|\bnetsuite\b|\bbookkeep(?:er|ing)\b|\baccounting\b|\berp\b/i,
    question:
      "Accounting boundary: which direction does data move, and which system owns the record once it exists in both?",
    blocks: {
      description:
        "The existing accounting system is retained. This platform exports the records it owns and does not duplicate ledger functions.",
      flow: "Records reach a settled state here. An export runs on a schedule. The accounting system remains the ledger of record and is not written to outside the agreed surface.",
      edges:
        "An export partially applies. A record is edited on both sides between exports. The accounting system is unavailable when the export runs.",
      criteria: [
        "Export failures are visible and retryable, never silent.",
        "No ledger function is reimplemented in this platform.",
        "The owning system for each field is stated and enforced.",
      ],
    },
  },
  {
    key: "roles",
    title: "Roles and Permissions",
    match: /\brole\b|\bpermission\b|\badmin\b|\bdispatcher\b|\bfront desk\b|\bstaff\b|\blogin for\b|\bportal\b/i,
    question:
      "Roles at launch: which distinct roles exist, and what is the narrowest set of permissions each needs?",
    blocks: {
      description:
        "Each user acts under a role that determines what they can see and do. Roles are assigned by an administrator and enforced on the server, not only in the interface.",
      flow: "An administrator invites a user and assigns a role. The user's view is composed from that role. A change to a role takes effect on the next request.",
      edges:
        "A role is revoked while the user is mid-session. A user holds two roles. An invitation is never accepted.",
      criteria: [
        "Permission is enforced server side and cannot be bypassed by the client.",
        "A revoked role takes effect without waiting for the session to expire.",
        "Every role's permitted actions are enumerated in one place.",
      ],
    },
  },
  {
    key: "reporting",
    title: "Operational Reporting",
    match: /\breport(?:ing|s)?\b|\bdashboard\b|\bvolume\b|\bmetric\b|\bhow many\b|\bper month\b|\bspreadsheet\b/i,
    question:
      "Reporting at launch: which three questions must the first release answer without an export?",
    blocks: {
      description:
        "A small set of operational views answers the questions asked daily, with an export for anything beyond them.",
      flow: "A user opens the view, sets a period, and reads current figures. An export produces the same figures as a file.",
      edges:
        "A period contains no data. A figure is requested mid-change. An export exceeds the row limit.",
      criteria: [
        "Each view states the period and the moment it was computed.",
        "An export matches the view it came from for the same period.",
      ],
    },
  },
];

/** Statements the source marks as settled: out of scope, retained, or deferred. */
const DECISION_RULES = [
  {
    match: /\bout of scope\b|\bnot (?:in scope|responsible for)\b|\bdo not want to be responsible\b|\bkeep it that way\b/i,
    text: "An explicit scope boundary was stated on the call and is carried into the scope as an exclusion.",
  },
  {
    match: /\bnot replacing\b|\bnot being replaced\b|\bkeep(?:s|ing)? using\b|\bstays?\b(?=[^.]*\b(?:in place|as is|the same)\b)/i,
    text: "An existing system is retained rather than replaced, and integration is limited to the agreed surface.",
  },
  {
    match: /\blater phase\b|\bdeferred?\b|\beventually\b|\bphase two\b|\bstage it\b|\bnot (?:on )?day one\b/i,
    text: "At least one capability was deferred to a later phase rather than included in the first release.",
  },
];

/**
 * Sentences where the speaker is visibly undecided. These become questions verbatim.
 *
 * Deliberately narrow. A looser rule caught "Depends on the lane", which is an answer about
 * how long covering a load takes, not an open decision, and a question set full of those is
 * worse than a short one.
 */
const UNCERTAINTY = /\bgo back and forth\b|\bi do not know\b|\bi don't know\b|\bnot sure\b|\bundecided\b|\bhave not decided\b|\bi would rather (?:talk|not|see|wait)\b|\bhave to think\b/i;

function corpusOf(project) {
  return (project.documents || []).map((d) => d.text).join("\n\n");
}

/** Front matter and disclaimers describe the file, not the business. */
const BOILERPLATE = /\bsynthetic\b|\bdemo(?:nstration)? material\b|\bgenerated \d|\bdo not treat\b|^attendees\b|^date:|^duration:/i;

/** Two sentences where the speaker describes what the business is or needs. */
const SELF_DESCRIBING = /\bwe (?:are|do|have|run|sit|use|need|want)\b|\bour \w+ (?:is|are)\b/i;

function summarise(sents) {
  const picked = sents
    .filter((s) => !BOILERPLATE.test(s) && SELF_DESCRIBING.test(s))
    .slice(0, 2);
  if (!picked.length) return null;
  const text = picked.join(" ");
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

/**
 * Read the attached documents and derive what a scoping pass would surface.
 * Returns null when there is nothing to read, which is a state the caller must handle.
 */
function extractFrom(project) {
  const corpus = corpusOf(project);
  if (!corpus.trim()) return null;
  const sents = sentences(corpus);

  const themes = THEMES.filter((t) => t.match.test(corpus));

  // One sentence is quoted once. Two questions citing the same line reads as a bug.
  const used = new Set();

  const questions = [];
  for (const t of themes) {
    questions.push({
      text: t.question,
      theme: t.key,
      evidence: evidenceFor(sents, t.match, used),
    });
  }
  const undecided = sents.filter((s) => UNCERTAINTY.test(s) && s.length >= 45 && !used.has(s));
  for (const s of undecided.slice(0, 3)) {
    used.add(s);
    questions.push({
      text: `The source leaves this open and it needs a decision before the scope can be priced: "${s}"`,
      theme: "stated_uncertainty",
      evidence: s,
    });
  }

  // Exclusions get their own budget of sentences. One line can legitimately justify both a
  // module and a boundary; what must not happen is two questions quoting the same line.
  const usedByDecisions = new Set();
  const decided = [];
  for (const r of DECISION_RULES) {
    const ev = evidenceFor(sents, r.match, usedByDecisions);
    if (ev) decided.push({ text: r.text, evidence: ev });
  }

  return {
    suggested_summary: summarise(sents),
    source_words: corpus.split(/\s+/).filter(Boolean).length,
    source_documents: (project.documents || []).map((d) => d.filename),
    themes: themes.map((t) => ({ key: t.key, title: t.title })),
    questions,
    decided,
  };
}

function block(title, body) {
  return `${title}\n\n${body}\n`;
}

/** Build a scope-of-work body from the derived extraction. Long by design. */
function sowMarkdown(project, extraction, version) {
  const themes = THEMES.filter((t) => extraction.themes.some((x) => x.key === t.key));
  const parts = [];

  parts.push(`# Scope of Work

**Prepared for:** ${project.name}
**Version:** ${version}
**Status:** DRAFT

*Synthetic document produced by a mock API. The structure and length are representative of a
real deliverable. The content is generated from the source material attached to this project
and is not professional advice.*

---

## 1. Overview

${project.summary}

This document defines the work for the first release. It names each capability, the flow a
user follows through it, the conditions that must be handled, and the criteria by which the
capability is judged complete. Anything not named here is not included, and the exclusions in
section ${themes.length + 3} are as binding as the inclusions.

The scope below was derived from ${extraction.source_documents.length} source document${
    extraction.source_documents.length === 1 ? "" : "s"
  } totalling ${extraction.source_words.toLocaleString("en-US")} words: ${extraction.source_documents.join(", ")}.

## 2. Scope Summary

The first release covers ${themes.length} module${themes.length === 1 ? "" : "s"}:

${themes.map((t, i) => `${i + 1}. **${t.title}**`).join("\n")}

Each is specified in full below.
`);

  themes.forEach((t, i) => {
    const n = i + 3;
    parts.push(`---

## ${n}. ${t.title}

${block("### Description", t.blocks.description)}
${block("### User Flow", t.blocks.flow)}
${block("### Edge Cases", t.blocks.edges)}
### Acceptance Criteria

${t.blocks.criteria.map((c) => `- ${c}`).join("\n")}
`);
  });

  const outN = themes.length + 3;
  parts.push(`---

## ${outN}. Out of Scope

The following are deliberately excluded from this release. Each may be revisited as separate,
separately priced work.

${
  extraction.decided.length
    ? extraction.decided.map((d) => `- ${d.text}\n  - Source: "${d.evidence}"`).join("\n")
    : "- No exclusions were stated in the source material. This list must be completed before the scope is signable."
}

## ${outN + 1}. Assumptions and Dependencies

- Source material is limited to the documents listed in section 1. Anything decided outside them is not reflected here.
- Third-party systems named in the source remain under their existing contracts and administration.
- Content, credentials and access required for integration are supplied before the module that needs them begins.
- Acceptance is judged against the criteria in each module, not against unstated expectations.

## ${outN + 2}. Open Questions

These must be answered before this scope can be priced. Each is carried in the project record
and blocks the associated module.

${extraction.questions.map((q, i) => `${i + 1}. ${q.text}${q.evidence ? `\n   - Source: "${q.evidence}"` : ""}`).join("\n\n")}

## ${outN + 3}. Timeline

Indicative only, and dependent on the open questions above being closed.

| Stage | Duration |
|---|---|
| Discovery and design | 2 weeks |
| Build | ${Math.max(4, themes.length * 2)} weeks |
| Quality assurance | 2 weeks |
| Release and handover | 1 week |

## ${outN + 4}. Next Steps

Answer the open questions in section ${outN + 2}, in writing or on a call. Once they are
closed this scope is revised and priced. Pricing, payment terms and delivery to a client are
decided by a named person and are not produced by this system.
`);

  return parts.join("\n");
}

function proposalMarkdown(project, extraction, version) {
  const themes = THEMES.filter((t) => extraction.themes.some((x) => x.key === t.key));
  return `# Proposal

**Prepared for:** ${project.name}
**Version:** ${version}
**Status:** DRAFT, awaiting human approval

*Synthetic document produced by a mock API. It carries no prices, deliberately.*

---

## What we propose

${project.summary}

The engagement delivers ${themes.length} module${themes.length === 1 ? "" : "s"}, specified in
the scope of work attached to this project:

${themes.map((t) => `- **${t.title}**`).join("\n")}

## Approach

Discovery confirms the open questions are closed. Design fixes the flows named in the scope.
Build proceeds module by module in the order above, each reaching its acceptance criteria
before the next begins. Quality assurance runs against those criteria rather than against
impressions. Release includes handover and a defined support period.

## Commercial terms

**Not stated in this document.** Pricing, payment schedule and terms are decided by a named
human approver, out of band, and are attached before this proposal is sent to anyone.

An automated caller can request approval and read the outcome afterwards. It cannot supply
the decision, and no credential grants it. Requesting approval on this project returns
403 \`requires_human_approval\` by design.

## Acceptance

This proposal becomes an agreement on countersignature by both parties. Delivery to the
recipient is performed by a person.
`;
}

module.exports = { extractFrom, sowMarkdown, proposalMarkdown, THEMES };
