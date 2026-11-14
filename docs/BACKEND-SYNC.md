# Backend synchronization handover

This is the backend work required by the frontend as of **Abhyas 2.40**. It is
written so a backend developer can implement and test it without reading the
whole frontend.

The frontend is already deployed. Until these changes exist it degrades safely:

* corrections still save one at a time through `adminUpdateQuestion`;
* old reports without a `qid` keep the position fallback and show a warning;
* **My reports** is device-local and does not follow the account.

---

## 1. Priority order

| Priority | Change | Why it matters |
|---|---|---|
| P0 | Store and return `qid` on question reports | Stops a report pointing at the wrong question after a re-export |
| P0 | Make `adminGetQuestion` / `adminUpdateQuestion` resolve by `qid` | The admin edits the question the student actually saw |
| P0 | Keep `qid` on correction events | The Drive-to-Neon pipeline matches the correct database row |
| P1 | Add `adminApplyCorrections` | One transaction for a batch of fixes; removes per-question waits |
| P1 | Add student `myQuestionReports` | **My reports** follows the account across devices |
| P2 | Return `qid` from `adminListQuestionReports` | Fills the admin editor and batch payload |
| P2 | Close all open reports for the same question on correction | One fix should clear every duplicate report |
| P2 | Mark the affected file corrected once per batch, not per item | Prevents a refresh storm |

The print, marks-summary, Google-search link and Weak-spots tab changes need no
backend work.

---

## 2. Schema assumptions

These names match the queries already used by the frontend and the pipeline.
If your project uses different names, keep the request/response contract and
change only the SQL identifiers.

Known columns:

* `questions`: `id`, `file_ref_id`, `question_number`, `question_text`,
  `options` (jsonb), `correct_index`, `correct_text`, `explanation`,
  `identity_key`, `source_identity`, `source_question_key`, `corrected_at`,
  `canonical_id`.
* `files`: `id`, `file_id` (the Drive/export id), `book_id`.
* `question_reports`: the existing report table used by
  `reportQuestion` / `adminListQuestionReports`.
* `admin_logs`: existing audit table used by the admin history screen.

### 2.1 Migration

```sql
-- 1. Stable question id on every report.
alter table public.question_reports
  add column if not exists qid bigint;

-- 2. Resolution metadata used by the admin and My reports screens.
alter table public.question_reports
  add column if not exists resolved_at timestamptz,
  add column if not exists corrected boolean not null default false,
  add column if not exists corrected_snapshot jsonb;

create index if not exists question_reports_qid_idx
  on public.question_reports (qid);

create index if not exists question_reports_user_time_idx
  on public.question_reports (username, reported_at desc);

-- 3. Correction event log consumed by syncCorrectionsSince and the
--    Drive-to-Neon pipeline. Existing projects may already have this table;
--    the IF NOT EXISTS lines are safe, but verify the column types first.
create table if not exists public.correction_events (
  id            bigserial primary key,
  dedupe_key    text not null,
  uid           text not null,
  qid           bigint,
  file_id       text not null,
  report_id     text,
  corrected_at  timestamptz not null,
  before        jsonb not null,
  after         jsonb not null,
  note          text,
  admin_user    text,
  created_at    timestamptz not null default now(),
  unique (dedupe_key, corrected_at)
);

create index if not exists correction_events_qid_idx
  on public.correction_events (qid);

create index if not exists correction_events_time_idx
  on public.correction_events (corrected_at);
```

### 2.2 Do not trust client identity

`username`, `token` and `adminToken` are already sent by the frontend.
Derive the acting user from the validated session; never accept a
client-supplied `username` as proof of identity. For admin actions, require the
admin permission that already guards `adminUpdateQuestion`.

---

## 3. `adminApplyCorrections` (new)

The admin queues fixes locally and pushes them together. The frontend sends:

