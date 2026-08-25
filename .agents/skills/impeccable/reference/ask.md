Map a described situation onto the command or sequence of commands that fits, then stop. What the user gets back is the next thing to type, and they type it.

This routes, it does not build. Do not run the command you just named, do not open a design file, and do not start the work.

## What this owns, and what it does not

A bare `$impeccable` reads this project's signals and answers "what next here". [routing.md](routing.md) owns that. This command answers a different question, "I am in this situation, what is the path", and it answers from the map below rather than from signals.

Setup has already run `context.mjs`. Answer from what it reported rather than running anything again. `NO_PRODUCT_MD` means the project has no captured context, so `init` leads every route.

## The contract

Every answer carries three things:

- **The exact string.** `$impeccable critique src/pricing`, rather than "run critique".
- **Where the sequence goes next**, and what that next step reads from this one.
- **Where the user decides**, since most routes have a fork this map cannot resolve.

When two commands both fit, name one and say why the other is wrong for this situation, rather than handing back both.

## The main flow

Idea to shipped surface. Most work travels some contiguous stretch of this.

1. `init`, once per project. Captures product truth in PRODUCT.md, which every step below reads.
2. `shape <feature>` when flow, information architecture, or states need deciding before code exists. Skip it when the only open question is implementation.
3. **The build itself has no command.** Describe the surface and new-work runs: the visual world, then the surface concept, then the code.
4. `document` once the surface ships. Records DESIGN.md from what the code does rather than from what was intended.
5. `critique <surface>`. The design review, and it writes a scored snapshot.
6. `polish <surface>`, which reads that snapshot as its backlog. Polish run first has nothing to work from.
7. `audit <surface>` for a11y, performance, and responsive behavior. Separate from critique on purpose: critique judges the design, audit checks the build.
8. `harden <surface>` last, for error states, i18n, and the edge cases the happy path skipped.

Steps 5 through 8 are the ship sequence and the order holds: each one leaves the surface in a state the next one reads.

## On-ramps

Work that arrived rather than work the user started. Each merges onto the main flow.

| Situation                                         | Route                                                                                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An existing codebase, no Impeccable artifacts     | `init`, then `document`, then `critique <surface>`. Init captures the product, document captures the system already in the code, and critique is the first judgment worth having on it.                                                      |
| "It looks off and I cannot say why"               | `critique <surface>`. The scored snapshot turns a feeling into a backlog, which is what the refine commands consume.                                                                                                                         |
| The design hook or the detector flagged something | `audit <surface>` for a mixed set of hits. A single slop family goes straight to the command that owns it: gradient text or eyebrow labels to `quieter` or `typeset`, a flat or gray palette to `colorize`, uniform type sizes to `typeset`. |
| Artifacts out of date                             | `doctor`. This is repair work, and it stays out of the design task in hand.                                                                                                                                                                  |
| A command already chosen                          | Nothing useful here. Invoke that command.                                                                                                                                                                                                    |

## Two commands that look interchangeable

The line between them is one concrete test, rather than a matter of taste.

| Pair                           | The test                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `critique` / `audit`           | Would a designer catch it, or a Lighthouse run? Critique judges the design, audit checks a11y, performance, and responsive behavior.                              |
| `critique` / `polish`          | Critique judges and writes the snapshot, polish acts on it. Critique first.                                                                                       |
| `bolder` / `overdrive`         | Is the design safe, or already strong? Bolder raises bland work to the craft floor, overdrive pushes work that already clears it past conventional limits.        |
| `distill` / `quieter`          | Too much stuff, or too much shouting? Distill removes elements, quieter lowers the intensity of the ones that stay.                                               |
| `distill` / `layout`           | Is the wrong thing present, or the right thing badly placed? Layout fixes spacing, rhythm, and hierarchy while keeping every element.                             |
| `clarify` / `harden`           | Does the copy read badly, or is the state missing? Clarify rewrites labels and messages, harden designs the error, empty, and edge states that have no copy yet.  |
| `document` / `extract`         | Document records the system the code already has and changes nothing. Extract pulls tokens and components into a reusable system, and changes code.               |
| `live` / any refine command    | Does the user know what they want, or do they need to see options? Live generates variants to pick from in the browser, the refine commands edit source directly. |
| `shape` / describing the build | Is there a decision about flow, IA, or states, or only implementation? Shape plans, a plain description goes straight to the build.                               |

## Platform gate

`live` and the bundled detector read HTML and CSS in a browser, so they are web only. When `setup.platform` is `ios`, `android`, or `adaptive`, leave both out of the route. `audit` and `adapt` still apply there and load their native variants on their own.

## Open the reference before asserting

When a claim about what a command does decides the route, open that command's reference file and answer from it. A one-line summary drifts from the command it describes, and a route built on a stale gloss sends the user somewhere wrong with full confidence. Reading one file costs less than the wrong recommendation.
