# Evidence Desk: a citation is the start of verification

## The problem

A document assistant can look convincing while citing an irrelevant page or extracting the wrong phrase. This project makes the source visible and evaluates retrieval, answer quality and abstention separately.

The goal is a practical, key-free AI application that can read selected documents on the user's device. It is an educational portfolio project, not a production knowledge system or a source of current regulatory advice.

## Corpus and architecture

The starter corpus uses the published NIST AI Risk Management Framework 1.0 and its Generative AI Profile. The 112 physical PDF pages are parsed with PDF.js into 331 overlapping, page-bound chunks. The source manifest records publication details and original-file checksums.

A MiniLM encoder creates normalized 384-dimensional passage vectors. The benchmark compares BM25 keyword retrieval, cosine similarity and reciprocal-rank fusion. A quantized DistilBERT question-answering model extracts a candidate span from the selected passage. It does not generate a free-form answer or execute instructions embedded in documents.

Inference runs inside a browser worker. The starter corpus is pre-indexed, so first-query work is primarily model loading, question encoding and answer extraction. User uploads are parsed and indexed in session memory. Evidence search provides a model-free route when AI weights are unavailable or unnecessary.

## What the first evaluation revealed

The initial diagnostic run found two design issues. Equal-weight hybrid retrieval was weaker than BM25 for precise technical questions, and choosing the most confident answer across several passages sometimes promoted a less relevant page. The initial report is retained in the project rather than replaced with only favorable numbers.

Development-only mean reciprocal rank selected lexical retrieval as the default. The answer reader now uses the top-ranked passage; uncalibrated extraction confidence cannot override retrieval relevance. Development-only answerability checks selected a semantic gate of 0.40 and extraction-score gate of 0.20.

A separate implementation issue caused decoded answers with tokenizer-inserted punctuation spaces to fail strict substring matching. Instead of displaying reconstructed text as a quotation, the pipeline aligns decoded tokens back to an exact source span. Answers without a valid alignment are rejected. The final test was rerun after that deterministic fix, with the retrieval strategy and gates unchanged.

## Final diagnostic results

The fresh final set has ten answerable questions and four unsupported ones. BM25 places a labeled relevant page in the top three for all ten, with top-one hit rate 90% and MRR at five of 0.950. Neural retrieval alone reaches 80% top-three hit rate and MRR 0.617; hybrid reaches 100% and MRR 0.883.

The assistant accepts six of fourteen questions and declines all four unsupported examples. It also declines four answerable questions. Token F1 across answerable questions, treating abstentions as zero, is 58.9%; exact match is 50%. These are small-set diagnostic results, not a reliable estimate of broad performance.

All accepted spans occur in their cited passage. This containment check cannot establish semantic correctness. The product therefore calls short answers candidates and provides the full page for inspection.

## Product decisions

The research workspace keeps questions and candidate answers beside the retrieved passages. Citation buttons open the source page and highlight the exact span. The library supports local PDF/TXT/Markdown uploads, page inspection, source selection and removal. Text files use sections, not invented PDF page numbers.

Model loading, indexing progress, cancellation, download failures and the instant evidence-only mode are explicit. Notes export as plain text. Source content and filenames are escaped before display. Documents and questions are not sent to an inference API.

## Engineering validation

Unit checks cover page boundaries, document-scoped retrieval, duplicate-page evidence handling, score dimensions, source-span alignment, abstention gates and real-corpus/evaluation reconciliation. Native model weights are pinned and checksummed. Browser verification exercises the actual WASM path, uploads, source scope and highlighted citations, rather than relying on a native-model benchmark alone.

## Limits and next steps

The benchmark is hand-written and small. Initial diagnostic outcomes informed design changes; the final set was subsequently rerun for a deterministic alignment fix. Gold source pages are not exhaustive. There is no claim of production readiness, calibrated correctness, OCR, multilingual support or generative summarization.

A larger independently authored benchmark, user-document diversity and latency/memory measurements across devices would be the next evaluation work. A generative synthesis layer could be added later, but it would require its own answer-grounding evaluation rather than inheriting retrieval scores.

## Skills demonstrated

Browser AI integration, PDF ingestion, retrieval baselines, model inference, benchmark design, failure analysis, source provenance, privacy-aware architecture, asynchronous workers, error handling, accessible UI and reproducible testing.
