/* eslint-disable */
(function () {
  "use strict";

  var LOCAL_MODEL_ROOT = new URL("models/", window.location.href).href;
  var CAPTION_MODEL_ID = "vit_gpt2_image_captioning";
  var TRANSLATION_MODEL_ID = "LFM2_350M_ENJP_MT";
  var CAPTION_TRANSFORMERS_CDN_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
  var TRANSFORMERS_CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0";
  var TRANSLATION_ONNX_BASE_URL = new URL(
    "models/" + TRANSLATION_MODEL_ID + "/onnx/",
    window.location.href
  ).href;

  var imageFileEl = document.getElementById("image-file");
  var previewImageEl = document.getElementById("preview-image");
  var previewPlaceholderEl = document.getElementById("preview-placeholder");
  var modelStatusEl = document.getElementById("model-status");
  var statusEl = document.getElementById("status");
  var btnGenerateEl = document.getElementById("btn-generate");
  var resultJaEl = document.getElementById("result-ja");
  var resultEnEl = document.getElementById("result-en");

  var captioner = null;
  var translator = null;
  var loadedImage = null;
  var currentObjectUrl = "";
  var isModelReady = false;
  var activeDevice = "";

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setModelStatus(text, kind) {
    if (!modelStatusEl) return;
    modelStatusEl.textContent = text;
    modelStatusEl.className = "model-note" + (kind ? " " + kind : "");
  }

  function syncGenerateButton() {
    if (!btnGenerateEl) return;
    if (btnGenerateEl.classList.contains("is-busy")) return;
    btnGenerateEl.disabled = !(isModelReady && loadedImage);
  }

  function hasWebGpuSupport() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  function setGenerateBusy(isBusy) {
    if (!btnGenerateEl) return;
    btnGenerateEl.classList.toggle("is-busy", isBusy);
    btnGenerateEl.disabled = isBusy ? true : !(isModelReady && loadedImage);
    btnGenerateEl.textContent = isBusy ? "生成中…" : "日本語説明を生成";
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        reject(new Error("画像ファイルを選択してください。"));
        return;
      }

      var nextUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({ image: img, objectUrl: nextUrl });
      };
      img.onerror = function () {
        URL.revokeObjectURL(nextUrl);
        reject(new Error("画像の読み込みに失敗しました。"));
      };
      img.src = nextUrl;
    });
  }

  function normalizeCaption(text) {
    if (!text) return "";
    return String(text)
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildEnToJaPrompt(sourceText) {
    return (
      "<|startoftext|><|im_start|>system\n" +
      "Translate to Japanese.<|im_end|>\n" +
      "<|im_start|>user\n" +
      sourceText +
      "<|im_end|>\n" +
      "<|im_start|>assistant\n"
    );
  }

  function cleanTranslationText(text) {
    if (!text) return "";
    return String(text)
      .replace(/<\|im_end\|>/g, "")
      .replace(/<\|im_start\|>assistant/g, "")
      .replace(/<\|endoftext\|>/g, "")
      .trim();
  }

  async function existsUrl(url) {
    try {
      var res = await fetch(url, { method: "HEAD" });
      return !!(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  async function buildTranslatorOptions(preferredDevice) {
    var hasQ4f16 = await existsUrl(TRANSLATION_ONNX_BASE_URL + "model_q4f16.onnx");
    var hasQ4f16Data = await existsUrl(TRANSLATION_ONNX_BASE_URL + "model_q4f16.onnx_data");
    if (hasQ4f16 && hasQ4f16Data && preferredDevice === "webgpu") {
      return { device: "webgpu", dtype: "q4f16", quantized: false, local_files_only: true };
    }

    var hasFp16 = await existsUrl(TRANSLATION_ONNX_BASE_URL + "model_fp16.onnx");
    var hasFp16Data = await existsUrl(TRANSLATION_ONNX_BASE_URL + "model_fp16.onnx_data");
    if (hasFp16 && hasFp16Data && preferredDevice === "webgpu") {
      return { device: "webgpu", dtype: "fp16", quantized: false, local_files_only: true };
    }

    return null;
  }

  async function initCaptionModel() {
    try {
      setModelStatus("モデルを読み込んでいます…（初回は時間がかかります）", "");
      setStatus("推論エンジンを初期化しています…");

      var captionModule = await import(CAPTION_TRANSFORMERS_CDN_URL);
      var translationModule = await import(TRANSFORMERS_CDN_URL);
      var captionEnv = captionModule.env;
      var captionPipeline = captionModule.pipeline;
      var translationEnv = translationModule.env;
      var translationPipeline = translationModule.pipeline;

      // `models/` 配下のローカル配置を明示して読み込む。
      captionEnv.allowRemoteModels = false;
      captionEnv.allowLocalModels = true;
      captionEnv.localModelPath = LOCAL_MODEL_ROOT;
      translationEnv.allowRemoteModels = false;
      translationEnv.allowLocalModels = true;
      translationEnv.localModelPath = LOCAL_MODEL_ROOT;

      activeDevice = hasWebGpuSupport() ? "webgpu" : "wasm";
      try {
        var translatorOptions = await buildTranslatorOptions(activeDevice);
        if (!translatorOptions) {
          throw new Error(
            "翻訳モデルのONNXセットが不足しています。`model_q4f16.onnx(+.onnx_data)` もしくは `model_fp16.onnx(+.onnx_data)` を配置してください。"
          );
        }

        captioner = await captionPipeline("image-to-text", CAPTION_MODEL_ID, {
          device: activeDevice,
          dtype: "q8",
          quantized: true,
          local_files_only: true
        });
        translator = await translationPipeline("text-generation", TRANSLATION_MODEL_ID, translatorOptions);
      } catch (firstError) {
        if (activeDevice !== "webgpu") throw firstError;
        activeDevice = "wasm";
        var translatorOptionsWasm = await buildTranslatorOptions(activeDevice);
        if (!translatorOptionsWasm) {
          throw firstError;
        }
        captioner = await captionPipeline("image-to-text", CAPTION_MODEL_ID, {
          device: activeDevice,
          dtype: "q8",
          quantized: true,
          local_files_only: true
        });
        translator = await translationPipeline("text-generation", TRANSLATION_MODEL_ID, translatorOptionsWasm);
      }

      isModelReady = true;
      setModelStatus("ONNX モデル（画像説明 + 翻訳）の準備が完了しました。", "ok");
      setStatus(
        "画像を選択して「日本語説明を生成」を押してください。（推論デバイス: " +
          activeDevice +
          "）"
      );
      syncGenerateButton();
    } catch (error) {
      isModelReady = false;
      var detail = error && error.message ? error.message : String(error);
      if (detail.indexOf("ConvInteger(10)") >= 0) {
        detail =
          "LFM2 の quantized モデルはこの環境の ORT-Web で未対応演算（ConvInteger）を含みます。`model_fp16.onnx` + `model_fp16.onnx_data` か `model_q4f16.onnx` + `model_q4f16.onnx_data` を配置してください。";
      }
      setModelStatus(
        "モデルの読み込みに失敗しました。詳細: " + detail,
        "err"
      );
      setStatus("読み込みエラー: " + detail);
      syncGenerateButton();
    }
  }

  async function onFileChange() {
    var file = imageFileEl && imageFileEl.files ? imageFileEl.files[0] : null;
    if (!file) return;

    try {
      var loaded = await loadImageFromFile(file);
      loadedImage = loaded.image;

      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = loaded.objectUrl;

      if (previewImageEl) {
        previewImageEl.src = currentObjectUrl;
        previewImageEl.style.display = "block";
      }
      if (previewPlaceholderEl) previewPlaceholderEl.style.display = "none";

      resultJaEl.textContent = "まだ説明は生成されていません。";
      resultEnEl.textContent = "";
      setStatus("画像を読み込みました。");
      syncGenerateButton();
    } catch (error) {
      loadedImage = null;
      setStatus(error && error.message ? error.message : String(error));
      syncGenerateButton();
    }
  }

  async function generateCaption() {
    if (!captioner || !translator || !loadedImage || !currentObjectUrl) {
      setStatus("モデルまたは画像の準備ができていません。");
      return;
    }

    setGenerateBusy(true);
    setStatus("画像を解析して英語説明を生成しています…");
    resultJaEl.textContent = "生成中…";
    resultEnEl.textContent = "英語原文: 生成中…";

    try {
      // キャプション側(v2)は object URL 入力が最も安定する。
      var outputs = await captioner(currentObjectUrl, {
        max_new_tokens: 32
      });
      var first = outputs && outputs[0] ? outputs[0] : null;
      var raw = first && first.generated_text ? String(first.generated_text) : "";
      var englishCaption = normalizeCaption(raw);
      if (!englishCaption) {
        throw new Error("英語キャプションを生成できませんでした。");
      }

      setStatus("英語説明を日本語に翻訳しています…");
      var prompt = buildEnToJaPrompt(englishCaption);
      var translated = await translator(prompt, {
        max_new_tokens: 128,
        do_sample: false,
        temperature: 0,
        return_full_text: false
      });
      var transFirst = translated && translated[0] ? translated[0] : null;
      var transRaw = transFirst && transFirst.generated_text ? String(transFirst.generated_text) : "";
      var japaneseText = cleanTranslationText(transRaw);

      resultJaEl.textContent = japaneseText || "日本語説明を生成できませんでした。";
      resultEnEl.textContent = "英語原文: " + englishCaption;
      setStatus("日本語説明を生成しました。");
    } catch (error) {
      resultJaEl.textContent = "説明文の生成に失敗しました。";
      resultEnEl.textContent = "";
      setStatus("推論エラー: " + (error && error.message ? error.message : String(error)));
    } finally {
      setGenerateBusy(false);
    }
  }

  if (imageFileEl) imageFileEl.addEventListener("change", onFileChange);
  if (btnGenerateEl) btnGenerateEl.addEventListener("click", generateCaption);
  window.addEventListener("beforeunload", function () {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  });

  initCaptionModel();
})();
