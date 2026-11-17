# Discuss Evidence Desk in an interview

## Short walkthrough

“I built a document research assistant that runs locally in the browser. It parses PDFs, creates page-bound chunks, compares keyword and semantic retrieval, and uses a quantized question-answering model to extract a candidate answer with a page citation. The first benchmark showed that hybrid retrieval was not automatically better for this corpus, so development-only evaluation selected BM25. I separated relevant-page retrieval, answer token F1, abstention and source containment, because a valid citation alone does not prove the answer is correct.”

Use this after running and understanding the implementation. Explain what you reviewed or changed personally.

## Questions to prepare

**Is this a generative chatbot?** No. It is retrieval-augmented extractive question answering. The reader chooses text from a retrieved passage; it does not write a new summary. This makes source containment easier to verify but does not guarantee semantic correctness.

**Why use BM25 if you have embeddings?** The development benchmark favored keyword retrieval for these technical questions. Dense embeddings still provide a semantic gate and a measured retrieval baseline. Complexity should earn its place through evidence.

**What does 100% source containment mean?** Every accepted candidate appears verbatim in its cited passage after aligning tokenizer output to source text. It does not mean the answer is correct, complete or relevant to the question.

**Why was answer quality lower than retrieval quality?** A relevant page can contain several entities or definitions, a chunk can cut context, and the reader can select the wrong span. Retrieval and answer generation/extraction require different evaluation.

**How did you avoid tuning on the final questions?** Retrieval and gates are selected using the original development set. The initial test became diagnostic after design changes. A fresh final set was scored later and rerun after a deterministic alignment fix. The full history is documented; I do not call the small final set an independent production estimate.

**What was the alignment bug?** The tokenizer sometimes inserted spaces around punctuation. Strict string matching rejected an otherwise valid decoded span. I mapped the decoded token sequence back to exact source character boundaries and tested punctuation and nonmatching cases.

**How do uploads stay private?** PDF parsing, embeddings and QA run in the browser. Model artifacts are fetched publicly, but file text and questions are not sent to an inference API. Uploads are held in memory and cleared on reload or removal.

**What happens if model loading fails?** The app shows an error and offers evidence-only keyword search. It does not silently replace a failed model with fabricated answers.

**What would you improve next?** A broader independently authored evaluation set, device-specific latency/memory testing, better treatment of tables and multi-page answers, and a separately evaluated synthesis layer if generative answers are added.

## Demo sequence

1. Ask “What is confabulation in generative AI?” and open the highlighted PDF source.
2. Switch to Evidence search and compare the result presentation.
3. Upload the clearly labeled fictional launch-notes test fixture, scope research to it, and ask who owns the Atlas project.
4. Remove that upload and show that related answers disappear.
5. Open Evaluation; explain retrieval hit rate versus 58.9% token F1.
6. Show the initial diagnostic report, span-alignment test and pinned model checksums.

## Résumé wording

After studying and adapting the project:

“Built a browser-local document QA application with PDF ingestion, quantized ONNX inference, source-page citations and retrieval evaluation; compared BM25, dense and hybrid retrieval and implemented source-span verification, abstention and session-only uploads.”

Do not claim a generative LLM system, perfect answer accuracy, production validation or client impact. No such results were measured.