```json
{
  "action": "adminApplyCorrections",
  "items": "[{\"key\":\"q48213\",\"uid\":\"fileA_12\",\"qid\":48213,\"fileId\":\"fileA\",\"index\":12,\"reportId\":\"r1\",\"reportReason\":\"wrong_answer\",\"correctedAt\":\"2026-11-13T09:41:00.000Z\",\"expectedQ\":\"13. Old stem\",\"before\":{\"question\":\"13. Old stem\",\"options\":[\"a\",\"b\"]},\"after\":{\"question\":\"New stem\",\"options\":[\"a\",\"b\"],\"correctIndex\":1,\"explanation\":\"Because.\"},\"adminNote\":null,\"closeReport\":true}]"
}
```

Note that `items` is a **JSON string**, not an array, because the existing
transport sends form fields as strings. Parse it once.

Expected response:

```json
{
  "success": true,
  "results": [
    { "key": "q48213", "ok": true },
    { "key": "q48214", "ok": false, "conflict": true, "error": "The question changed since you opened it." }
  ]
}
```

Rules:

* One result per item, matched by `key`. One bad item must not fail the others.
* `correctedAt` is fixed when the admin saved the draft. Use
  `(dedupe_key, corrected_at)` as the idempotency key; a retry returns
  `ok: true, duplicate: true` and does not write twice.
* `dedupe_key` is `q<qid>` when `qid` is present, otherwise `u<uid>`.
* If the stored question text no longer equals `expectedQ`, return
  `ok: false, conflict: true` and do not write.
* `closeReport` closes the named report and every other open report on the same
  question.
* Mark each affected file corrected **once per file**, not once per item.
* If the action is unavailable, return an error containing `Unknown action`.
  The frontend then falls back to `adminUpdateQuestion`.

### 3.1 Reference SQL function

This is a complete reference. Adapt the two marked lines to the existing helper
that `adminMarkFileCorrected` already uses.

