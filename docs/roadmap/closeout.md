# Closing a milestone

Each milestone close-out does two things: lock the behaviour that must
not regress, and write down what that work changed about the next
milestone.

Do not close a milestone that is still in progress. Finish or explicitly
defer remaining scope first.

## 1. Freeze the behaviour

List the behaviours this milestone made part of the world's contract:
choices characters make, outcomes they record, data that is seeded or
saved, and inspection that other systems already rely on.

Encode that list as regression tests under
`packages/simulation/src/regression.test.ts`, grouped by milestone.
Keep them coarse. They should fail if the cycle changes, not if a
helper is renamed.

Existing unit tests stay. The close-out tests are the ones a later
milestone is not allowed to break quietly.

## 2. Run the suite

From the repository root:

```bash
pnpm typecheck
pnpm test
```

Headless server tests that bind ports need a normal (unsandboxed)
process. Do not skip them to close the milestone.

## 3. Notes for the next milestone

Write or update `docs/roadmap/notes/` for the milestone that comes
next. The note is a working brief, not a second roadmap.

Cover:

- What the current implementation actually does, where it will be
  in the way, and where it can be reused.
- Assumptions in the next milestone's original scope that are now
  sharper, cheaper, or wrong.
- Stubs to leave alone until a system reads them.
- Persistence, inspection, and test constraints the next work will
  hit (save versions, append-only catalogs, component arrays).

Refer back to that file when the next milestone starts. Update it if
implementation diverges; do not silently replace it.

## 4. Close the docs

In `docs/roadmap/milestones.md`:

- Mark the milestone **Complete**.
- Move deferred scope onto the milestone that will actually use it.
- Point at the regression tests and the notes file.
- Set the header to the next milestone.

Update architecture and design docs so they describe the finished
cycle, not leftover "still open" work.

The project must still run from a saved world after the close-out.
