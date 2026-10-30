# Judge comparison: ollama vs lmstudio

Book: .zibby/data/workflows/runs/coloring-book_1793093305496/book — 24 approved + 24 rejected pages

- ollama: pass 48/48, judge-error 0, median 7.3 s, total 381 s
- lmstudio: pass 48/48, judge-error 0, median 2.6 s, total 156 s
- verdict agreement: 48/48

| image | ollama | lmstudio |
|---|---|---|
| 01-approved.png | pass (-) | pass (-) |
| 02-approved.png | pass (-) | pass (-) |
| 03-approved.png | pass (-) | pass (-) |
| 04-approved.png | pass (-) | pass (-) |
| 05-approved.png | pass (-) | pass (-) |
| 06-approved.png | pass (-) | pass (-) |
| 07-approved.png | pass (-) | pass (-) |
| 08-approved.png | pass (-) | pass (-) |
| 09-approved.png | pass (-) | pass (-) |
| 10-approved.png | pass (-) | pass (-) |
| 11-approved.png | pass (-) | pass (-) |
| 12-approved.png | pass (-) | pass (-) |
| 13-approved.png | pass (-) | pass (-) |
| 14-approved.png | pass (-) | pass (-) |
| 15-approved.png | pass (-) | pass (-) |
| 16-approved.png | pass (-) | pass (-) |
| 17-approved.png | pass (-) | pass (-) |
| 18-approved.png | pass (-) | pass (-) |
| 19-approved.png | pass (-) | pass (-) |
| 20-approved.png | pass (-) | pass (-) |
| 21-approved.png | pass (-) | pass (-) |
| 22-approved.png | pass (-) | pass (-) |
| 23-approved.png | pass (-) | pass (-) |
| 24-approved.png | pass (-) | pass (-) |
| 01-rejected-001.png | pass (-) | pass (-) |
| 02-rejected-001.png | pass (-) | pass (-) |
| 03-rejected-001.png | pass (-) | pass (-) |
| 05-rejected-001.png | pass (-) | pass (-) |
| 05-rejected-002.png | pass (-) | pass (-) |
| 05-rejected-003.png | pass (-) | pass (-) |
| 06-rejected-001.png | pass (-) | pass (-) |
| 08-rejected-001.png | pass (-) | pass (-) |
| 08-rejected-002.png | pass (-) | pass (-) |
| 09-rejected-001.png | pass (-) | pass (-) |
| 09-rejected-002.png | pass (-) | pass (-) |
| 10-rejected-001.png | pass (-) | pass (-) |
| 11-rejected-001.png | pass (-) | pass (-) |
| 11-rejected-002.png | pass (-) | pass (-) |
| 11-rejected-003.png | pass (-) | pass (-) |
| 11-rejected-004.png | pass (-) | pass (-) |
| 11-rejected-005.png | pass (-) | pass (-) |
| 11-rejected-006.png | pass (-) | pass (-) |
| 11-rejected-007.png | pass (-) | pass (-) |
| 11-rejected-008.png | pass (-) | pass (-) |
| 11-rejected-009.png | pass (-) | pass (-) |
| 12-rejected-001.png | pass (-) | pass (-) |
| 13-rejected-001.png | pass (-) | pass (-) |
| 15-rejected-001.png | pass (-) | pass (-) |

## Round 2: character check on the page judge (same book, 24 approved + 43 rejected)

The page judge now also gets the characters' design, the cast reference sheet as a second image
and the generation prompt (scene size/count rules), and may report `off-model`. Rejected pages
were un-approved by the book-level audit, so a good judge fails them.

| judge | approved kept | rejected caught | median / page | notes |
|---|---|---|---|---|
| qwen/qwen3-vl-8b, old prompt | 24/24 | 0/43 | 2.2 s | |
| qwen/qwen3-vl-8b, character check | 23/24 | 8/43 | 3.7 s | 2 judge-errors |
| qwen3.5-9b-mlx | – | – | 9–170 s | thinking model: answer lands in `reasoning_content`, rambles inside the JSON until max_tokens, hallucinated a chef hat on page 2 — dropped |
| google/gemma-4-26b-a4b-qat | 21/21 (first 21 pages) | – | ~10 s | needs `PF_LMSTUDIO_CONTEXT=16384` (auto-fit picks 4k, below its 16k minimum); 15.6 GB, LM Studio crashed mid-run and then refused to reload it with ~13 GB available |
