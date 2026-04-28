Financial Info Prompt Guide

Active prompt sets

1. GPT / richer instruction-following
- System: `system-prompt-financial-info.prompty`
- User: `updated-user-prompt-financial-info.txt`
- Use when the model follows long, layered instructions reliably.

2. Qwen / Ollama / tighter instruction-following
- System: `system-prompt-financial-info-qwen.prompty`
- User: `user-prompt-financial-info-qwen.txt`
- Use in production when the workspace chat model is Qwen via Ollama.

Supporting prompts

- Validation: `user-prompt-financial-info-validation.txt`
  - Review-only prompt for checking assembled Section 12 drafts.

Legacy prompts

- `user-prompt-financial-info.txt`
- `user-prompt-financial-info-01.prompty`

These are older, lighter financial-info prompts. Keep them only for reference or rollback. Do not treat them as the primary production prompt set.

Non-financial-info prompts

- `system-prompt-compliance.prompty`
- `user-prompt-compliance-01.prompty`
- `system-prompt-risk-factors.prompty`
- `user-prompt-risk-factors.txt`
- `user-prompt-risk-factors-01.prompty`
- `system-prompt-style-refiner.prompty`
- `user-prompt-style-refiner-01.prompty`

Recommended production setup for Qwen

1. Use `system-prompt-financial-info-qwen.prompty`.
2. Use `user-prompt-financial-info-qwen.txt`.
3. Keep `STYLE_REFERENCE_SNIPPETS` and `EVIDENCE_SNIPPETS_WITH_METADATA` separate.
4. Re-ingest accountant and style-reference PDFs after parser changes.
5. Validate sections individually before batch generation.

Why there are two financial-info prompt sets

- The richer prompt set is more explicit and redundant. GPT-class models generally benefit from that.
- The Qwen prompt set is shorter, flatter, and stricter. Local models typically follow that more consistently.
