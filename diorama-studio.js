/* eslint-disable */
(function () {
  "use strict";

  var U2NET_URL = "models/u2netp/u2netp.onnx";
  var MOSAIC_URL = "models/mosaic-8/mosaic-8.onnx";
  var BG_DEFAULT_URL = "image/back_image_01.png";

  var IMAGENET_MEAN = [0.485, 0.456, 0.406];
  var IMAGENET_STD = [0.229, 0.224, 0.225];
  /** U²-Net-P（config および preprocessor の 320 固定） */
  var U2_BOX = 320;
  /** mosaic-8.onnx は多くのビルドで 224×224（メタデータがあればそこから上書き） */
  var MOSAIC_BOX_DEFAULT = 224;

  var stage = document.getElementById("stage");
  var statusEl = document.getElementById("status");
  var u2netFileEl = document.getElementById("u2net-file");
  var mosaicFileEl = document.getElementById("mosaic-file");
  var photoFileEl = document.getElementById("photo-file");
  var bgFileEl = document.getElementById("bg-file");
  var btnProcess = document.getElementById("btn-process");
  var btnDl = document.getElementById("btn-dl-png");
  var slX = document.getElementById("sl-x");
  var slY = document.getElementById("sl-y");
  var slScale = document.getElementById("sl-scale");
  var slRot = document.getElementById("sl-rot");
  var valX = document.getElementById("val-x");
  var valY = document.getElementById("val-y");
  var valScale = document.getElementById("val-scale");
  var valRot = document.getElementById("val-rot");
  var photoPresetEl = document.getElementById("photo-preset");
  var bgPresetEl = document.getElementById("bg-preset");
  var btnClearModelCache = document.getElementById("btn-clear-model-cache");

  var ctx = stage && stage.getContext("2d", { alpha: true, willReadFrequently: true });
  var modelCacheDbPromise = null;

  var u2Session = null;
  var mosaicSession = null;
  var bgImage = null;
  var photoImage = null;

  var lastPersonRgba = null;
  var lastPersonW = 0;
  var lastPersonH = 0;

  /** ポインタドラッグ（移動 / Shift+回転 / Ctrl+拡大） */
  var drag = {
    active: false,
    mode: null,
    lastX: 0,
    lastY: 0,
    angle0: 0,
    rot0: 0,
    dist0: 0,
    scale0: 100
  };

  var lastPointerPos = { x: 0, y: 0 };

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function ensureOrt() {
    if (!window.ort) throw new Error("onnxruntime-web が読み込めませんでした。");
    if (window.ort.env && window.ort.env.wasm) {
      window.ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
    }
  }

  /** ONNX の ArrayBuffer を IndexedDB に保持（同一オリジン・同一URLキー） */
  function openModelCacheDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (modelCacheDbPromise) return modelCacheDbPromise;
    modelCacheDbPromise = new Promise(function (resolve) {
      var req = indexedDB.open("onnx-test-model-cache", 1);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains("models")) {
          db.createObjectStore("models", { keyPath: "key" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        modelCacheDbPromise = null;
        resolve(null);
      };
    });
    return modelCacheDbPromise;
  }

  function cacheGetModel(key) {
    return openModelCacheDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx = db.transaction("models", "readonly");
        var st = tx.objectStore("models");
        var g = st.get(key);
        g.onsuccess = function () {
          var row = g.result;
          resolve(row && row.buf ? row.buf : null);
        };
        g.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function cachePutModel(key, buf) {
    return openModelCacheDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction("models", "readwrite");
        tx.objectStore("models").put({ key: key, buf: buf, savedAt: Date.now() });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    });
  }

  function cacheClearAllModels() {
    return openModelCacheDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction("models", "readwrite");
        tx.objectStore("models").clear();
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    });
  }

  async function fetchModelWithCache(url) {
    var cacheKey = "onnx|" + url;
    var cached = await cacheGetModel(cacheKey);
    if (cached && cached.byteLength > 1024) {
      return cached;
    }
    var buf = await fetchModel(url);
    await cachePutModel(cacheKey, buf);
    return buf;
  }

  async function fetchModel(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error("モデルを取得できません: " + url + " (HTTP " + res.status + ")");
    return res.arrayBuffer();
  }

  async function createSessionFromBuffer(buf) {
    ensureOrt();
    return window.ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
  }

  /** 同じオリジンからの fetch が成功すれば使う。失敗時は手動ファイル指定に任せる。IndexedDB にキャッシュ。 */
  async function tryAutoLoadFromUrls() {
    var okU2 = false;
    var okMosaic = false;
    try {
      setStatus("U²-Net-P を読み込み中（キャッシュまたはネットワーク）…");
      var b1 = await fetchModelWithCache(U2NET_URL);
      u2Session = await createSessionFromBuffer(b1);
      okU2 = true;
    } catch (e1) {
      u2Session = null;
    }
    try {
      setStatus("mosaic-8 を読み込み中（キャッシュまたはネットワーク）…");
      var b2 = await fetchModelWithCache(MOSAIC_URL);
      mosaicSession = await createSessionFromBuffer(b2);
      okMosaic = true;
    } catch (e2) {
      mosaicSession = null;
    }
    if (okU2 && okMosaic) {
      setStatus("モデル準備完了（URL）。写真と背景を選んで「切り抜き＋スタイル＋合成」を押してください。");
    } else {
      var parts = [];
      if (!okU2) parts.push("u2netp");
      if (!okMosaic) parts.push("mosaic-8");
      setStatus(
        "URL から読み込めなかったモデル: " +
          parts.join("・") +
          "。上の ONNX 欄から該当の .onnx を手動で選択してください。"
      );
    }
    syncProcessButton();
  }

  async function loadU2FromFile(file) {
    if (!file) return;
    try {
      setStatus("U²-Net-P（ファイル）を読み込み中…");
      var buf = await file.arrayBuffer();
      u2Session = await createSessionFromBuffer(buf);
      setStatus(
        "u2netp を読み込みました。" +
          (mosaicSession ? " 写真・背景が揃えば実行できます。" : " 続けて mosaic-8.onnx を選択してください。")
      );
    } catch (e) {
      u2Session = null;
      setStatus("u2netp の読み込みに失敗: " + (e && e.message ? e.message : String(e)));
    }
    syncProcessButton();
  }

  async function loadMosaicFromFile(file) {
    if (!file) return;
    try {
      setStatus("mosaic-8（ファイル）を読み込み中…");
      var buf = await file.arrayBuffer();
      mosaicSession = await createSessionFromBuffer(buf);
      setStatus(
        "mosaic-8 を読み込みました。" +
          (u2Session ? " 写真・背景が揃えば実行できます。" : " 続けて u2netp.onnx を選択してください。")
      );
    } catch (e) {
      mosaicSession = null;
      setStatus("mosaic-8 の読み込みに失敗: " + (e && e.message ? e.message : String(e)));
    }
    syncProcessButton();
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type.match(/^image\//)) {
        reject(new Error("画像ファイルを選んでください。"));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("画像のデコードに失敗しました。")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("ファイルの読み込みに失敗しました。")); };
      reader.readAsDataURL(file);
    });
  }

  function loadImageUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("背景画像を読み込めません: " + url)); };
      img.src = url;
    });
  }

  function makeSyntheticPersonImage() {
    return new Promise(function (resolve, reject) {
      var w = 512;
      var h = 768;
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      var x = c.getContext("2d", { alpha: false, willReadFrequently: true });
      var g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#5a7aa8");
      g.addColorStop(1, "#2a3d5c");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#e8c8a8";
      x.beginPath();
      x.ellipse(w / 2, h * 0.32, w * 0.14, h * 0.12, 0, 0, Math.PI * 2);
      x.fill();
      x.fillRect(w / 2 - w * 0.16, h * 0.4, w * 0.32, h * 0.48);
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("デモ用画像の生成に失敗しました。"));
      };
      img.src = c.toDataURL("image/png");
    });
  }

  function makeSyntheticBgImage() {
    return new Promise(function (resolve, reject) {
      var w = 1200;
      var h = 800;
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      var x = c.getContext("2d", { alpha: false, willReadFrequently: true });
      var sky = x.createLinearGradient(0, 0, 0, h * 0.55);
      sky.addColorStop(0, "#87b8e8");
      sky.addColorStop(1, "#d4e8f8");
      x.fillStyle = sky;
      x.fillRect(0, 0, w, h * 0.55);
      var ground = x.createLinearGradient(0, h * 0.55, 0, h);
      ground.addColorStop(0, "#6a9e5a");
      ground.addColorStop(1, "#3d6b3a");
      x.fillStyle = ground;
      x.fillRect(0, h * 0.55, w, h * 0.45);
      x.fillStyle = "rgba(255,255,255,0.4)";
      x.beginPath();
      x.ellipse(w * 0.75, h * 0.22, w * 0.12, h * 0.06, 0, 0, Math.PI * 2);
      x.fill();
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("デモ背景の生成に失敗しました。"));
      };
      img.src = c.toDataURL("image/png");
    });
  }

  async function applyPhotoPreset(mode) {
    var m = mode || (photoPresetEl ? photoPresetEl.value : "synthetic");
    if (m === "file") {
      photoImage = null;
      if (photoFileEl) photoFileEl.value = "";
      setStatus("人物写真のファイルを選択してください。");
      syncProcessButton();
      return;
    }
    if (m === "synthetic") {
      try {
        photoImage = await makeSyntheticPersonImage();
        setStatus("写真: デモ用画像を使用しています。");
      } catch (e) {
        setStatus(e && e.message ? e.message : String(e));
        photoImage = null;
      }
      syncProcessButton();
    }
  }

  async function applyBgPreset(mode) {
    var m = mode || (bgPresetEl ? bgPresetEl.value : "bundled");
    if (m === "file") {
      bgImage = null;
      if (bgFileEl) bgFileEl.value = "";
      setStatus("背景画像のファイルを選択してください。");
      syncProcessButton();
      return;
    }
    if (m === "bundled") {
      try {
        bgImage = await loadImageUrl(BG_DEFAULT_URL);
        setStatus("背景: " + BG_DEFAULT_URL + " を読み込みました。");
        onBgReady();
        return;
      } catch (e) {
        if (bgPresetEl) bgPresetEl.value = "synthetic";
        await applyBgPreset("synthetic");
        setStatus("既定の背景が見つからないため、デモ用グラデーションに切り替えました。");
        return;
      }
    }
    if (m === "synthetic") {
      try {
        bgImage = await makeSyntheticBgImage();
        setStatus("背景: デモ用グラデーションを使用しています。");
        onBgReady();
      } catch (e) {
        setStatus(e && e.message ? e.message : String(e));
        bgImage = null;
        syncProcessButton();
      }
    }
  }

  function letterboxToTensor(img) {
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var scale = U2_BOX / Math.max(iw, ih);
    var nw = Math.max(1, Math.round(iw * scale));
    var nh = Math.max(1, Math.round(ih * scale));
    var padX = Math.floor((U2_BOX - nw) / 2);
    var padY = Math.floor((U2_BOX - nh) / 2);

    var c = document.createElement("canvas");
    c.width = U2_BOX;
    c.height = U2_BOX;
    var x = c.getContext("2d", { alpha: false, willReadFrequently: true });
    x.fillStyle = "#000000";
    x.fillRect(0, 0, U2_BOX, U2_BOX);
    x.drawImage(img, padX, padY, nw, nh);

    var id = x.getImageData(0, 0, U2_BOX, U2_BOX);
    var data = id.data;
    var plane = U2_BOX * U2_BOX;
    var floats = new Float32Array(1 * 3 * plane);
    var y;
    var xi;
    var p;
    var r;
    var g;
    var b;
    var off;
    for (y = 0; y < U2_BOX; y++) {
      for (xi = 0; xi < U2_BOX; xi++) {
        p = (y * U2_BOX + xi) * 4;
        off = y * U2_BOX + xi;
        r = data[p] / 255;
        g = data[p + 1] / 255;
        b = data[p + 2] / 255;
        floats[0 * plane + off] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
        floats[1 * plane + off] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
        floats[2 * plane + off] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
      }
    }

    return {
      tensor: floats,
      dims: [1, 3, U2_BOX, U2_BOX],
      padX: padX,
      padY: padY,
      innerW: nw,
      innerH: nh
    };
  }

  function rgbFloat255NCHWFromCanvasRegion(canvas) {
    var w = canvas.width;
    var h = canvas.height;
    var x = canvas.getContext("2d", { willReadFrequently: true });
    var id = x.getImageData(0, 0, w, h);
    var data = id.data;
    var plane = w * h;
    var floats = new Float32Array(1 * 3 * plane);
    var yy;
    var xx;
    var p;
    var off;
    for (yy = 0; yy < h; yy++) {
      for (xx = 0; xx < w; xx++) {
        p = (yy * w + xx) * 4;
        off = yy * w + xx;
        floats[0 * plane + off] = data[p];
        floats[1 * plane + off] = data[p + 1];
        floats[2 * plane + off] = data[p + 2];
      }
    }
    return { tensor: floats, dims: [1, 3, h, w] };
  }

  function pickU2MaskOutputName(session) {
    var preferred = "1959";
    var names = session.outputNames || [];
    if (names.indexOf(preferred) >= 0) return preferred;
    var i;
    var n;
    var m;
    var d;
    for (i = 0; i < names.length; i++) {
      n = names[i];
      m = session.outputMetadata && session.outputMetadata[n];
      if (!m || !m.dimensions) continue;
      d = m.dimensions.map(Number);
      if (d.length === 4 && d[1] === 1 && d[2] === U2_BOX && d[3] === U2_BOX) return n;
      if (d.length === 3 && d[1] === U2_BOX && d[2] === U2_BOX) return n;
    }
    return names[names.length - 1];
  }

  /** mosaic モデルの固定入力解像度（NCHW の H,W） */
  function getMosaicInputHW(session) {
    var def = { w: MOSAIC_BOX_DEFAULT, h: MOSAIC_BOX_DEFAULT };
    if (!session || !session.inputNames || !session.inputNames.length) return def;
    var name = session.inputNames[0];
    var meta = session.inputMetadata && session.inputMetadata[name];
    if (!meta || !meta.dimensions) return def;
    var d = meta.dimensions.map(Number);
    if (d.length >= 4) {
      var h = d[2];
      var w = d[3];
      if (h > 0 && w > 0 && isFinite(h) && isFinite(w)) return { w: w, h: h };
    }
    return def;
  }

  function extractMask1D(tensor, dims) {
    var w;
    var h;
    var data = tensor.data ? tensor.data : tensor;
    if (dims.length === 4) {
      h = dims[2];
      w = dims[3];
      var out = new Float32Array(w * h);
      var i;
      for (i = 0; i < w * h; i++) out[i] = data[i];
      return { mask: out, w: w, h: h };
    }
    if (dims.length === 3) {
      h = dims[1];
      w = dims[2];
      var out3 = new Float32Array(w * h);
      for (i = 0; i < w * h; i++) out3[i] = data[i];
      return { mask: out3, w: w, h: h };
    }
    throw new Error("予期しないマスク形状: " + JSON.stringify(dims));
  }

  function maybeSigmoid(mask) {
    var mi = Infinity;
    var ma = -Infinity;
    var i;
    var v;
    for (i = 0; i < mask.length; i++) {
      v = mask[i];
      if (v < mi) mi = v;
      if (v > ma) ma = v;
    }
    if (ma <= 1 && mi >= 0) return mask;
    var out = new Float32Array(mask.length);
    for (i = 0; i < mask.length; i++) {
      v = mask[i];
      out[i] = 1 / (1 + Math.exp(-v));
    }
    return out;
  }

  function applyMaskToRgbaImageData(id, mask01, mw, mh) {
    var d = id.data;
    var w = id.width;
    var h = id.height;
    var yy;
    var xx;
    var sx;
    var sy;
    var mv;
    var pi;
    for (yy = 0; yy < h; yy++) {
      sy = Math.min(mh - 1, Math.round((yy / Math.max(1, h - 1)) * (mh - 1)));
      for (xx = 0; xx < w; xx++) {
        sx = Math.min(mw - 1, Math.round((xx / Math.max(1, w - 1)) * (mw - 1)));
        mv = mask01[sy * mw + sx];
        pi = (yy * w + xx) * 4 + 3;
        d[pi] = Math.round(255 * mv);
      }
    }
  }

  function syncProcessButton() {
    if (!btnProcess) return;
    btnProcess.disabled = !(u2Session && mosaicSession && photoImage && bgImage);
  }

  function updateSliderLabels() {
    if (valX) valX.textContent = "(" + (slX ? slX.value : 0) + " px)";
    if (valY) valY.textContent = "(" + (slY ? slY.value : 0) + " px)";
    if (valScale && slScale) valScale.textContent = "(" + slScale.value + "%)";
    if (valRot && slRot) valRot.textContent = "(" + slRot.value + "°)";
  }

  function getTransformParams() {
    if (!bgImage) return null;
    var bw = bgImage.naturalWidth;
    var bh = bgImage.naturalHeight;
    var px = slX ? parseFloat(slX.value) : 0;
    var py = slY ? parseFloat(slY.value) : 0;
    var sc = slScale ? parseFloat(slScale.value) / 100 : 1;
    var rot = slRot ? (parseFloat(slRot.value) * Math.PI) / 180 : 0;
    var pw = lastPersonW;
    var ph = lastPersonH;
    var cx = bw / 2 + px;
    var cy = bh / 2 + py;
    return {
      bw: bw,
      bh: bh,
      px: px,
      py: py,
      sc: sc,
      rot: rot,
      pw: pw,
      ph: ph,
      cx: cx,
      cy: cy
    };
  }

  function canvasPointFromEvent(ev) {
    var rect = stage.getBoundingClientRect();
    var sx = stage.width / Math.max(rect.width, 1e-6);
    var sy = stage.height / Math.max(rect.height, 1e-6);
    return {
      x: (ev.clientX - rect.left) * sx,
      y: (ev.clientY - rect.top) * sy
    };
  }

  function hitTestPerson(mx, my) {
    if (!lastPersonRgba || !bgImage || !lastPersonW || !lastPersonH) return false;
    var t = getTransformParams();
    if (!t) return false;
    var dx = mx - t.cx;
    var dy = my - t.cy;
    var c = Math.cos(-t.rot);
    var s = Math.sin(-t.rot);
    var lx = (c * dx - s * dy) / t.sc;
    var ly = (s * dx + c * dy) / t.sc;
    var u = lx + t.pw / 2;
    var v = ly + t.ph / 2;
    return u >= 0 && u <= t.pw && v >= 0 && v <= t.ph;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function updateSliderRangesForCanvas() {
    if (!bgImage || !slX || !slY) return;
    var half = Math.ceil(Math.max(bgImage.naturalWidth, bgImage.naturalHeight) / 2) + 400;
    slX.min = String(-half);
    slX.max = String(half);
    slY.min = String(-half);
    slY.max = String(half);
  }

  function updateStageCursorClass(ev) {
    if (!stage || drag.active) return;
    if (!lastPersonRgba) {
      stage.classList.remove("can-grab", "can-rotate", "can-scale", "grabbing");
      return;
    }
    var pt = canvasPointFromEvent(ev);
    var hit = hitTestPerson(pt.x, pt.y);
    stage.classList.remove("can-grab", "can-rotate", "can-scale");
    if (!hit) return;
    if (ev.shiftKey) stage.classList.add("can-rotate");
    else if (ev.ctrlKey || ev.metaKey) stage.classList.add("can-scale");
    else stage.classList.add("can-grab");
  }

  function drawComposite() {
    if (!ctx || !bgImage) return;
    var t = getTransformParams();
    if (!t) return;
    stage.width = t.bw;
    stage.height = t.bh;
    ctx.clearRect(0, 0, t.bw, t.bh);
    ctx.drawImage(bgImage, 0, 0);

    if (!lastPersonRgba || !lastPersonW || !lastPersonH) return;

    ctx.save();
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.rot);
    ctx.scale(t.sc, t.sc);
    ctx.translate(-t.pw / 2, -t.ph / 2);
    var tmp = document.createElement("canvas");
    tmp.width = t.pw;
    tmp.height = t.ph;
    tmp.getContext("2d").putImageData(lastPersonRgba, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  async function runPipeline() {
    if (!u2Session || !mosaicSession) {
      setStatus("モデルが未ロードです。ページを再読み込みしてください。");
      return;
    }
    if (!photoImage) {
      setStatus("先に人物写真を選んでください。");
      return;
    }
    if (!bgImage) {
      setStatus("背景画像がありません。ファイルを選ぶか、既定パスに画像を置いてください。");
      return;
    }

    btnProcess.disabled = true;
    setStatus("U²-Net でマスク推論中…（初回は数十秒かかることがあります）");
    try {
      var lb = letterboxToTensor(photoImage);
      var inName = u2Session.inputNames && u2Session.inputNames[0];
      if (!inName) throw new Error("u2net 入力名が取得できません。");

      var feeds = {};
      feeds[inName] = new window.ort.Tensor("float32", lb.tensor, lb.dims);
      var outMap = await u2Session.run(feeds);
      var outName = pickU2MaskOutputName(u2Session);
      var outTen = outMap[outName];
      if (!outTen) throw new Error("マスク出力が見つかりません: " + outName);

      var ext = extractMask1D(outTen, outTen.dims);
      var mask01 = maybeSigmoid(ext.mask);

      setStatus("モザイクスタイル適用中…");
      var cRgb = document.createElement("canvas");
      cRgb.width = U2_BOX;
      cRgb.height = U2_BOX;
      var xRgb = cRgb.getContext("2d", { alpha: true, willReadFrequently: true });
      xRgb.drawImage(photoImage, lb.padX, lb.padY, lb.innerW, lb.innerH);

      var mosaicHw = getMosaicInputHW(mosaicSession);
      var mw = mosaicHw.w;
      var mh = mosaicHw.h;
      var cMosaic = document.createElement("canvas");
      cMosaic.width = mw;
      cMosaic.height = mh;
      var xMosaic = cMosaic.getContext("2d", { alpha: true, willReadFrequently: true });
      xMosaic.drawImage(cRgb, 0, 0, U2_BOX, U2_BOX, 0, 0, mw, mh);

      var styleIn = rgbFloat255NCHWFromCanvasRegion(cMosaic);
      var mInName = mosaicSession.inputNames && mosaicSession.inputNames[0];
      if (!mInName) throw new Error("mosaic 入力名が取得できません。");
      var feeds2 = {};
      feeds2[mInName] = new window.ort.Tensor("float32", styleIn.tensor, styleIn.dims);
      var outMap2 = await mosaicSession.run(feeds2);
      var mOutName = mosaicSession.outputNames && mosaicSession.outputNames[0];
      var stOut = outMap2[mOutName];
      if (!stOut) throw new Error("スタイル出力が取得できません。");

      var sd = stOut.data;
      var sdim = stOut.dims.map(Number);
      var sh = sdim[2];
      var sw = sdim[3];
      var plane2 = sw * sh;
      var cSmall = document.createElement("canvas");
      cSmall.width = sw;
      cSmall.height = sh;
      var xSmall = cSmall.getContext("2d", { alpha: true, willReadFrequently: true });
      var idSmall = xSmall.createImageData(sw, sh);
      var ds = idSmall.data;
      var yy;
      var xx;
      var pi;
      var rr;
      var gg;
      var bb;
      for (yy = 0; yy < sh; yy++) {
        for (xx = 0; xx < sw; xx++) {
          pi = (yy * sw + xx) * 4;
          rr = sd[0 * plane2 + yy * sw + xx];
          gg = sd[1 * plane2 + yy * sw + xx];
          bb = sd[2 * plane2 + yy * sw + xx];
          ds[pi] = Math.max(0, Math.min(255, Math.round(rr)));
          ds[pi + 1] = Math.max(0, Math.min(255, Math.round(gg)));
          ds[pi + 2] = Math.max(0, Math.min(255, Math.round(bb)));
          ds[pi + 3] = 255;
        }
      }
      xSmall.putImageData(idSmall, 0, 0);

      var cUpscale = document.createElement("canvas");
      cUpscale.width = U2_BOX;
      cUpscale.height = U2_BOX;
      var xUpscale = cUpscale.getContext("2d", { alpha: true, willReadFrequently: true });
      xUpscale.imageSmoothingEnabled = true;
      xUpscale.imageSmoothingQuality = "high";
      xUpscale.drawImage(cSmall, 0, 0, sw, sh, 0, 0, U2_BOX, U2_BOX);
      var idStyled = xUpscale.getImageData(0, 0, U2_BOX, U2_BOX);

      applyMaskToRgbaImageData(idStyled, mask01, ext.w, ext.h);
      lastPersonRgba = idStyled;
      lastPersonW = U2_BOX;
      lastPersonH = U2_BOX;

      setStatus("合成プレビューを更新しました。キャンバス上でドラッグで移動、Shift+ドラッグで回転、Ctrl+ドラッグ／ホイールで拡大。スライダーでも調整できます。");
      drawComposite();
      if (btnDl) btnDl.disabled = false;
    } catch (e) {
      setStatus("エラー: " + (e && e.message ? e.message : String(e)));
    } finally {
      syncProcessButton();
    }
  }

  function onBgReady() {
    updateSliderRangesForCanvas();
    updateSliderLabels();
    drawComposite();
    syncProcessButton();
  }

  if (u2netFileEl) {
    u2netFileEl.addEventListener("change", function () {
      var f = u2netFileEl.files && u2netFileEl.files[0];
      loadU2FromFile(f);
    });
  }
  if (mosaicFileEl) {
    mosaicFileEl.addEventListener("change", function () {
      var f = mosaicFileEl.files && mosaicFileEl.files[0];
      loadMosaicFromFile(f);
    });
  }

  photoFileEl.addEventListener("change", function () {
    var f = photoFileEl.files && photoFileEl.files[0];
    if (!f) return;
    if (photoPresetEl) photoPresetEl.value = "file";
    loadImageFromFile(f).then(function (img) {
      photoImage = img;
      setStatus("写真を読み込みました。" + (u2Session && mosaicSession ? "「切り抜き＋スタイル＋合成」を押してください。" : ""));
      syncProcessButton();
    }).catch(function (e) {
      setStatus(e.message || String(e));
    });
  });

  bgFileEl.addEventListener("change", function () {
    var f = bgFileEl.files && bgFileEl.files[0];
    if (!f) return;
    if (bgPresetEl) bgPresetEl.value = "file";
    loadImageFromFile(f).then(function (img) {
      bgImage = img;
      onBgReady();
    }).catch(function (e) {
      setStatus(e.message || String(e));
    });
  });

  if (photoPresetEl) {
    photoPresetEl.addEventListener("change", function () {
      applyPhotoPreset(photoPresetEl.value);
    });
  }
  if (bgPresetEl) {
    bgPresetEl.addEventListener("change", function () {
      applyBgPreset(bgPresetEl.value);
    });
  }
  if (btnClearModelCache) {
    btnClearModelCache.addEventListener("click", function () {
      cacheClearAllModels().then(function () {
        setStatus("ONNX の IndexedDB キャッシュを削除しました。再読み込み後に再取得します。");
      });
    });
  }

  ["input", "change"].forEach(function (ev) {
    if (slX) slX.addEventListener(ev, function () { updateSliderLabels(); drawComposite(); });
    if (slY) slY.addEventListener(ev, function () { updateSliderLabels(); drawComposite(); });
    if (slScale) slScale.addEventListener(ev, function () { updateSliderLabels(); drawComposite(); });
    if (slRot) slRot.addEventListener(ev, function () { updateSliderLabels(); drawComposite(); });
  });

  function refreshCursorFromKeys(modEv) {
    if (!lastPersonRgba || !stage) return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) return;
    updateStageCursorClass({
      clientX: lastPointerPos.x,
      clientY: lastPointerPos.y,
      shiftKey: modEv.shiftKey,
      ctrlKey: modEv.ctrlKey,
      metaKey: modEv.metaKey
    });
  }
  window.addEventListener("keydown", refreshCursorFromKeys);
  window.addEventListener("keyup", refreshCursorFromKeys);

  if (stage) {
    stage.addEventListener("pointermove", function (ev) {
      lastPointerPos.x = ev.clientX;
      lastPointerPos.y = ev.clientY;
      if (!drag.active) updateStageCursorClass(ev);
    });
    stage.addEventListener("pointerleave", function () {
      if (!drag.active) {
        stage.classList.remove("can-grab", "can-rotate", "can-scale");
      }
    });
    stage.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      if (!lastPersonRgba) return;
      var pt = canvasPointFromEvent(ev);
      if (!hitTestPerson(pt.x, pt.y)) return;
      ev.preventDefault();
      drag.active = true;
      stage.classList.add("grabbing");
      stage.classList.remove("can-grab", "can-rotate", "can-scale");
      var t = getTransformParams();
      if (!t) {
        drag.active = false;
        stage.classList.remove("grabbing");
        return;
      }
      if (ev.shiftKey) {
        drag.mode = "rotate";
        drag.angle0 = Math.atan2(pt.y - t.cy, pt.x - t.cx);
        drag.rot0 = parseFloat(slRot && slRot.value ? slRot.value : "0") || 0;
      } else if (ev.ctrlKey || ev.metaKey) {
        drag.mode = "scale";
        var dx0 = pt.x - t.cx;
        var dy0 = pt.y - t.cy;
        drag.dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        drag.scale0 = parseFloat(slScale && slScale.value ? slScale.value : "100") || 100;
        if (drag.dist0 < 8) drag.dist0 = 8;
      } else {
        drag.mode = "move";
        drag.lastX = pt.x;
        drag.lastY = pt.y;
      }
      try {
        stage.setPointerCapture(ev.pointerId);
      } catch (e2) {}
    });
    stage.addEventListener("pointermove", function (ev) {
      if (!drag.active || !drag.mode) return;
      var pt = canvasPointFromEvent(ev);
      var t = getTransformParams();
      if (!t || !slX || !slY || !slScale || !slRot) return;
      if (drag.mode === "move") {
        var dx = pt.x - drag.lastX;
        var dy = pt.y - drag.lastY;
        slX.value = String(
          clamp(parseFloat(slX.value) + dx, parseFloat(slX.min), parseFloat(slX.max))
        );
        slY.value = String(
          clamp(parseFloat(slY.value) + dy, parseFloat(slY.min), parseFloat(slY.max))
        );
        drag.lastX = pt.x;
        drag.lastY = pt.y;
      } else if (drag.mode === "rotate") {
        var aNow = Math.atan2(pt.y - t.cy, pt.x - t.cx);
        var deltaRad = aNow - drag.angle0;
        if (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
        if (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
        var newRot = drag.rot0 + (deltaRad * 180) / Math.PI;
        slRot.value = String(
          Math.round(clamp(newRot, parseFloat(slRot.min), parseFloat(slRot.max)))
        );
      } else if (drag.mode === "scale") {
        var dxs = pt.x - t.cx;
        var dys = pt.y - t.cy;
        var d1 = Math.sqrt(dxs * dxs + dys * dys);
        if (drag.dist0 < 1e-6) return;
        var next = drag.scale0 * (d1 / drag.dist0);
        slScale.value = String(
          Math.round(clamp(next, parseFloat(slScale.min), parseFloat(slScale.max)))
        );
      }
      updateSliderLabels();
      drawComposite();
    });
    function endPointerDrag(ev) {
      if (!drag.active) return;
      drag.active = false;
      drag.mode = null;
      stage.classList.remove("grabbing");
      if (ev && ev.pointerId != null) {
        try {
          stage.releasePointerCapture(ev.pointerId);
        } catch (e3) {}
      }
      var ev2 = ev || {
        clientX: lastPointerPos.x,
        clientY: lastPointerPos.y,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false
      };
      updateStageCursorClass(ev2);
    }
    stage.addEventListener("pointerup", endPointerDrag);
    stage.addEventListener("pointercancel", endPointerDrag);
    stage.addEventListener(
      "wheel",
      function (ev) {
        if (!lastPersonRgba) return;
        var pt = canvasPointFromEvent(ev);
        if (!hitTestPerson(pt.x, pt.y)) return;
        ev.preventDefault();
        if (!slScale) return;
        var cur = parseFloat(slScale.value) || 100;
        var step = ev.deltaY > 0 ? -4 : 4;
        slScale.value = String(
          Math.round(clamp(cur + step, parseFloat(slScale.min), parseFloat(slScale.max)))
        );
        updateSliderLabels();
        drawComposite();
      },
      { passive: false }
    );
  }

  btnDl.addEventListener("click", function () {
    if (!stage.toBlob) {
      setStatus("この環境では toBlob が使えません。");
      return;
    }
    stage.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "diorama-export.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  btnProcess.addEventListener("click", function () {
    runPipeline();
  });

  updateSliderLabels();

  async function bootstrap() {
    await applyPhotoPreset("synthetic");
    await applyBgPreset(bgPresetEl ? bgPresetEl.value : "bundled");
    await tryAutoLoadFromUrls();
  }
  bootstrap();
})();
