import { chunkPages, cleanText } from "./retrieval.mjs";
import { getDocument, GlobalWorkerOptions } from "./vendor/pdf.mjs";
GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;
const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (n) => new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 }).format(n || 0), num = (n) => new Intl.NumberFormat("en-GB").format(n);
const state = { page: "research", docs: [], chunks: [], selected: /* @__PURE__ */ new Set(), messages: [], activeEntry: null, activeChunk: null, query: "", mode: "ai", busy: false, progress: "", percent: null, error: "", libraryView: null };
let corpus, evaluation, worker, readyPromise, serial = 0, epoch = 0;
const pending = /* @__PURE__ */ new Map();
const heading = (title, sub, extra = "") => `<section class="page-heading"><div><div class="eyebrow">DOCUMENT INTELLIGENCE / EVIDENCE FIRST</div><h1>${title}</h1><p>${sub}</p></div>${extra}</section>`;
const panelHead = (title, sub, tag = "") => `<div class="panel-head"><div><h2>${title}</h2><p>${sub}</p></div>${tag ? `<span class="tag">${tag}</span>` : ""}</div>`;
const metric = (label, value, note) => `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><p>${note}</p></article>`;
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3500);
}
function rawCall(type, data = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...data });
  });
}
async function call(type, data) {
  await readyPromise;
  return rawCall(type, data);
}
function startWorker() {
  worker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => {
    const m = event.data;
    if (m.type === "progress") {
      if (pending.has(m.id)) {
        state.progress = m.detail;
        state.percent = m.progress;
        updateProgress();
      }
      return;
    }
    const task = pending.get(m.id);
    if (!task) return;
    pending.delete(m.id);
    if (m.type === "error") task.reject(new Error(m.message));
    else task.resolve(m);
  };
  worker.onerror = () => {
    for (const task of pending.values()) task.reject(new Error("The local worker could not start. Reload the page to try again."));
    pending.clear();
  };
  readyPromise = rawCall("init", { chunks: state.chunks, models: corpus.models });
  readyPromise.catch(() => {
  });
}
function cancel() {
  epoch++;
  worker?.terminate();
  for (const task of pending.values()) task.reject(Object.assign(new Error("Cancelled"), { cancelled: true }));
  pending.clear();
  state.busy = false;
  state.progress = "";
  state.error = "";
  startWorker();
  render();
  $("status").textContent = "Cancelled. Your completed documents and conversation are retained.";
}
function progressHTML() {
  return state.busy ? `<div class="progress-box"><div class="toolbar" style="margin:0"><span id="progress-detail">${esc(state.progress || "Working locally\u2026")}</span><button class="text-button" id="cancel">Cancel</button></div><div class="progress-track" id="progress-track" ${state.percent === null ? "hidden" : ""}><span id="progress-fill" style="width:${Math.max(0, Math.min(100, state.percent || 0))}%"></span></div></div>` : "";
}
function updateProgress() {
  const target = $("progress");
  if (target) {
    if (!$("progress-detail")) {
      target.innerHTML = progressHTML();
      $("cancel")?.addEventListener("click", cancel);
    }
    if ($("progress-detail")) {
      $("progress-detail").textContent = state.progress || "Working locally\u2026";
      $("progress-track").hidden = state.percent === null;
      $("progress-fill").style.width = Math.max(0, Math.min(100, state.percent || 0)) + "%";
    }
  }
  $("status").textContent = state.progress;
}
function pageLabel(c) {
  return (state.docs.find((d) => d.id === c.docId)?.kind === "text" ? "Section " : "PDF page ") + c.page;
}
function activeMessage() {
  return state.messages.find((m) => m.id === state.activeEntry) || state.messages.at(-1);
}
function sourceViewer(docId, page, answer = "") {
  const doc = state.docs.find((d) => d.id === docId), p = doc?.pages.find((p2) => p2.number === page);
  if (!p) return '<div class="notice">This source is no longer in the session.</div>';
  const text = cleanText(p.text), at = answer ? text.indexOf(answer) : -1;
  const body = at >= 0 ? esc(text.slice(0, at)) + "<mark>" + esc(answer) + "</mark>" + esc(text.slice(at + answer.length)) : esc(text);
  return `<div class="viewer"><div class="viewer-tools"><span class="tag">${doc.kind === "text" ? "SECTION" : "PDF PAGE"} ${page}</span>${doc.url ? `<a href="${esc(doc.url)}${doc.kind === "pdf" ? "#page=" + page : ""}" target="_blank" rel="noopener">Open original \u2197</a>` : ""}</div><h3>${esc(doc.title)}</h3><div class="page-text" tabindex="0" aria-label="Source page text">${body}</div><p class="source-footnote">${doc.kind === "text" ? "Text-file citations use form-feed-delimited sections, not PDF pages." : "Page numbers refer to PDF file pages, which may differ from printed page numbers."} Text layout is normalized; consult the original for tables and formatting.</p></div>`;
}
function evidenceHTML() {
  const message = activeMessage(), evidence = message?.evidence || [];
  return `${panelHead("Evidence, within reach.", "Retrieved passages: inspect their relevance in context.", evidence.length ? String(evidence.length) + (evidence.length === 1 ? " PASSAGE" : " PASSAGES") : "CITATIONS")} ${evidence.length ? evidence.map((c, i) => `<article class="source-card ${c.id === state.activeChunk ? "selected" : ""}"><div class="source-top"><span class="citation-index">${i + 1}</span><div><h3>${esc(c.title)}</h3><div class="source-page">${pageLabel(c)}</div></div></div><p>${esc(c.text)}</p><button data-source="${esc(c.id)}">Read this page \u2197</button></article>`).join("") : '<div class="source-empty"><span aria-hidden="true">\u25A4</span><p>Your supporting passages will appear here.<br>Every extracted answer links back to its page.</p></div>'}${state.activeChunk && evidence.find((c) => c.id === state.activeChunk) ? (() => {
    const c = evidence.find((c2) => c2.id === state.activeChunk);
    return sourceViewer(c.docId, c.page, message?.candidate?.chunkId === c.id ? message.candidate.answer : "");
  })() : ""}<p class="source-footnote">A citation tells you where the words came from. It does not guarantee that the extracted answer is correct.</p>`;
}
function bindEvidence() {
  document.querySelectorAll("[data-source]").forEach((b) => b.addEventListener("click", () => {
    state.activeChunk = b.dataset.source;
    $("evidence").innerHTML = evidenceHTML();
    bindEvidence();
    $("evidence").scrollIntoView({ block: "start", behavior: "instant" });
  }));
}
function messagesHTML() {
  return state.messages.map((m) => {
    const cited = m.candidate && m.evidence.find((c) => c.id === m.candidate.chunkId), citation = m.evidence.findIndex((c) => c.id === m.candidate?.chunkId) + 1;
    return `<article class="message" id="message-${m.id}"><div class="question"><span class="question-label">YOU</span><span>${esc(m.question)}</span></div><div class="answer"><div class="answer-label">${m.mode === "ai" ? "AI-EXTRACTED CANDIDATE" : "EVIDENCE SEARCH"}</div><div class="answer-text ${!m.accepted ? "abstained" : ""}">${m.accepted ? esc(m.candidate.answer) : m.mode === "evidence" ? m.evidence.length ? "I found related passages. Review them in the evidence panel; this mode does not generate an answer." : "No matching passage was found in the selected documents." : "I couldn\u2019t find enough support for a short answer. Review the related evidence, narrow your question, or add another document."}</div>${m.accepted && cited ? `<button class="cite-button" data-cite="${m.id}"><strong>[${citation}]</strong> ${esc(cited.title)} \xB7 ${pageLabel(cited)}</button>` : ""}<div class="answer-footer"><span>${m.mode === "ai" ? "An extracted span, not a generated summary. Verify it in context." : "Keyword retrieval \xB7 no model download required."}</span><button data-evidence-entry="${m.id}">View ${m.evidence.length} retrieved passages \u2197</button></div></div></article>`;
  }).join("");
}
function research() {
  return `${heading("Every answer<br><em>needs a source.</em>", "Ask your documents. Inspect the evidence. Keep your judgment.", `<button class="button mobile-upload" id="mobile-upload">\uFF0B Add documents</button>`)}<div class="toolbar"><p>${state.selected.size} selected document${state.selected.size === 1 ? "" : "s"} \xB7 ${num(state.chunks.filter((c) => state.selected.has(c.docId)).length)} searchable passages</p>${state.messages.length ? '<div><button class="text-button" id="export-notes">Export notes \u2193</button><button class="text-button" id="clear-chat">Clear conversation</button></div>' : '<span class="tag">ENGLISH DOCUMENTS</span>'}</div><div class="research-grid"><div class="chat-panel">${!state.messages.length ? `<section class="welcome"><div class="welcome-icon" aria-hidden="true">\u2315</div><h2>A thoughtful place to start reading.</h2><p>Your starter library includes two published NIST frameworks. Ask a focused question, or add your own text-based PDF. AI mode extracts a candidate answer; the supporting page stays one click away.</p>${["What is confabulation in generative AI?", "What does risk tolerance refer to?", "Which privacy values should guide AI design choices?"].map((q) => `<button class="suggestion" data-question="${esc(q)}">${esc(q)} <span aria-hidden="true">\u2197</span></button>`).join("")}</section>` : messagesHTML()}<div id="progress">${progressHTML()}</div>${state.error ? `<div class="error-box" role="alert">${esc(state.error)}<br><button id="fallback">Use evidence search instead</button></div>` : ""}<form id="question-form" class="composer"><label class="sr-only" for="question">Ask a question about your selected documents</label><textarea id="question" maxlength="500" minlength="3" required placeholder="Ask a focused question about the selected documents\u2026" ${state.busy ? "disabled" : ""}>${esc(state.query)}</textarea><div class="composer-bottom"><label class="mode-label" for="mode">Mode<select id="mode" ${state.busy ? "disabled" : ""}><option value="ai" ${state.mode === "ai" ? "selected" : ""}>Extractive AI \xB7 on device</option><option value="evidence" ${state.mode === "evidence" ? "selected" : ""}>Evidence search \xB7 instant</option></select></label><button class="ask-button" type="submit" id="ask" ${state.busy || !state.selected.size ? "disabled" : ""}>Ask documents \u2197</button></div></form><p class="composer-note"><span>Ctrl / \u2318 + Enter to ask \xB7 ${state.selected.size ? "selected documents only" : "select a document first"}</span><span>${state.mode === "ai" ? "First AI use downloads about 90 MB of public model files." : "Instant keyword search. No AI weights needed."}</span></p></div><aside class="evidence-panel" id="evidence">${evidenceHTML()}</aside></div>`;
}
function library() {
  return `${heading("Your reading room.", "Choose which documents to include in research. Your uploads stay in this session.", `<button class="button" id="library-upload">\uFF0B Add documents</button>`)}<div id="progress">${progressHTML()}</div>${state.error ? `<div class="error-box" role="alert">${esc(state.error)}</div>` : ""}<aside class="notice">Text-based PDF, TXT and Markdown files are supported. Maximum 10 MB, 120 pages and 180 passages per upload; 6 documents and 700 passages in the session. Scanned PDFs require OCR elsewhere. Reloading the page removes your uploads.</aside><div class="library-grid">${state.docs.map((d) => `<article class="document-card"><div class="document-icon" aria-hidden="true">\u25A4</div><span class="tag ${d.uploaded ? "warm" : ""}">${d.uploaded ? "SESSION UPLOAD" : "PUBLIC REFERENCE"}</span><h2 style="margin-top:15px">${esc(d.title)}</h2><p>${d.kind === "text" ? "Text sections" : "PDF pages"}: ${d.pageCount} \xB7 ${state.chunks.filter((c) => c.docId === d.id).length} passages<br>${d.uploaded ? "Processed on this device. Not uploaded to a server." : esc(d.citation) + " \xB7 " + esc(d.published)}</p><label class="library-select"><input id="include-${esc(d.id)}" aria-label="Include ${esc(d.title)} in research" type="checkbox" data-library-doc="${esc(d.id)}" ${state.selected.has(d.id) ? "checked" : ""} ${state.busy ? "disabled" : ""}> Include in research</label><div class="document-actions"><button class="button" data-inspect="${esc(d.id)}">Read document \u2197</button>${d.uploaded ? `<button class="text-button" data-remove="${esc(d.id)}" ${state.busy ? "disabled" : ""}>Remove</button>` : `<a class="text-button" href="${esc(d.url)}" target="_blank" rel="noopener">Original PDF \u2197</a>`}</div></article>`).join("")}</div>${state.libraryView ? `<section class="panel" style="margin-top:22px"><div class="toolbar"><h2>Document reader</h2><label class="mode-label" for="library-page">Page<select id="library-page">${state.docs.find((d) => d.id === state.libraryView.docId).pages.map((p) => `<option value="${p.number}" ${p.number === state.libraryView.page ? "selected" : ""}>${p.number}</option>`).join("")}</select></label></div>${sourceViewer(state.libraryView.docId, state.libraryView.page)}</section>` : ""}`;
}
function evaluationPage() {
  const t = evaluation.test, chosen = evaluation.policy.retrievalMode, rm = t.retrieval[chosen];
  return `${heading("Show the work.<br><em>Measure the weak points.</em>", "Retrieval, extraction and abstention are separate questions.", `<button class="button" id="export-evaluation">\u2193 Export benchmark</button>`)}<aside class="notice">This fixed starter-library benchmark does not evaluate your uploads. It is a small, hand-written diagnostic benchmark: 14 development questions, 14 initial diagnostic questions and a fresh 14-question final test. It is not evidence of general production accuracy. The final set was rerun after a deterministic text-span alignment bug fix; retrieval choice and abstention thresholds were not tuned on final-test outcomes.</aside><div class="metrics">${metric("Relevant page in top 3", pct(rm.hit3), "Final test \xB7 10 answerable questions")}${metric("Answer token F1", pct(t.answerF1), "Includes abstentions as zero on answerable questions")}${metric("Unsupported questions declined", `${t.answerability.tn} / ${t.unanswerable}`, "Final test \xB7 only four unsupported examples")}${metric("Verbatim source containment", pct(t.spanContainment), "Accepted spans occur in their cited passage; not correctness")}</div><div class="two-grid"><section class="panel">${panelHead("Does neural retrieval help here?", "Three strategies, measured on the same final questions.")}<div class="table-scroll"><table><thead><tr><th>RETRIEVAL</th><th class="num">HIT @ 1</th><th class="num">HIT @ 3</th><th class="num">MRR @ 5</th></tr></thead><tbody>${Object.entries(t.retrieval).map(([name, r]) => `<tr><td>${esc(name)}${name === chosen ? " \xB7 selected" : ""}</td><td class="num">${pct(r.hit1)}</td><td class="num">${pct(r.hit3)}</td><td class="num">${r.mrr.toFixed(3)}</td></tr>`).join("")}</tbody></table></div><p class="table-note">The default was selected using development-only mean reciprocal rank. For these technical questions, keyword retrieval outperformed the semantic baseline. A more complex retriever is not automatically better.</p></section><section class="panel prose">${panelHead("A good citation is not a correct answer.", "Keep source validity separate from semantic quality.")}<p>On the final set, ${t.acceptedAnswers} questions received a short candidate answer. ${pct(t.answerExactMatch)} of answerable questions matched a reference answer exactly after normalization.</p><p>${t.answerability.fn} answerable questions were declined. Abstention is deliberately conservative, but can also hide valid answers. Read the passages when the short answer is missing or unhelpful.</p><p>Semantic similarity and model extraction scores are uncalibrated diagnostics, not correctness probabilities. Gold page annotations may not list every page that supports the same fact.</p></section></div><section class="panel">${panelHead("Every final-test question.", "Failures and abstentions remain visible.", "14 QUESTIONS")}<div class="table-scroll"><table><thead><tr><th>QUESTION</th><th>EXPECTED</th><th>RESULT</th><th class="num">TOKEN F1</th></tr></thead><tbody>${evaluation.results.filter((r) => r.split === "test").map((r) => `<tr><td class="question-cell">${esc(r.question)}</td><td>${r.answers.length ? "Answerable" : "Unsupported"}</td><td>${r.accepted ? esc(r.candidate.answer) : "Declined"}</td><td class="num">${r.answers.length ? r.accepted ? pct(r.f1) : "0%" : "\u2014"}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function about() {
  return `${heading("Useful AI.<br><em>Visible evidence.</em>", "An extractive document assistant, with deliberate limits.")}<div class="two-grid"><section class="panel prose">${panelHead("01 / What this app does", "Answers are extracted, not freely generated.")}<p>Evidence Desk finds relevant passages, runs a pretrained question-answering model on the top-ranked passage, and links an accepted answer to its physical PDF page. It can also return evidence without an AI answer.</p><p>It does not write generative summaries, browse the internet to answer, run tools from documents, or execute document instructions. An extracted span can still answer the wrong question, so source inspection is part of the experience.</p><p>Starter references: <a href="https://doi.org/10.6028/NIST.AI.100-1" target="_blank" rel="noopener">NIST AI RMF 1.0 (2023)</a> and <a href="https://doi.org/10.6028/NIST.AI.600-1" target="_blank" rel="noopener">NIST Generative AI Profile (2024)</a>. These are the specific published versions in the library, not a claim to provide current regulatory advice.</p></section><section class="panel prose">${panelHead("02 / The retrieval pipeline", "Compare a simple baseline before adding complexity.")}<div class="method-steps"><div class="method-step"><strong>Read</strong>PDF page text</div><div class="method-step"><strong>Chunk</strong>160 words / 30 overlap</div><div class="method-step"><strong>Retrieve</strong>BM25 + model diagnostics</div><div class="method-step"><strong>Verify</strong>Span + page citation</div></div><p>The benchmark compares BM25 keyword search, MiniLM cosine similarity and reciprocal-rank fusion. Development questions selected <strong>${esc(evaluation.policy.retrievalMode)}</strong> retrieval as the default.</p><p>Chunks never cross page boundaries. The visible evidence list contains at most one passage per page. Long tables, multi-column layouts and page boundaries can still reduce retrieval quality.</p></section><section class="panel prose">${panelHead("03 / Local AI, clear privacy", "Documents stay in this browser session.")}<p>PDF text extraction, embeddings and answer extraction run on your device. Public model files are downloaded from Hugging Face and version-pinned runtime files from jsDelivr. Your document text and questions are not sent to an inference API by this app.</p><p>Model weights may be cached by your browser. Uploaded files and conversation history are held in session memory only, without localStorage or a document database. Removing an upload clears its passages and related answers. Reloading clears all uploads.</p><p>Very large documents, scanned PDFs, non-English text, weak devices and blocked model downloads can limit this setup. Evidence search remains available without downloading AI weights.</p></section><section class="panel prose">${panelHead("04 / Models and abstention", "Not calibrated confidence.")}<p><strong>Encoder:</strong> Xenova/all-MiniLM-L6-v2, quantized ONNX. <strong>Reader:</strong> Xenova/distilbert-base-cased-distilled-squad, quantized ONNX. Both execute with Transformers.js and ONNX Runtime in a worker.</p><p>The answer reader is not trained to reliably recognize every unanswerable question. Development-only gates require cosine similarity \u2265${evaluation.policy.minSemantic} and extraction score \u2265${evaluation.policy.minExtraction}. Those numbers are not probabilities of being correct.</p><p>Decoded tokens are aligned back to an exact source substring before an answer is displayed. A span that cannot be aligned is rejected.</p></section><section class="panel prose">${panelHead("05 / Engineering choices", "Small, reproducible, inspectable.")}<p>PDF.js handles text-based PDFs. A worker keeps model work off the interface thread. Progress, cancellation, errors and a model-free evidence mode are explicit. User-supplied titles and text are escaped before display.</p><p>The source includes corpus preparation, model download/cache helpers, a retrieval benchmark, span-alignment tests, a model/data manifest and an interview guide. Run <code>npm run prepare-data</code>, <code>npm run evaluate</code>, <code>npm run build</code> and <code>npm test</code> to reproduce.</p></section><section class="panel prose">${panelHead("06 / What remains uncertain", "The honest limits are part of the project.")}<p>The benchmark is small and hand-written. Initial diagnostic failures informed design changes; they are archived rather than hidden. The final test is separate from gate selection, but was rerun after a deterministic span-alignment fix.</p><p>Source containment does not establish correctness, causal validity, legal authority or completeness. Unsupported questions can still slip through, and valid questions can be declined. A broader independently authored benchmark and domain-specific validation would be needed before production use.</p></section></div>`;
}
function renderSide() {
  $("source-count").textContent = state.docs.length;
  $("source-list").innerHTML = state.docs.map((d) => `<label class="source-check"><input type="checkbox" id="source-${esc(d.id)}" data-doc="${esc(d.id)}" ${state.selected.has(d.id) ? "checked" : ""} ${state.busy ? "disabled" : ""}><span><strong>${esc(d.title)}</strong><small>${d.pageCount} ${d.kind === "text" ? "sections" : "PDF pages"} \xB7 ${d.uploaded ? "session upload" : "NIST reference"}</small></span></label>`).join("");
  $("upload").disabled = state.busy;
  document.querySelectorAll("[data-doc]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.selected.add(input.dataset.doc);
    else state.selected.delete(input.dataset.doc);
    render();
  }));
}
function render() {
  const focused = document.activeElement?.id;
  document.querySelectorAll("[data-page]").forEach((a) => {
    const active = a.dataset.page === state.page;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("breadcrumb").textContent = { research: "Research", library: "Document library", evaluation: "Evaluation", about: "How it works" }[state.page];
  document.title = $("breadcrumb").textContent + " \u2014 Evidence Desk";
  $("content").innerHTML = { research, library, evaluation: evaluationPage, about }[state.page]();
  renderSide();
  bind();
  if (focused) $(focused)?.focus({ preventScroll: true });
}
async function ask(question) {
  question = question.trim();
  if (state.busy) return;
  if (question.length < 3) {
    toast("Enter a question with at least three characters.");
    return;
  }
  if (!state.selected.size) {
    toast("Select at least one document first.");
    return;
  }
  const run = epoch;
  state.query = question;
  state.error = "";
  state.busy = true;
  state.progress = "Finding your evidence\u2026";
  state.percent = null;
  render();
  const start = performance.now();
  try {
    const result = await call("ask", { question, mode: state.mode, docIds: [...state.selected], policy: evaluation.policy });
    if (run !== epoch) return;
    const m = { ...result, question, id: ++serial, seconds: (performance.now() - start) / 1e3 };
    state.messages.push(m);
    state.query = "";
    if (state.messages.length > 6) state.messages.shift();
    state.activeEntry = m.id;
    state.activeChunk = result.accepted ? result.candidate.chunkId : null;
  } catch (error) {
    if (run !== epoch || error.cancelled) return;
    state.error = "The local model request could not finish. " + error.message + " You can retry or use evidence search.";
    state.query = question;
  } finally {
    if (run === epoch) {
      state.busy = false;
      state.progress = "";
      render();
      $("status").textContent = state.error ? "The request could not finish." : "Evidence is ready. Verify any candidate answer in its source.";
      state.messages.length && $("message-" + state.messages.at(-1).id)?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }
}
async function addFiles(files) {
  if (!corpus || !evaluation) {
    toast("The workspace is still loading. Please try again in a moment.");
    return;
  }
  if (state.busy) return;
  for (const file of Array.from(files)) {
    const run = epoch;
    let blobUrl = null;
    try {
      if (state.docs.length >= 6) throw new Error("The session is limited to six documents. Remove an upload first.");
      if (file.size > 10 * 1024 * 1024) throw new Error("This file exceeds the 10 MB limit.");
      const kind = /\.pdf$/i.test(file.name) ? "pdf" : /\.(txt|md)$/i.test(file.name) ? "text" : null;
      if (!kind) throw new Error("Choose PDF, TXT or Markdown files.");
      state.busy = true;
      state.error = "";
      state.progress = "Reading " + file.name + " on your device\u2026";
      state.percent = null;
      render();
      const pages = [];
      if (kind === "pdf") {
        const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true }).promise;
        try {
          if (pdf.numPages > 120) throw new Error("This PDF exceeds 120 pages. Split it into a smaller document first.");
          for (let n = 1; n <= pdf.numPages; n++) {
            if (run !== epoch) return;
            state.progress = `Reading ${file.name}: page ${n} / ${pdf.numPages}`;
            updateProgress();
            const page = await pdf.getPage(n), text = await page.getTextContent();
            pages.push({ number: n, text: text.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("") });
          }
        } finally {
          await pdf.destroy();
        }
        blobUrl = URL.createObjectURL(file);
      } else {
        const text = await file.text();
        if (text.length > 2e5) throw new Error("Text files are limited to 200,000 characters.");
        text.split("\f").forEach((text2, i) => pages.push({ number: i + 1, text: text2 }));
        if (pages.length > 120) throw new Error("This text file has too many form-feed sections.");
      }
      const doc = { id: "upload-" + crypto.randomUUID(), title: file.name, kind, pages, pageCount: pages.length, uploaded: true, url: blobUrl }, fresh = chunkPages(doc);
      if (!fresh.length) throw new Error("No readable text was found. Scanned PDFs need OCR; choose a text-based file.");
      if (fresh.length > 180 || fresh.length + state.chunks.length > 700) throw new Error("This upload exceeds the passage limit. Use a smaller document.");
      state.progress = state.mode === "ai" ? "Building local document embeddings\u2026" : "Preparing keyword search\u2026";
      updateProgress();
      const result = await call("index", { chunks: fresh, withEmbeddings: state.mode === "ai" });
      if (run !== epoch) return;
      state.docs.push(doc);
      state.chunks.push(...result.chunks);
      state.selected.add(doc.id);
      blobUrl = null;
      toast(file.name + " is ready to search.");
    } catch (error) {
      if (run !== epoch || error.cancelled) return;
      state.error = error.name === "PasswordException" ? "Encrypted PDFs are not supported. Use an unencrypted copy." : error.message;
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (run === epoch) {
        state.busy = false;
        state.progress = "";
        render();
      }
    }
  }
}
async function removeDoc(id) {
  if (state.busy) return;
  const doc = state.docs.find((d) => d.id === id);
  if (!doc?.uploaded) return;
  await call("remove", { docId: id });
  if (doc.url) URL.revokeObjectURL(doc.url);
  state.docs = state.docs.filter((d) => d.id !== id);
  state.chunks = state.chunks.filter((c) => c.docId !== id);
  state.selected.delete(id);
  state.messages = state.messages.filter((m) => !m.evidence.some((c) => c.docId === id));
  state.activeEntry = null;
  state.activeChunk = null;
  if (state.libraryView?.docId === id) state.libraryView = null;
  render();
  toast("Document and related answers removed from this session.");
}
function exportJSON() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(evaluation, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "evidence-desk-benchmark.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function bind() {
  const on = (id, event, fn) => $(id)?.addEventListener(event, fn);
  for (const id of ["mobile-upload", "library-upload"]) on(id, "click", () => $("file-input").click());
  on("cancel", "click", cancel);
  document.querySelectorAll("[data-library-doc]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.selected.add(input.dataset.libraryDoc);
    else state.selected.delete(input.dataset.libraryDoc);
    render();
  }));
  on("export-notes", "click", () => {
    const text = state.messages.map((m) => ["QUESTION: " + m.question, "MODE: " + m.mode, "CANDIDATE: " + (m.accepted ? m.candidate.answer : m.mode === "evidence" ? "Evidence only; no short answer generated." : "Declined; insufficient support."), ...m.evidence.map((c, i) => "[" + (i + 1) + "] " + c.title + " / " + pageLabel(c) + "\n" + c.text)].join("\n\n")).join("\n\n--------------------\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "evidence-desk-notes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    toast("Research notes exported.");
  });
  on("clear-chat", "click", () => {
    state.messages = [];
    state.activeEntry = null;
    state.activeChunk = null;
    render();
  });
  on("question", "input", (e) => {
    state.query = e.target.value;
  });
  on("question", "keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ask(state.query);
    }
  });
  on("question-form", "submit", (e) => {
    e.preventDefault();
    ask($("question").value);
  });
  on("mode", "change", (e) => {
    state.mode = e.target.value;
    state.error = "";
    render();
  });
  on("fallback", "click", () => {
    state.mode = "evidence";
    state.error = "";
    render();
  });
  document.querySelectorAll("[data-question]").forEach((b) => b.addEventListener("click", () => {
    state.query = b.dataset.question;
    render();
    $("question").focus();
  }));
  document.querySelectorAll("[data-evidence-entry],[data-cite]").forEach((b) => b.addEventListener("click", () => {
    state.activeEntry = Number(b.dataset.evidenceEntry || b.dataset.cite);
    const m = activeMessage();
    state.activeChunk = b.dataset.cite ? m.candidate.chunkId : null;
    $("evidence").innerHTML = evidenceHTML();
    bindEvidence();
    $("evidence").scrollIntoView({ block: "start", behavior: "instant" });
  }));
  bindEvidence();
  document.querySelectorAll("[data-inspect]").forEach((b) => b.addEventListener("click", () => {
    state.libraryView = { docId: b.dataset.inspect, page: 1 };
    render();
  }));
  document.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeDoc(b.dataset.remove).catch((e) => {
    state.error = e.message;
    render();
  })));
  on("library-page", "change", (e) => {
    state.libraryView.page = Number(e.target.value);
    render();
  });
  on("export-evaluation", "click", exportJSON);
}
function route() {
  if (!corpus || !evaluation) return;
  const page = location.hash.slice(1);
  state.page = ["research", "library", "evaluation", "about"].includes(page) ? page : "research";
  render();
}
$("upload").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) {
    e.preventDefault();
    document.body.classList.add("drop-active");
  }
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) document.body.classList.remove("drop-active");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("drop-active");
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") {
    $("main").focus();
    return;
  }
  route();
  window.scrollTo({ top: 0, behavior: "instant" });
  $("main").focus({ preventScroll: true });
});
try {
  const responses = await Promise.all([fetch("./corpus.json"), fetch("./evaluation.json")]);
  if (responses.some((r) => !r.ok)) throw new Error("A required data file is missing.");
  [corpus, evaluation] = await Promise.all(responses.map((r) => r.json()));
  state.docs = corpus.docs.map((d) => ({ ...d, kind: "pdf", uploaded: false }));
  state.chunks = corpus.chunks;
  state.selected = new Set(state.docs.map((d) => d.id));
  startWorker();
  await readyPromise;
  route();
} catch (error) {
  $("content").innerHTML = `<div class="error-box" role="alert">The research workspace could not load. ${esc(error.message)} Reload the page, or rebuild the project assets.</div>`;
}
