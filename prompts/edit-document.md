---
description: Edit a document while preserving its intent and facts
argument-hint: "<document> [editing instructions]"
---
Edit ${ARGUMENTS:-the document identified in the current context}.

Apply the requested changes directly to that document. Preserve its intent, factual claims, scope, and useful detail unless the user explicitly asks to change them. Improve clarity, organization, consistency, and concision where that supports the request. Do not invent facts, silently remove important qualifications, or impose arbitrary paragraph-length limits.

Review the resulting document for accuracy and coherence. Do not modify unrelated files.
