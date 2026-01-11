# AGENTS.md

AI-Assisted Coding Rules for merchGent

This document governs how AI coding assistants
(Claude Sonnet, Gemini, GPT, and similar)
are expected to operate when contributing to this repository.

This repo builds **merchGent**, a read-only merchandising diagnostic system.

---

## Prime Directive

**You are assisting the construction of a merchandising doctor, not an automation engine.**

Your job is to:

- clarify
- structure
- implement scoped logic
- preserve intent and boundaries

You are NOT here to:

- over-engineer
- generalize prematurely
- invent features
- blur agent responsibilities

---

## Default Operating Mode

When working in this repo, assume:

- incremental development
- audit-mode-first thinking
- read-only analysis
- human review is always expected

Optimize for:

- clarity over cleverness
- explicit contracts over inference
- reversible decisions

---

## Allowed AI Behaviors

You MAY:

- Implement logic **inside an existing agent’s boundary**
- Add new diagnostic signals when scoped to an audit mode
- Refactor for clarity when behavior is unchanged
- Generate schemas, types, and data contracts
- Improve naming, structure, and readability
- Ask clarifying questions _only_ when scope or intent is ambiguous

---

## Disallowed AI Behaviors

You MUST NOT:

- Introduce new agent roles
- Merge responsibilities across agents
- Add mutation, execution, or “auto-fix” logic
- Add scoring systems without explicit instruction
- Introduce shared global state or memory
- Optimize for performance unless requested
- Invent product requirements or user intent

If unsure, **stop and ask**.

---

## Agent Boundary Enforcement

All code must live within one of these conceptual agents:

- Client Agent (orchestration, synthesis)
- Web Agent (crawl, render, extract)
- Merch Agent (merchandising diagnosis)
- Data Agent (state, trust, transaction readiness)

Rules:

- One file = one agent’s responsibility
- No cross-agent imports unless explicitly designed
- Data crosses boundaries only as structured output

If logic spans agents, it belongs in orchestration — not duplication.

---

## Audit-Mode First Rule

Before writing or changing code, identify:

1. Which audit mode this supports
2. Which agent owns the logic
3. What new diagnostic signal is produced

If you cannot answer all three, do not proceed.

---

## Output Discipline

When generating outputs:

- Separate **observation** from **opinion**
- Make assumptions explicit
- Attach severity only when justified
- Optimize for merch-leader readability

Avoid:

- vague language
- implied certainty
- hidden heuristics

---

## Claude Sonnet Specific Guidance

Claude is strongest at:

- structured reasoning
- long-form clarity
- boundary enforcement

Use Claude to:

- validate scope
- refactor for readability
- pressure-test logic against intent
- improve explanations and comments

Avoid using Claude to:

- invent product direction
- generalize abstractions prematurely

---

## Gemini Specific Guidance

Gemini is strongest at:

- pattern detection
- summarization
- surface-level consistency checks

Use Gemini to:

- review outputs for coherence
- detect missing cases
- validate maps and coverage

Avoid using Gemini to:

- define architecture
- make strong merchandising judgments

---

## GPT Specific Guidance

GPT is strongest at:

- rapid implementation
- schema generation
- iterative refinement

Use GPT to:

- scaffold audit logic
- implement data contracts
- create test fixtures
- iterate on outputs

Avoid using GPT to:

- silently infer intent
- merge roles for convenience

---

## Definition of Done (AI Work)

AI-generated work is considered complete when:

- scope is explicit
- agent boundaries are respected
- logic is understandable without prompt context
- no speculative features were introduced
- a human can review and reason about it easily

---

## Ask-First Situations

Pause and ask before proceeding if:

- a new agent role seems necessary
- persistent memory is proposed
- execution or mutation is implied
- business intent is unclear
- recommendations would materially affect revenue or trust

---

## Final Instruction to AI

If you are unsure what to do next, ask yourself:

**“Does this help a merch leader understand what is broken, why it matters, and what to do next — without changing anything?”**

If the answer is no, stop.