```sql
create or replace function public.admin_apply_corrections(
  p_items jsonb,
  p_admin text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it            jsonb;
  v_key         text;
  v_uid         text;
  v_qid         bigint;
  v_file        text;
  v_index       integer;
  v_report      text;
  v_at          timestamptz;
  v_expected    text;
  v_before      jsonb;
  v_after       jsonb;
  v_close       boolean;
  v_note        text;
  v_q           public.questions%rowtype;
  v_new_text    text;
  v_new_opts    jsonb;
  v_new_idx     integer;
  v_new_correct text;
  v_results     jsonb := '[]'::jsonb;
  v_conflict    boolean;
  v_err         text;
  v_hops        integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'items must be a JSON array');
  end if;

  for it in select jsonb_array_elements(p_items) loop
    v_conflict := false;
    v_err := null;
    v_q := null;

    begin
      v_key := coalesce(it->>'key', '');
      v_uid := coalesce(it->>'uid', '');
      v_file := coalesce(it->>'fileId', '');
      v_report := nullif(it->>'reportId', '');
      v_note := nullif(it->>'adminNote', '');
      v_expected := coalesce(it->>'expectedQ', '');
      v_before := coalesce(it->'before', '{}'::jsonb);
      v_after := coalesce(it->'after', '{}'::jsonb);
      v_close := case when coalesce(it->>'closeReport', '') in ('false', '0', 'f')
                      then false else true end;
      v_qid := case when coalesce(it->>'qid', '') ~ '^[0-9]+$'
                    then (it->>'qid')::bigint else null end;
      v_index := case when coalesce(it->>'index', '') ~ '^[0-9]+$'
                      then (it->>'index')::integer else null end;
      v_at := coalesce(nullif(it->>'correctedAt', '')::timestamptz, now());

      if v_key = '' then
        raise exception 'key is required';
      end if;

      if exists (
        select 1 from public.correction_events e
        where e.dedupe_key = v_key and e.corrected_at = v_at
      ) then
        v_results := v_results || jsonb_build_object(
          'key', v_key, 'ok', true, 'duplicate', true
        );
        continue;
      end if;

      -- Resolve by stable id first.
      if v_qid is not null then
        select * into v_q from public.questions where id = v_qid;
        v_hops := 0;
        while v_q.id is not null and v_q.canonical_id is not null and v_hops < 10 loop
          select * into v_q from public.questions where id = v_q.canonical_id;
          v_hops := v_hops + 1;
        end loop;
      end if;

      -- Legacy fallback: Drive file id + 1-based question number.
      -- If question_number is not the position in the exported file, call the
      -- same resolver that adminUpdateQuestion already uses instead.
      if v_q.id is null and v_file <> '' and v_index is not null then
        select q.* into v_q
        from public.questions q
        join public.files f on f.id = q.file_ref_id
        where f.file_id = v_file
          and q.question_number = v_index + 1
        order by q.id
        limit 1;
      end if;

      if v_q.id is null then
        raise exception 'question not found';
      end if;

      if v_expected <> '' and v_q.question_text <> v_expected then
        v_conflict := true;
        raise exception 'The question changed since you opened it.';
      end if;

      v_new_text := coalesce(v_after->>'question', v_q.question_text);
      v_new_opts := coalesce(v_after->'options', v_q.options);
      v_new_idx := case when coalesce(v_after->>'correctIndex', '') ~ '^[0-9]+$'
                        then (v_after->>'correctIndex')::integer else null end;
      v_new_correct := case when v_new_idx is null then null
                            else v_new_opts->>v_new_idx end;

      update public.questions
      set question_text = v_new_text,
          options = v_new_opts,
          correct_index = v_new_idx,
          correct_text = v_new_correct,
          explanation = coalesce(v_after->>'explanation', explanation),
          corrected_at = v_at
      where id = v_q.id;

      insert into public.correction_events (
        dedupe_key, uid, qid, file_id, report_id, corrected_at,
        before, after, note, admin_user
      ) values (
        v_key, v_uid, v_q.id, v_file, v_report, v_at,
        v_before, v_after, v_note, p_admin
      ) on conflict (dedupe_key, corrected_at) do nothing;

      if v_close then
        update public.question_reports r
        set status = 'resolved',
            resolved_at = coalesce(r.resolved_at, now()),
            resolved_by = p_admin,
            corrected = true,
            corrected_snapshot = v_after
        where r.status = 'open'
          and (
            (v_report is not null and r.id = v_report)
            or (v_q.id is not null and r.qid = v_q.id)
            or (v_q.id is null and v_uid <> '' and r.uid = v_uid)
          );
      end if;

      -- Adapt this line: call the same function your existing
      -- adminMarkFileCorrected action uses so students poll the refresh.
      if v_file <> '' then
        perform public.admin_mark_file_corrected(v_file, p_admin);
      end if;

      v_results := v_results || jsonb_build_object('key', v_key, 'ok', true);
    exception when others then
      v_err := SQLERRM;
      v_results := v_results || jsonb_build_object(
        'key', v_key, 'ok', false, 'conflict', v_conflict, 'error', v_err
      );
    end;
  end loop;

  return jsonb_build_object('success', true, 'results', v_results);
end;
$$;

revoke all on function public.admin_apply_corrections(jsonb, text) from public;
grant execute on function public.admin_apply_corrections(jsonb, text) to service_role;
```

### 3.2 Important transaction note

The `exception when others` block is a **subtransaction per item**. One bad item
does not roll back the successful items, which is what the frontend expects.
Keep that shape if you rewrite this in TypeScript.

If `admin_mark_file_corrected` does not exist, replace the marked line with the
same update your existing `adminMarkFileCorrected` handler performs. Do not
invent a new marker table unless the student poller is changed too.

---

## 4. `reportQuestion` changes

The student report now sends `qid` (empty string on old clients):

```json
{
  "action": "reportQuestion",
  "username": "<from session>",
  "token": "<from session>",
  "uid": "fileA_12",
  "qid": 48213,
  "reason": "wrong_answer",
  "note": "Option C is correct.",
  "questionSnapshot": "13. The stem...",
  "optionsSnapshot": ["a", "b", "c", "d"],
  "correctIndex": 2,
  "chosenIndex": 1,
  "section": "practice",
  "appVersion": "2.40"
}
```

### 4.1 Insert

```sql
insert into public.question_reports (
  username, uid, qid, file_id, reason, note, question_snapshot,
  options_snapshot, correct_index, chosen_index, section,
  status, reported_at, app_version
) values (
  p_username, p_uid,
  case when p_qid ~ '^[0-9]+$' then p_qid::bigint else null end,
  split_part(p_uid, '_', 1), p_reason, p_note,
  left(p_question_snapshot, 1000), p_options::jsonb,
  p_correct_index, p_chosen_index, p_section,
  'open', now(), p_app_version
)
returning id;
```

