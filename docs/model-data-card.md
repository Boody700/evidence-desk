# Model and data card

## Intended use

Educational, English-language document research using extractive candidate answers and visible source passages. The app is designed for inspecting evidence, not for delegating consequential decisions or treating a citation as proof of correctness.

## Data

- NIST AI 100-1, *Artificial Intelligence Risk Management Framework (AI RMF 1.0)*, January 2023. DOI: https://doi.org/10.6028/NIST.AI.100-1. 48 physical PDF pages.
- NIST AI 600-1, *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*, July 2024. DOI: https://doi.org/10.6028/NIST.AI.600-1. 64 physical PDF pages.

PDF.js extracts text. Unicode is normalized, line-break hyphenation is repaired where possible, whitespace is collapsed and common undecodable quote glyphs are normalized. Chunk size is 160 whitespace-separated words with 30-word overlap, stopping at page boundaries. The corpus has 331 chunks; pages with too little readable text do not create a chunk.

File-page numbers are used for citations. Printed page labels may differ. The source viewer is normalized text and does not preserve tables or multi-column layout.

## Models and runtime

MiniLM encoder: `Xenova/all-MiniLM-L6-v2`, revision `751bff37182d3f1213fa05d7196b954e230abad9`. Quantized ONNX SHA-256: `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`.

DistilBERT reader: `Xenova/distilbert-base-cased-distilled-squad`, revision `bdbb0a5e9c617c3c7ea9f3cbaf2be3ad871bcd7d`. Quantized ONNX SHA-256: `fb134f63a53c22ce070ccaedd3a299b57ed546e71ab391579e418e8d0bd69ee6`.

Encoder outputs use mean pooling and L2 normalization. The reader returns a span and an uncalibrated extraction score. Transformers.js 4.3.2 executes native CPU inference for corpus/evaluation scripts and WASM inference in a browser worker. Weight hashes were verified against Hugging Face repository LFS metadata at the pinned revisions.

The exact browser runtime version and public jsDelivr base URL are generated from the lockfile-installed `onnxruntime-web` package into `data/runtime-manifest.json`. Public runtime files are fetched on demand because one exceeds the static host's per-file asset limit. These requests contain no document text or question content.

## Retrieval and acceptance policy

BM25, dense cosine similarity and RRF are compared. Development-only MRR selected BM25. At most one passage per physical page is shown. AI mode computes semantic similarity for the selected context and requires ≥0.40 cosine and ≥0.20 extraction score. The top-ranked passage supplies the candidate; a later passage cannot win simply through a higher uncalibrated reader score.

Decoded answer tokens are aligned back to source tokens, with exact character boundaries retained for the displayed source substring. Failure to align causes rejection. This tolerates tokenizer punctuation spacing while preserving the containment guarantee.

## Evaluation populations

Fourteen original development questions select retrieval and gates. Fourteen original test questions became a diagnostic set after exposing design issues. A fresh fourteen-question final set was then authored and scored; it was rerun after a deterministic alignment bug fix without tuning the operating policy on its outcomes.

The final set has ten answerable and four unsupported questions. It is neither randomly sampled nor independently authored. Exact match and token F1 use normalization of Unicode, case, punctuation, whitespace and English articles. Abstentions score zero on answerable questions. Page hit metrics use hand-labeled source pages, which may not cover every valid supporting page.

## Privacy, limits and non-claims

User uploads and questions stay in browser session memory. Public model artifacts are downloaded from Hugging Face; local model caches may persist. No uploaded-document database, localStorage history or remote inference endpoint is used. Removing an uploaded document removes its chunks and related answers.

No OCR, reliable multilingual performance, generative summarization, calibrated answer correctness or production readiness is claimed. The SQuAD-trained reader is not a reliable universal no-answer detector. Domain changes, long tables, ambiguous questions and page boundaries can cause failures. A source-contained span can still be wrong for the question.
