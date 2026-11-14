# Admin corrections: backend contract

The admin screen (`js/report/adminreport.js`) now saves each fix as a local draft
and pushes all drafts together. The front end works against today's backend
(it falls back to one `adminUpdateQuestion` call per fix). These are the backend
changes that make it fast and make the Drive-to-Neon sync treat a corrected
question as already corrected.

## 1. Question ids

* The content pipeline exports `"id": <questions.id>` on every question
  (`export/export_any_level.py`). `normQ` keeps it as `q.qid`.
* `reportQuestion` now receives `qid` (empty string for old files). Store it on
  the report row and return it from `adminListQuestionReports` as `qid`.
* `adminGetQuestion` and `adminUpdateQuestion` now receive `qid` as well. When it
  is present, locate the question by id; fall back to `fileId` + `index` only
  when it is empty.

## 2. `adminApplyCorrections` (new, optional)

Request: `{ items: "<JSON array>" }`. Each item:

```json
{
  "key": "q48213",
  "uid": "<fileId>_<index>",
  "qid": 48213,
  "fileId": "<file id>",
  "index": 12,
  "reportId": "<report id>",
  "reportReason": "wrong_answer",
  "correctedAt": "2026-11-13T09:41:00.000Z",
  "expectedQ": "13. question text as the admin loaded it",
  "before": { "question": "13. ...", "options": ["..."] },
  "after":  { "question": "...", "options": ["..."], "correctIndex": 2, "explanation": "..." },
  "adminNote": "optional",
  "closeReport": true
}
```

Response: `{ "success": true, "results": [ { "key": "q48213", "ok": true } , { "key": "...", "ok": false, "conflict": true, "error": "..." } ] }`.

Rules:

* One result per item, in any order, matched by `key`. One bad item must not fail
  the others.
* `correctedAt` is fixed when the admin saves the draft. Use it as the correction's
  timestamp and treat `(uid, correctedAt)` as the idempotency key, so a retried
  push does nothing twice.
* Conflict check: if the stored question no longer matches `expectedQ`, return
  `ok: false, conflict: true` for that item.
* If `closeReport` is true, mark `reportId` resolved and close the other open reports
  on the same question (as `adminUpdateQuestionReportStatus` does today).
* Mark each affected file corrected **once per file**, not once per item.
* Write the correction event so `syncCorrectionsSince` returns it with exactly the
  fields above (`uid`, `qid`, `fileId`, `correctedAt`, `before`, `after`, `note`).
* If the action is not implemented, return an error containing "Unknown action".
  The front end then falls back to the one-by-one path.

## 3. Why the pipeline needs `qid`

`sync/apply_corrections.py` (in the content pipeline repo) now matches an event by
`qid` first, following `canonical_id` if dedupe merged the row, and only then by
source number, identity and text. Exported files are renumbered on every export,
so the number inside `before.question` is not the source number and must not be
trusted when a `qid` is present.