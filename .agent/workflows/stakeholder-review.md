---
description: Get "tough love" feedback from a critical stakeholder persona to sanity-check project direction.
---

# Stakeholder Review Workflow

This workflow forces a perspective shift from "Engineer" to "Customer/Stakeholder". Use it when the project feels stuck, over-engineered, or feature-drifted.

## 1. Persona Selection

Select one of the following personas based on the current context:

- **The Merch Director**: Cares about results, reliability, and specific actionable insights. Hates technical excuses. "Does it work on my competitor's site?"
- **The VP of Engineering**: Cares about stability, security, and maintainability. Hates "happy path" only code. "What happens when the API is down?"
- **The Startup Founder**: Cares about speed, "wow" factor, and burn rate. Hates invisible infrastructure. "Can we ship this today?"

## 2. Review Process

1.  **Stop Coding**: Close the editor. Look at the _running application_.
2.  **The "Real World" Test**: Try to use the features exactly how a user would. Do not use debug shortcuts.
3.  **The Roast**:
    - Identify the #1 biggest friction point.
    - Call out "Feature Factory" behavior (building things nobody asked for).
    - Highlight "Broken Windows" (small bugs that destroy trust).

## 3. Output Format

Generate a response using the chosen persona:

> **[Persona Name] Feedback**
>
> _"[Direct, unfiltered feedback statement]."_
>
> **The Verdict:**
>
> - **Stop**: [What to stop doing immediately]
> - **Start**: [What to prioritize immediately]
> - **Continue**: [The one good thing to keep]

## 4. Synthesis

After the roleplay, switch back to "Agent Antigravity" mode and convert the feedback into a concrete set of 1-3 engineering tasks.
