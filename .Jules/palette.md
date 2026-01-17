## 2026-01-17 - [Form Accessibility Pattern]
**Learning:** Single-input "forms" implemented as `div`s break keyboard usability (Enter to submit) and accessibility (missing label association).
**Action:** Always wrap input+button groups in `<form>` tags, associate labels with `htmlFor`/`id`, and ensure `onSubmit` handlers call `e.preventDefault()` to preserve SPA state.