`file_id` may already be a separate column in your table; keep that. The
important part is storing `qid` and returning the new report id.

Response:

```json
{ "success": true, "reportId": "<id>" }
```

### 4.2 Admin list

Add `qid` to the select behind `adminListQuestionReports`:

```sql
select id, uid, qid, file_id, reason, note, question_snapshot,
       options_snapshot, correct_index, chosen_index, section,
       status, reported_at, resolved_at, resolved_by, corrected,
       corrected_snapshot
from public.question_reports
order by reported_at desc
limit 500;
```

The admin screen already reads `qid`, `correctedSnapshot`, `openReporters` and
`status`. Keep the existing `openReporters` aggregation.

### 4.3 Admin read and update

Both actions now receive `qid`:

```json
{ "action": "adminGetQuestion", "fileId": "fileA", "index": 12, "qid": 48213 }
```

```json
{
  "action": "adminUpdateQuestion",
  "fileId": "fileA",
  "index": 12,
  "qid": 48213,
  "expectedQ": "13. Old stem",
  "correctedAt": "2026-11-13T09:41:00.000Z",
  "fields": "{\"q\":\"New stem\",\"options\":[\"a\",\"b\"],\"correct\":1,\"explanation\":\"...\"}",
  "reportId": "r1",
  "reportReason": "wrong_answer",
  "adminNote": null
}
```

Resolution order:

1. If `qid` is a positive integer, load that row (follow `canonical_id`).
2. Otherwise use the existing `fileId` + `index` resolver.
3. If `expectedQ` is supplied and does not equal the stored `question_text`,
   return `{ success: false, conflict: true, error: "The question changed..." }`.
4. Write the correction event with `qid` and the supplied `correctedAt`.

---

## 5. Student `myQuestionReports` (new)

This is the endpoint that makes **My reports** follow the account. The screen
is currently device-local; after this endpoint is live, the client should load
it on opening the tab and merge it with the local copy.

Request:

```json
{
  "action": "myQuestionReports",
  "username": "<from session>",
  "token": "<from session>"
}
```

Response:

```json
{
  "success": true,
  "reports": [
    {
      "id": "r1",
      "uid": "fileA_12",
      "qid": 48213,
      "reason": "wrong_answer",
      "section": "practice",
      "status": "resolved",
      "note": "Option C is correct.",
      "questionSnapshot": "13. The stem...",
      "reportedAt": "2026-11-13T09:40:00.000Z",
      "resolvedAt": "2026-11-13T09:41:00.000Z",
      "resolvedBy": "admin",
      "corrected": true,
      "correctedSnapshot": { "q": "13. New stem...", "options": ["a", "b"], "correct": 1 }
    }
  ]
}
```

### 5.1 Query

```sql
select id, uid, qid, reason, section, status, note, question_snapshot,
       reported_at, resolved_at, resolved_by, corrected, corrected_snapshot
from public.question_reports
where username = $1
order by reported_at desc
limit 100;
```

Use the username derived from the validated token. A client-supplied username
must not be able to read another student's reports.

### 5.2 Frontend handshake

Once the endpoint is deployed, add this to `js/report/userreport.js`:

```js
async historyFromServer() {
  if (!S.user || !S.user.username || !S.user.token) return null;
  if (!S.online || S.forcedOffline) return null;
  try {
    const r = await netFetch(APPS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'myQuestionReports',
        username: S.user.username,
        token: S.user.token
      })
    }, 15000);
    const res = await r.json();
    return res && res.success && Array.isArray(res.reports) ? res.reports : null;
  } catch (e) { return null; }
}
```

Merge by `(uid, reason)`, preferring the server's status over the local one,
and keep the local-only rows whose reports are still queued.

---

## 6. `getCorrections` changes

The student poller already understands this shape. Add `qid` to each correction
event and keep the existing fields:

