---
"hunkdiff": patch
---

Fix a React infinite-render crash when enabling "View full file", restore single-letter shortcuts (`a`, `s`, `t`, `w`, `z`, …) that the sidebar letter-jump feature was swallowing (letter jumps now apply only to letters without a binding), and emit git-style `diff --git` headers for synthesized full-file patches.
