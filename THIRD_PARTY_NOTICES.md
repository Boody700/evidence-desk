# Third-party sources and notices

Project-authored code is MIT licensed. Dependencies and source materials retain their own licenses and notices.

- NIST AI 100-1 (2023): https://doi.org/10.6028/NIST.AI.100-1.
- NIST AI 600-1 (2024): https://doi.org/10.6028/NIST.AI.600-1.
- NIST publications are US government publications; retain their attribution and any notices applicable to incorporated third-party material. This project does not imply NIST endorsement.
- Transformers.js: https://github.com/huggingface/transformers.js, Apache-2.0. Bundled worker output includes dependency license notices.
- ONNX Runtime: https://github.com/microsoft/onnxruntime, MIT. Browser WASM and module loaders are fetched from the exact-version jsDelivr URL recorded in `data/runtime-manifest.json`; the package version comes from the pinned dependency tree.
- PDF.js: https://github.com/mozilla/pdf.js, Apache-2.0. Copied browser modules retain their license headers.
- MiniLM ONNX model: https://huggingface.co/Xenova/all-MiniLM-L6-v2; underlying sentence-transformers model https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2, Apache-2.0.
- DistilBERT QA ONNX model: https://huggingface.co/Xenova/distilbert-base-cased-distilled-squad; underlying model https://huggingface.co/distilbert/distilbert-base-cased-distilled-squad, Apache-2.0.
- esbuild: https://github.com/evanw/esbuild, MIT, used for authoring/building only.
- DM Sans, Manrope and Newsreader: Google Fonts, SIL Open Font License. The interface also includes system-font fallbacks.

Pretrained weights are downloaded at runtime or during corpus/evaluation preparation, not included as newly authored model weights. Source and model hashes/revisions are recorded in the project manifests.