```json
{
  "success": true,
  "now": 1763026860000,
  "files": { "fileA": true },
  "resolvedMine": ["r1"],
  "corrections": [
    {
      "uid": "fileA_12",
      "qid": 48213,
      "fileId": "fileA",
      "correctedAt": "2026-11-13T09:41:00.000Z",
      "before": { "question": "13. Old stem", "options": ["a", "b"] },
      "after": { "question": "New stem", "options": ["a", "b"], "correctIndex": 1, "explanation": "..." },
      "note": null
    }
  ]
}
```

`resolvedMine` should contain report ids, not just a count, so the student can
eventually mark the exact report resolved instead of guessing.

---

## 7. Pipeline changes (Drive-to-Neon)

These belong in the content pipeline repository, not the Edge Function.

### 7.1 Export

`export/export_any_level.py` must write the database id on every question:

```python
def build_question(new_number, q_text, options, correct_idx, explanation, images,
                   qid=None):
    body = strip_leading_number(q_text)
    item = {
        "id": qid,
        "q": f"{new_number}. {body}",
        "options": list(options or []),
        "correct": correct_idx,
        "explanation": explanation or "",
    }
    # ... existing image fields ...
    return item
```

Pass `qid=qid` when building each chunk.

### 7.2 Apply corrections

`sync/apply_corrections.py` must try the stable id first:

```python
def find_match(cur, before_question, before_options, before_identity,
               file_id=None, qid=None):
    if qid is not None:
        row = match_by_qid(cur, qid)
        if row is not None:
            return row, "qid"
    # ... existing content/number fallback ...
```

`match_by_qid` follows `canonical_id` and must stop after 10 hops so a cycle
cannot hang the worker.

### 7.3 Alias identity

The alias row must be keyed by the **original source identity**, not the
post-edit identity. Prefer the stored `source_identity`; fall back to
`identity_key` only for old rows. Otherwise the next sync no longer recognises
the untouched source question.

---

## 8. Acceptance checks

Run these against a staging project before production.

### Reports

1. `reportQuestion` with `qid=48213` stores `qid=48213` and returns `reportId`.
2. `adminListQuestionReports` returns that `qid`.
3. An old client sending no `qid` still creates a report with `qid = null`.
4. A student token cannot read another student's `myQuestionReports`.

### Corrections

5. `adminGetQuestion` with `qid` returns the question even if the file was
   re-exported and the position moved.
6. `adminUpdateQuestion` with stale `expectedQ` returns `conflict: true` and
   writes nothing.
7. `adminApplyCorrections` with two items, one conflict, returns two results and
   applies only the good one.
8. Sending the same `(dedupe_key, correctedAt)` twice writes one
   `correction_events` row and returns `duplicate: true` the second time.
9. `closeReport: true` closes the named report and every other open report on
   the same `qid`; `false` closes none.
10. A batch touching three questions in one file calls the file-corrected
    helper once, not three times.

### Sync

11. Re-export a file, then apply a correction made before the re-export. It
    still lands on the same `questions.id`.
12. Run the correction again; `correction_backlog` does not grow.
13. `getCorrections` returns `qid` and the student poller updates the saved
    copy once.

---

## 9. Deployment order

1. Apply the SQL migration.
2. Deploy `admin_apply_corrections` and the Edge Function routes.
3. Deploy the pipeline export change and re-export files so new reports carry
   `qid`.
4. Deploy the pipeline `apply_corrections.py` change.
5. Deploy `myQuestionReports`; then update the frontend handshake.
6. Watch `correction_backlog` for `not_found_in_source_file` after the first
   real batch.

The current frontend remains compatible at every step. The batch action is
optional: without it the admin uses the slower one-by-one path.

---

## 10. Known gaps to confirm against the real backend

* `question_number` may not be the exported position. If not, reuse the exact
  resolver already inside `adminUpdateQuestion` for the legacy fallback.
* `admin_mark_file_corrected` is a placeholder name for the helper behind the
  existing `adminMarkFileCorrected` action. Use the real helper.
* `question_reports.file_id` may be named differently; the frontend only needs
  the response fields above.
* `correction_events` may already exist. Check its unique key before adding a
  second one.
* The frontend still merges local and server report histories until the
  handshake in section 5.2 ships.