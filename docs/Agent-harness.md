# Component agent token controls

The agent keeps the system contract and original request, a bounded activity ledger,
and the latest three complete assistant/tool turns. Older generated source arguments
are removed along with their tool results. Drafts on disk remain authoritative.
Frames are retained until the next model response, then replaced by a note. Default
file reads return at most 160 lines and roughly 10,000 characters, with a continuation
line number. Explicit ranges remain available.

Configuration (optional in `.env`):

- `AGENT_HISTORY_TURNS=3`: recent complete turns retained.
- `AGENT_MAX_CONTEXT_TOKENS=60000`: maximum conservative reservation per call.
- `AGENT_MAX_INPUT_TOKENS=250000`: cumulative input budget.

Before each call, the agent reserves one token per UTF-8 byte of text, tool arguments
and tool schemas, plus framing and 8192 tokens per image. This is intentionally
conservative, not an exact provider tokenizer. If context is too large, it retains
only one recent turn and checks again; otherwise it stops before dispatch. Actual
reported usage is charged after each response; missing usage is charged at the
reserved amount. This is a local spending guard, not a provider-enforced billing
cap. Different image accounting or hidden provider overhead can still exceed it.

Each job writes `usage.json` with per-call input/output tokens, cached input tokens
when reported, reservation, elapsed seconds, and tool names. No prompts, file
contents, credentials, or images are included in this trace. Compare total input,
uncached input, successful completion, checks and elapsed time together: lower token
usage is only useful if scene quality remains acceptable.

With vision enabled, `finish` must occur in a later turn than a passing check, so the
model has a chance to inspect the frames. Any subsequent check invalidates the old
passing status. This enforces review sequencing; it does not prove visual quality.

## Publishing only on finish

`check_component` (→ `staging.check_draft`) never publishes: the draft is installed in
`rendering/src/staging/` only while typecheck / contract / render run, and the staging area
is restored afterwards, pass or fail. The scene goes live only in `finish`
(→ `staging.publish`), which re-runs typecheck + contract, then writes the staging file,
manifest, generated index and scene catalog as one unit; any failure rolls all four back
and `finish` returns the error to the agent. A run that stops early (steps, budget, error)
therefore never leaves a half-reviewed scene available to the planner.

## Verification

Offline regression suite (no LLM calls):

```sh
PYTHONPATH=backend .venv/bin/python -m unittest discover -s backend/tests -v
```

Explicit live smoke test, using **only the API key in `TEST` in `.env` (OpenAI directly, `gpt-4.1-mini`; it does not exercise the MLflow gateway)**:

```sh
PYTHONPATH=backend .venv/bin/python backend/tests/live_harness_smoke.py
```

The live smoke makes two calls, checks tool arguments and continuation after history
compaction, and does not stage a scene. It is not an end-to-end scene benchmark.

## Next harness work

Use a fixed suite of requests (sorting, networking, charts) and compare the old/new
agent on the same test model and limits. Include semantic assertions on animation
state and multiple prop sets, not just successful renders. Measure pass rate and
cost per accepted scene before claiming an end-to-end saving.

Done: draft validation is separate from publishing, and publish rolls back source,
manifest, generated index and catalog together (see "Publishing only on finish"). Run generated
code in an isolated worker with no credentials or network: file-tool allowlists and
regex import checks alone do not isolate executed JavaScript.

## Verification recorded 2026-11-16

Seven offline regression tests passed, covering budget admission, missing usage,
tool parameter schemas, complete tool groups, source compaction, frame lifetime,
finish sequencing, pagination and file access denials. Python compilation and
`git diff --check` passed. The async tool tests required execution outside the
restricted development sandbox (thread completion stalled inside it).

The live smoke passed using the TEST API key with `gpt-4.1-mini`: two calls,
186 input tokens and 28 output tokens. A synthetic 12-turn source-heavy history
reduced the local reservation by 74.6%; this is not a measured scene-build saving.
No full scene build was run for this change.
