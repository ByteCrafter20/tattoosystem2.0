// public/js/stencil.js
//
// Stencil Print - pumili ng larawan, i-filter, itakda ang laki sa inches,
// i-preview sa papel, at i-print o i-download.
//
// BAGO: puwede nang maglagay ng higit sa isang picture sa papel.
//   - I-click ang picture para piliin ito.
//   - I-drag ang picture kahit saan sa papel.
//   - Bawat picture ay may sariling filter, laki, rotate at mirror.
//   - Delete key (o ang x sa listahan) para tanggalin ang napiling picture.
//
// Library galing sa:
//     GET /api/photos                      (designs at gallery)
//     GET /api/appointments/admin/all      (reference photos ng mga client)
//
// Kapag may ?image=/uploads/xxx.png sa URL (galing sa modal), awtomatiko
// itong ilalagay sa papel.

document.addEventListener('DOMContentLoaded', function () {

    var MAX_SIDE = 1600;   // pinakamalaking side ng working image, sa pixels
    var EXPORT_DPI = 200;  // linaw ng print / download
    var MAX_LAYERS = 6;    // pinakamaraming picture sa isang papel

    var PAPERS = {
        A4: { w: 8.27, h: 11.69, css: 'A4' },
        Letter: { w: 8.5, h: 11, css: 'letter' },
        A5: { w: 5.83, h: 8.27, css: 'A5' },
        '4x6': { w: 4, h: 6, css: '4in 6in' }
    };

    // ---------- Elements ----------
    var fileInput = document.getElementById('stFile');
    var dropZone = document.getElementById('stDrop');
    var fileName = document.getElementById('stFileName');
    var canvas = document.getElementById('stCanvas');   // hindi na ginagamit; nakatago
    var empty = document.getElementById('stEmpty');
    var paperBox = document.getElementById('stPaperBox');
    var previewInfo = document.getElementById('stPreviewInfo');

    var brightness = document.getElementById('stBrightness');
    var contrast = document.getElementById('stContrast');
    var level = document.getElementById('stLevel');
    var levelField = document.getElementById('stLevelField');
    var invert = document.getElementById('stInvert');
    var mirror = document.getElementById('stMirror');

    var widthInput = document.getElementById('stWidth');
    var heightInput = document.getElementById('stHeight');
    var lock = document.getElementById('stLock');
    var paperSelect = document.getElementById('stPaper');
    var sizeNote = document.getElementById('stSizeNote');

    var printBtn = document.getElementById('stPrint');
    var downloadBtn = document.getElementById('stDownload');
    var printImage = document.getElementById('stPrintImage');
    var pageStyle = document.getElementById('stPageStyle');

    var library = document.getElementById('stLibrary');
    var libGrid = document.getElementById('stLibGrid');
    var libEmpty = document.getElementById('stLibEmpty');

    // ---------- State ----------
    var layers = [];        // mga picture sa papel (huli = nasa ibabaw)
    var selected = null;    // napiling picture
    var nextId = 1;

    var libraryData = null; // { designs: [], gallery: [], references: [] }
    var libraryTab = 'designs';

    // ---------- Setup ng papel at listahan ----------
    canvas.style.display = 'none';

    paperBox.style.position = 'relative';
    paperBox.style.overflow = 'hidden';

    fileInput.multiple = true;

    var layerList = document.createElement('div');
    layerList.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
    fileName.insertAdjacentElement('afterend', layerList);

    // ---------- Remove Background (on/off chip + slider) ----------
    var filtersBox = document.getElementById('stFilters');

    var bgChip = document.createElement('button');
    bgChip.type = 'button';
    bgChip.className = 'st-chip';
    bgChip.setAttribute('data-action', 'removebg');
    bgChip.textContent = 'Remove Background';
    bgChip.style.gridColumn = '1 / -1';
    bgChip.style.flex = '1 1 100%';
    filtersBox.appendChild(bgChip);

    var bgField = document.createElement('div');
    bgField.className = 'st-field';
    bgField.style.display = 'none';
    bgField.innerHTML =
        '<label for="stBgTol">Background removal <output id="stBgTolOut">25</output></label>' +
        '<input type="range" id="stBgTol" min="5" max="100" value="25">';
    filtersBox.insertAdjacentElement('afterend', bgField);

    var bgTol = document.getElementById('stBgTol');

    // ---------- Crop (chip + Apply / Cancel / Reset) ----------
    var crop = null;   // { layer, rect: {x,y,w,h} (0..1 ng picture), overlay, box }

    var cropChip = document.createElement('button');
    cropChip.type = 'button';
    cropChip.className = 'st-chip';
    cropChip.setAttribute('data-action', 'crop');
    cropChip.textContent = 'Crop';
    cropChip.style.gridColumn = '1 / -1';
    cropChip.style.flex = '1 1 100%';
    filtersBox.appendChild(cropChip);

    var cropBar = document.createElement('div');
    cropBar.style.cssText = 'display:none;margin-top:8px;';
    cropBar.innerHTML =
        '<small class="st-muted" style="display:block;margin-bottom:6px;">' +
            'Drag the box or its corners/edges on the picture, then press Apply Crop.' +
        '</small>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button type="button" class="st-btn" id="stCropApply">Apply Crop</button>' +
            '<button type="button" class="st-btn st-btn-light" id="stCropCancel">Cancel</button>' +
            '<button type="button" class="st-btn st-btn-light" id="stCropReset">Reset Crop</button>' +
        '</div>';
    bgField.insertAdjacentElement('afterend', cropBar);

    // ==================================================
    // HELPERS
    // ==================================================

    function clamp(v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    function round(value, places) {
        var p = Math.pow(10, places);
        return Math.round(value * p) / p;
    }

    function paper() {
        return PAPERS[paperSelect.value] || PAPERS.A4;
    }

    function setOut(id, value) {
        var el = document.getElementById(id);

        if (el) {
            el.textContent = value;
        }
    }

    // Hindi hahayaang tuluyang lumabas sa papel - may matitira laging maaabot
    function clampPos(value, size, paperSize) {
        var min = -size + 0.5;
        var max = paperSize - 0.5;

        return Math.min(Math.max(value, min), max);
    }

    // ==================================================
    // IMAGE PROCESSING (per picture)
    // ==================================================

    function adjustFactor(s) {
        var c = Number(s.contrast) * 2.55;
        return (259 * (c + 255)) / (255 * (259 - c));
    }

    // 3x3 Sobel - nagbabalik ng laki ng gilid ng bawat pixel
    function sobel(gray, w, h) {
        var out = new Float32Array(w * h);

        for (var y = 1; y < h - 1; y++) {
            for (var x = 1; x < w - 1; x++) {
                var i = y * w + x;

                var gx =
                    -gray[i - w - 1] + gray[i - w + 1] +
                    -2 * gray[i - 1] + 2 * gray[i + 1] +
                    -gray[i + w - 1] + gray[i + w + 1];

                var gy =
                    -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
                    gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];

                out[i] = Math.sqrt(gx * gx + gy * gy);
            }
        }

        return out;
    }

    // Bahagyang blur para hindi puro ingay ang line art
    function blur(gray, w, h) {
        var out = new Float32Array(gray.length);

        for (var y = 1; y < h - 1; y++) {
            for (var x = 1; x < w - 1; x++) {
                var i = y * w + x;
                var sum = 0;

                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        sum += gray[i + dy * w + dx];
                    }
                }

                out[i] = sum / 9;
            }
        }

        return out;
    }

    function applyFilter(imageData, w, h, s) {
        var d = imageData.data;
        var n = w * h;
        var factor = adjustFactor(s);
        var bright = Number(s.brightness);
        var cutoff = Number(s.level);
        var flip = s.invert;

        // Grayscale na may brightness at contrast
        var gray = new Float32Array(n);

        for (var i = 0; i < n; i++) {
            var p = i * 4;
            var g = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];

            gray[i] = clamp(factor * (g - 128) + 128 + bright);
        }

        if (s.filter === 'original') {
            for (var a = 0; a < n; a++) {
                var q = a * 4;

                for (var c = 0; c < 3; c++) {
                    var v = clamp(factor * (d[q + c] - 128) + 128 + bright);
                    d[q + c] = flip ? 255 - v : v;
                }

                d[q + 3] = 255;
            }

            return;
        }

        var result = new Uint8ClampedArray(n);

        if (s.filter === 'gray') {
            for (var b = 0; b < n; b++) {
                result[b] = gray[b];
            }
        } else if (s.filter === 'stencil') {
            // Itim at puti lang
            for (var st = 0; st < n; st++) {
                result[st] = gray[st] < cutoff ? 0 : 255;
            }
        } else if (s.filter === 'lineart') {
            // Mga gilid lang - itim na linya sa puting papel
            var edges = sobel(blur(gray, w, h), w, h);
            var edgeCutoff = (256 - cutoff) * 1.5;

            for (var e = 0; e < n; e++) {
                result[e] = edges[e] > edgeCutoff ? 0 : 255;
            }
        }

        for (var k = 0; k < n; k++) {
            var value = flip ? 255 - result[k] : result[k];
            var o = k * 4;

            d[o] = value;
            d[o + 1] = value;
            d[o + 2] = value;
            d[o + 3] = 255;
        }
    }

    // Remove Background: kinukuha ang kulay ng background sa mga gilid ng larawan,
    // tapos flood fill papasok hanggang makarating sa kulay na hindi na kahawig.
    // Ang mga bahagi sa loob ng subject (hindi konektado sa gilid) ay hindi tinatanggal.
    function backgroundMask(imageData, w, h, tolerance) {
        var d = imageData.data;
        var n = w * h;
        var limit = Number(tolerance) * 3;   // pinakamalayong kulay na ituturing na background
        var limitSq = limit * limit;

        // Kulay sa 4 na sulok at 4 na gitna ng gilid
        var spots = [
            [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
            [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1]
        ];

        var refs = [];

        spots.forEach(function (spot) {
            var r = 0, g = 0, b = 0, count = 0;

            for (var dy = -2; dy <= 2; dy++) {
                for (var dx = -2; dx <= 2; dx++) {
                    var x = Math.min(Math.max(spot[0] + dx, 0), w - 1);
                    var y = Math.min(Math.max(spot[1] + dy, 0), h - 1);
                    var p = (y * w + x) * 4;

                    r += d[p];
                    g += d[p + 1];
                    b += d[p + 2];
                    count++;
                }
            }

            var ref = [r / count, g / count, b / count];

            var duplicate = refs.some(function (other) {
                var a = other[0] - ref[0], bb = other[1] - ref[1], cc = other[2] - ref[2];
                return a * a + bb * bb + cc * cc < 900;
            });

            if (!duplicate) {
                refs.push(ref);
            }
        });

        function matches(p, factor) {
            var lim = limitSq * factor;

            for (var i = 0; i < refs.length; i++) {
                var dr = d[p] - refs[i][0];
                var dg = d[p + 1] - refs[i][1];
                var db = d[p + 2] - refs[i][2];

                if (dr * dr + dg * dg + db * db <= lim) {
                    return true;
                }
            }

            return false;
        }

        var mask = new Uint8Array(n);
        var stack = new Int32Array(n);
        var top = 0;

        function push(i) {
            if (!mask[i] && matches(i * 4, 1)) {
                mask[i] = 1;
                stack[top++] = i;
            }
        }

        // Magsimula sa lahat ng pixel sa gilid
        var x, y;

        for (x = 0; x < w; x++) {
            push(x);
            push((h - 1) * w + x);
        }

        for (y = 0; y < h; y++) {
            push(y * w);
            push(y * w + w - 1);
        }

        while (top) {
            var i = stack[--top];
            var px = i % w;
            var py = (i / w) | 0;

            if (px > 0) { push(i - 1); }
            if (px < w - 1) { push(i + 1); }
            if (py > 0) { push(i - w); }
            if (py < h - 1) { push(i + w); }
        }

        // Alisin ang manipis na "halo" sa gilid ng subject
        var halo = [];

        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                var k = y * w + x;

                if (mask[k]) {
                    continue;
                }

                var touching =
                    (x > 0 && mask[k - 1]) ||
                    (x < w - 1 && mask[k + 1]) ||
                    (y > 0 && mask[k - w]) ||
                    (y < h - 1 && mask[k + w]);

                if (touching && matches(k * 4, 1.96)) {
                    halo.push(k);
                }
            }
        }

        halo.forEach(function (k) {
            mask[k] = 1;
        });

        return mask;
    }

    // Ini-render ang isang picture sa sarili nitong canvas
    function renderLayer(l) {
        var sw = l.img.naturalWidth;
        var sh = l.img.naturalHeight;
        var scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
        var w = Math.round(sw * scale);
        var h = Math.round(sh * scale);
        var turned = l.rotation % 180 !== 0;
        var c = l.canvas;

        c.width = turned ? h : w;
        c.height = turned ? w : h;

        var ctx = c.getContext('2d');

        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);

        ctx.translate(c.width / 2, c.height / 2);

        if (l.mirror) {
            ctx.scale(-1, 1);
        }

        ctx.rotate(l.rotation * Math.PI / 180);
        ctx.drawImage(l.img, -w / 2, -h / 2, w, h);
        ctx.restore();

        var imageData = ctx.getImageData(0, 0, c.width, c.height);

        // Hanapin muna ang background sa orihinal na kulay, bago ang filter
        var mask = l.removeBg ? backgroundMask(imageData, c.width, c.height, l.bgTol) : null;

        applyFilter(imageData, c.width, c.height, l);

        // Gawing transparent ang background - tuloy pa rin ang napiling filter sa subject
        if (mask) {
            var dd = imageData.data;

            for (var m = 0; m < mask.length; m++) {
                if (mask[m]) {
                    var o = m * 4;

                    dd[o] = 255;
                    dd[o + 1] = 255;
                    dd[o + 2] = 255;
                    dd[o + 3] = 0;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);

        l.ratio = c.height / c.width;
    }

    // ==================================================
    // PAPER / POSITION
    // ==================================================

    // Inilalagay ang picture sa papel (percent ng papel, kaya sumusunod sa laki ng preview)
    function layout(l) {
        var p = paper();

        l.canvas.style.left = (l.x / p.w * 100) + '%';
        l.canvas.style.top = (l.y / p.h * 100) + '%';
        l.canvas.style.width = (l.w / p.w * 100) + '%';
        l.canvas.style.height = (l.h / p.h * 100) + '%';

        if (crop && crop.layer === l) {
            placeCropOverlay();
        }
    }

    function layoutAll() {
        var p = paper();

        paperBox.style.aspectRatio = p.w + ' / ' + p.h;
        pageStyle.textContent = '@page { size: ' + p.css + '; margin: 0; }';

        layers.forEach(function (l) {
            l.x = clampPos(l.x, l.w, p.w);
            l.y = clampPos(l.y, l.h, p.h);
            layout(l);
        });

        updateNote();
    }

    function updateOutlines() {
        layers.forEach(function (l) {
            l.canvas.style.outline = l === selected ? '2px dashed #e63946' : 'none';
            l.canvas.style.outlineOffset = '2px';
        });
    }

    function updateNote() {
        var p = paper();

        if (!layers.length) {
            sizeNote.textContent = '';
            return;
        }

        if (!selected) {
            sizeNote.textContent = 'Click a picture to select it. Drag it to move it.';
            return;
        }

        if (selected.w > p.w || selected.h > p.h) {
            sizeNote.textContent = 'This picture is bigger than the paper - part of it will be cut off. Drag it to move it.';
        } else {
            sizeNote.textContent = 'Drag the picture on the paper to move it.';
        }
    }

    // ==================================================
    // LAYER LIST / UI
    // ==================================================

    function shortName(name) {
        name = String(name || 'picture');
        return name.length > 18 ? name.slice(0, 17) + '\u2026' : name;
    }

    function renderList() {
        layerList.innerHTML = '';

        layers.forEach(function (l) {
            var wrap = document.createElement('span');
            var pick = document.createElement('button');
            var del = document.createElement('button');

            wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

            pick.type = 'button';
            pick.className = 'st-chip' + (l === selected ? ' active' : '');
            pick.textContent = shortName(l.name);
            pick.title = l.name;

            del.type = 'button';
            del.className = 'st-chip';
            del.textContent = '\u00D7';
            del.title = 'Remove this picture';
            del.style.cssText = 'padding:2px 8px;';

            pick.addEventListener('click', function () {
                selectLayer(l);
            });

            del.addEventListener('click', function () {
                removeLayer(l);
            });

            wrap.appendChild(pick);
            wrap.appendChild(del);
            layerList.appendChild(wrap);
        });
    }

    function updateUI() {
        var has = layers.length > 0;

        empty.style.display = has ? 'none' : 'flex';
        printBtn.disabled = !has;
        downloadBtn.disabled = !has;

        previewInfo.textContent = has
            ? layers.length + (layers.length === 1 ? ' picture' : ' pictures') + ' on ' + paperSelect.value
            : '';

        fileName.textContent = has
            ? 'Click a picture on the paper to select it, then drag to move it.'
            : 'No picture selected.';

        renderList();
        updateOutlines();
        updateNote();
    }

    // Ipinapakita sa mga control ang settings ng napiling picture
    function syncControls() {
        if (!selected) {
            return;
        }

        var s = selected;

        Array.prototype.forEach.call(document.querySelectorAll('#stFilters [data-filter]'), function (el) {
            el.classList.toggle('active', el.getAttribute('data-filter') === s.filter);
        });

        bgChip.classList.toggle('active', !!s.removeBg);
        bgField.style.display = s.removeBg ? '' : 'none';
        bgTol.value = s.bgTol;
        setOut('stBgTolOut', s.bgTol);

        levelField.style.display = (s.filter === 'stencil' || s.filter === 'lineart') ? '' : 'none';

        brightness.value = s.brightness;
        contrast.value = s.contrast;
        level.value = s.level;

        setOut('stBrightnessOut', s.brightness);
        setOut('stContrastOut', s.contrast);
        setOut('stLevelOut', s.level);

        invert.checked = s.invert;
        mirror.checked = s.mirror;

        widthInput.value = round(s.w, 2);
        heightInput.value = round(s.h, 2);
    }

    function selectLayer(l) {
        if (crop && crop.layer !== l) {
            exitCrop();
        }

        selected = l;

        if (l) {
            // Dalhin sa ibabaw
            var index = layers.indexOf(l);

            if (index !== layers.length - 1) {
                layers.splice(index, 1);
                layers.push(l);
                paperBox.appendChild(l.canvas);
            }

            syncControls();
        }

        updateUI();
    }

    function removeLayer(l) {
        var index = layers.indexOf(l);

        if (index === -1) {
            return;
        }

        if (crop && crop.layer === l) {
            exitCrop();
        }

        layers.splice(index, 1);

        if (l.canvas.parentNode) {
            l.canvas.parentNode.removeChild(l.canvas);
        }

        if (selected === l) {
            selected = null;
            selectLayer(layers.length ? layers[layers.length - 1] : null);
            return;
        }

        updateUI();
    }

    // ==================================================
    // DRAG - igalaw ang picture kahit saan sa papel
    // ==================================================

    function startDrag(l, event) {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        event.preventDefault();

        selectLayer(l);

        var p = paper();
        var rect = paperBox.getBoundingClientRect();
        var startX = event.clientX;
        var startY = event.clientY;
        var originX = l.x;
        var originY = l.y;
        var target = l.canvas;

        try {
            target.setPointerCapture(event.pointerId);
        } catch (e) { /* ok lang kung hindi supported */ }

        target.style.cursor = 'grabbing';

        function move(e) {
            var dx = (e.clientX - startX) / rect.width * p.w;
            var dy = (e.clientY - startY) / rect.height * p.h;

            l.x = clampPos(originX + dx, l.w, p.w);
            l.y = clampPos(originY + dy, l.h, p.h);

            layout(l);
        }

        function up() {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            target.style.cursor = 'move';

            try {
                target.releasePointerCapture(event.pointerId);
            } catch (e) { /* ok lang */ }
        }

        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }

    // I-click ang walang laman na bahagi ng papel para i-unselect
    paperBox.addEventListener('pointerdown', function (event) {
        if (event.target === paperBox || event.target === empty) {
            exitCrop();
            selected = null;
            updateUI();
        }
    });

    // Delete / Backspace para tanggalin ang napiling picture
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return;
        }

        var tag = event.target && event.target.tagName;

        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
            return;
        }

        if (selected) {
            event.preventDefault();
            removeLayer(selected);
        }
    });

    // ==================================================
    // CROP - ang picture lang ang kino-crop, hindi ang buong papel
    // ==================================================

    var CROP_MIN = 0.05;   // pinakamaliit na bahagi (5%) ng picture

    var CROP_HANDLES = [
        ['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'],
        ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'],
        ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']
    ];

    // Ang picture ayon sa kasalukuyang rotate / mirror, wala pang filter
    function orientedCanvas(l) {
        var sw = l.img.naturalWidth;
        var sh = l.img.naturalHeight;
        var scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
        var w = Math.round(sw * scale);
        var h = Math.round(sh * scale);
        var turned = l.rotation % 180 !== 0;

        var c = document.createElement('canvas');

        c.width = turned ? h : w;
        c.height = turned ? w : h;

        var ctx = c.getContext('2d');

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);

        ctx.translate(c.width / 2, c.height / 2);

        if (l.mirror) {
            ctx.scale(-1, 1);
        }

        ctx.rotate(l.rotation * Math.PI / 180);
        ctx.drawImage(l.img, -w / 2, -h / 2, w, h);

        return c;
    }

    function placeCropBox() {
        if (!crop) {
            return;
        }

        var r = crop.rect;

        crop.box.style.left = (r.x * 100) + '%';
        crop.box.style.top = (r.y * 100) + '%';
        crop.box.style.width = (r.w * 100) + '%';
        crop.box.style.height = (r.h * 100) + '%';
    }

    // Ilalagay ang overlay sa eksaktong pwesto ng picture sa papel
    function placeCropOverlay() {
        if (!crop) {
            return;
        }

        var l = crop.layer;
        var p = paper();
        var o = crop.overlay;

        o.style.left = (l.x / p.w * 100) + '%';
        o.style.top = (l.y / p.h * 100) + '%';
        o.style.width = (l.w / p.w * 100) + '%';
        o.style.height = (l.h / p.h * 100) + '%';

        placeCropBox();
    }

    function startCropDrag(event, dir) {
        if (!crop) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        var target = event.currentTarget;
        var area = crop.overlay.getBoundingClientRect();
        var startX = event.clientX;
        var startY = event.clientY;
        var orig = { x: crop.rect.x, y: crop.rect.y, w: crop.rect.w, h: crop.rect.h };

        try {
            target.setPointerCapture(event.pointerId);
        } catch (e) { /* ok lang */ }

        function move(e) {
            if (!crop) {
                return;
            }

            var dx = (e.clientX - startX) / area.width;
            var dy = (e.clientY - startY) / area.height;

            var left = orig.x;
            var top = orig.y;
            var right = orig.x + orig.w;
            var bottom = orig.y + orig.h;

            if (dir === 'move') {
                left = Math.min(Math.max(orig.x + dx, 0), 1 - orig.w);
                top = Math.min(Math.max(orig.y + dy, 0), 1 - orig.h);
                right = left + orig.w;
                bottom = top + orig.h;
            } else {
                if (dir.indexOf('w') > -1) {
                    left = Math.min(Math.max(orig.x + dx, 0), right - CROP_MIN);
                }

                if (dir.indexOf('e') > -1) {
                    right = Math.max(Math.min(orig.x + orig.w + dx, 1), left + CROP_MIN);
                }

                if (dir.indexOf('n') > -1) {
                    top = Math.min(Math.max(orig.y + dy, 0), bottom - CROP_MIN);
                }

                if (dir.indexOf('s') > -1) {
                    bottom = Math.max(Math.min(orig.y + orig.h + dy, 1), top + CROP_MIN);
                }
            }

            crop.rect.x = left;
            crop.rect.y = top;
            crop.rect.w = right - left;
            crop.rect.h = bottom - top;

            placeCropBox();
        }

        function up() {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);

            try {
                target.releasePointerCapture(event.pointerId);
            } catch (e) { /* ok lang */ }
        }

        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }

    function buildCropOverlay() {
        var overlay = document.createElement('div');
        var box = document.createElement('div');

        overlay.style.cssText = 'position:absolute;z-index:50;overflow:hidden;touch-action:none;';

        box.style.cssText =
            'position:absolute;box-sizing:border-box;border:2px solid #fff;' +
            'box-shadow:0 0 0 9999px rgba(0,0,0,.5);outline:1px solid #e63946;' +
            'cursor:move;touch-action:none;';

        box.addEventListener('pointerdown', function (event) {
            startCropDrag(event, 'move');
        });

        CROP_HANDLES.forEach(function (h) {
            var dot = document.createElement('div');

            dot.style.cssText =
                'position:absolute;width:14px;height:14px;box-sizing:border-box;' +
                'margin:-7px 0 0 -7px;background:#fff;border:2px solid #e63946;' +
                'border-radius:3px;touch-action:none;' +
                'left:' + (h[1] * 100) + '%;top:' + (h[2] * 100) + '%;cursor:' + h[3] + ';';

            dot.addEventListener('pointerdown', function (event) {
                startCropDrag(event, h[0]);
            });

            box.appendChild(dot);
        });

        overlay.appendChild(box);
        paperBox.appendChild(overlay);

        crop.overlay = overlay;
        crop.box = box;
    }

    function startCrop() {
        if (crop) {
            exitCrop();
            return;
        }

        if (!selected && layers.length === 1) {
            selectLayer(layers[0]);
        }

        if (!selected) {
            sizeNote.textContent = layers.length
                ? 'Click a picture on the paper first, then press Crop.'
                : 'Add a picture first, then press Crop.';
            return;
        }

        crop = { layer: selected, rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, overlay: null, box: null };

        buildCropOverlay();
        placeCropOverlay();

        cropChip.classList.add('active');
        cropBar.style.display = '';
        sizeNote.textContent = 'Drag the corners or edges of the box, then press Apply Crop.';
    }

    function exitCrop() {
        if (!crop) {
            return;
        }

        if (crop.overlay && crop.overlay.parentNode) {
            crop.overlay.parentNode.removeChild(crop.overlay);
        }

        crop = null;

        cropChip.classList.remove('active');
        cropBar.style.display = 'none';
    }

    // Ang bahagi lang sa loob ng kahon ang matitira. Nananatili sa dating pwesto sa papel.
    function applyCrop() {
        if (!crop) {
            return;
        }

        var l = crop.layer;
        var r = { x: crop.rect.x, y: crop.rect.y, w: crop.rect.w, h: crop.rect.h };

        var src = orientedCanvas(l);
        var sx = Math.round(r.x * src.width);
        var sy = Math.round(r.y * src.height);
        var sw = Math.max(1, Math.min(Math.round(r.w * src.width), src.width - sx));
        var sh = Math.max(1, Math.min(Math.round(r.h * src.height), src.height - sy));

        var out = document.createElement('canvas');

        out.width = sw;
        out.height = sh;
        out.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);

        var img = new Image();

        img.onload = function () {
            if (layers.indexOf(l) === -1) {
                return;
            }

            if (!l.cropped) {
                l.baseBox = { x: l.x, y: l.y, w: l.w, h: l.h };
            }

            // Ang rotate at mirror ay kasama na sa na-crop na picture
            l.img = img;
            l.rotation = 0;
            l.mirror = false;
            l.cropped = true;

            l.x = l.x + l.w * r.x;
            l.y = l.y + l.h * r.y;
            l.w = round(l.w * r.w, 2);
            l.h = round(l.h * r.h, 2);

            exitCrop();
            renderLayer(l);

            mirror.checked = false;
            syncControls();
            layout(l);
            updateUI();
        };

        img.src = out.toDataURL('image/png');
    }

    // Ibalik ang orihinal na picture bago ang crop
    function resetCrop() {
        var l = crop ? crop.layer : selected;

        if (!l || !l.cropped) {
            return;
        }

        exitCrop();

        l.img = l.baseImg;
        l.rotation = 0;
        l.mirror = false;
        l.cropped = false;

        if (l.baseBox) {
            l.x = l.baseBox.x;
            l.y = l.baseBox.y;
            l.w = l.baseBox.w;
            l.h = l.baseBox.h;
        }

        renderLayer(l);

        mirror.checked = false;
        syncControls();
        layout(l);
        updateUI();
    }

    cropChip.addEventListener('click', startCrop);
    document.getElementById('stCropApply').addEventListener('click', applyCrop);
    document.getElementById('stCropCancel').addEventListener('click', exitCrop);
    document.getElementById('stCropReset').addEventListener('click', resetCrop);

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            exitCrop();
        }
    });

    // ==================================================
    // ADD / LOAD PICTURE
    // ==================================================

    function addLayer(img, name) {
        var p = paper();

        var l = {
            id: nextId++,
            img: img,
            baseImg: img,      // orihinal na picture (para sa Reset Crop)
            baseBox: null,     // posisyon/laki bago ang unang crop
            cropped: false,
            name: name || 'picture',
            canvas: document.createElement('canvas'),

            filter: 'stencil',
            brightness: 0,
            contrast: 0,
            level: 128,
            invert: false,
            mirror: false,
            rotation: 0,
            removeBg: false,
            bgTol: 25,

            x: 0,
            y: 0,
            w: 0,
            h: 0,
            ratio: 1
        };

        l.canvas.style.cssText =
            'position:absolute;display:block;cursor:move;touch-action:none;' +
            'user-select:none;-webkit-user-select:none;mix-blend-mode:multiply;';

        l.canvas.draggable = false;

        l.canvas.addEventListener('pointerdown', function (event) {
            startDrag(l, event);
        });

        renderLayer(l);

        // Panimulang laki: 4 in ang lapad (3 in kapag hindi na ito ang una)
        l.w = Math.min(layers.length ? 3 : 4, round(p.w - 1, 1));
        l.h = round(l.w * l.ratio, 2);

        // Bahagyang nakasalansan para makita na may bago
        var offset = layers.length * 0.5;

        l.x = clampPos(0.5 + offset, l.w, p.w);
        l.y = clampPos(0.5 + offset, l.h, p.h);

        paperBox.appendChild(l.canvas);
        layers.push(l);

        layout(l);
        selectLayer(l);
    }

    function loadPicture(src, name) {
        if (layers.length >= MAX_LAYERS) {
            alert('You can put up to ' + MAX_LAYERS + ' pictures on one paper. Remove one first.');
            return;
        }

        var img = new Image();

        img.onload = function () {
            if (layers.length >= MAX_LAYERS) {
                return;
            }

            addLayer(img, name);
        };

        img.onerror = function () {
            alert('That picture could not be loaded.');
        };

        img.src = src;
    }

    function loadFile(file) {
        if (!file || !/^image\//.test(file.type)) {
            alert('Please choose an image file.');
            return;
        }

        var reader = new FileReader();

        reader.onload = function () {
            loadPicture(reader.result, file.name);
        };

        reader.readAsDataURL(file);
    }

    function loadFiles(files) {
        Array.prototype.forEach.call(files, loadFile);
    }

    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) {
            loadFiles(fileInput.files);
        }

        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (name) {
        dropZone.addEventListener(name, function (event) {
            event.preventDefault();
            dropZone.classList.add('over');
        });
    });

    ['dragleave', 'drop'].forEach(function (name) {
        dropZone.addEventListener(name, function (event) {
            event.preventDefault();
            dropZone.classList.remove('over');
        });
    });

    dropZone.addEventListener('drop', function (event) {
        if (event.dataTransfer.files.length) {
            loadFiles(event.dataTransfer.files);
        }
    });

    // ==================================================
    // CONTROLS (para sa napiling picture)
    // ==================================================

    document.getElementById('stFilters').addEventListener('click', function (event) {
        var chip = event.target.closest('[data-filter]');

        if (!chip || !selected) {
            return;
        }

        selected.filter = chip.getAttribute('data-filter');

        Array.prototype.forEach.call(this.querySelectorAll('[data-filter]'), function (el) {
            el.classList.toggle('active', el === chip);
        });

        // Ang "Detail level" ay para lang sa Stencil at Line Art
        levelField.style.display = (selected.filter === 'stencil' || selected.filter === 'lineart') ? '' : 'none';

        renderLayer(selected);
    });

    [
        [brightness, 'stBrightnessOut', 'brightness'],
        [contrast, 'stContrastOut', 'contrast'],
        [level, 'stLevelOut', 'level']
    ].forEach(function (entry) {
        entry[0].addEventListener('input', function () {
            setOut(entry[1], entry[0].value);

            if (!selected) {
                return;
            }

            selected[entry[2]] = Number(entry[0].value);
            renderLayer(selected);
        });
    });

    invert.addEventListener('change', function () {
        if (!selected) {
            return;
        }

        selected.invert = invert.checked;
        renderLayer(selected);
    });

    mirror.addEventListener('change', function () {
        if (!selected) {
            return;
        }

        exitCrop();

        selected.mirror = mirror.checked;
        renderLayer(selected);
    });

    // Remove Background - on/off. Nananatili ang pagpili ng Original / Grayscale / Stencil / Line Art.
    bgChip.addEventListener('click', function () {
        if (!selected) {
            return;
        }

        selected.removeBg = !selected.removeBg;

        bgChip.classList.toggle('active', selected.removeBg);
        bgField.style.display = selected.removeBg ? '' : 'none';

        renderLayer(selected);
    });

    bgTol.addEventListener('input', function () {
        setOut('stBgTolOut', bgTol.value);

        if (!selected) {
            return;
        }

        selected.bgTol = Number(bgTol.value);
        renderLayer(selected);
    });

    document.getElementById('stRotate').addEventListener('click', function () {
        if (!selected) {
            return;
        }

        exitCrop();

        var l = selected;
        var p = paper();

        l.rotation = (l.rotation + 90) % 360;
        renderLayer(l);

        if (lock.checked) {
            l.h = round(l.w * l.ratio, 2);
        } else {
            var temp = l.w;

            l.w = l.h;
            l.h = temp;
        }

        l.x = clampPos(l.x, l.w, p.w);
        l.y = clampPos(l.y, l.h, p.h);

        widthInput.value = round(l.w, 2);
        heightInput.value = round(l.h, 2);

        layout(l);
        updateNote();
    });

    // ==================================================
    // SIZE / PAPER
    // ==================================================

    widthInput.addEventListener('input', function () {
        if (!selected) {
            return;
        }

        selected.w = Number(widthInput.value) || 0;

        if (lock.checked) {
            selected.h = round(selected.w * selected.ratio, 2);
            heightInput.value = selected.h;
        }

        layout(selected);
        updateNote();
    });

    heightInput.addEventListener('input', function () {
        if (!selected) {
            return;
        }

        selected.h = Number(heightInput.value) || 0;

        if (lock.checked && selected.ratio) {
            selected.w = round(selected.h / selected.ratio, 2);
            widthInput.value = selected.w;
        }

        layout(selected);
        updateNote();
    });

    lock.addEventListener('change', function () {
        if (!selected || !lock.checked) {
            return;
        }

        selected.h = round(selected.w * selected.ratio, 2);
        heightInput.value = selected.h;

        layout(selected);
        updateNote();
    });

    paperSelect.addEventListener('change', function () {
        layoutAll();
        updateUI();
    });

    // ==================================================
    // PRINT / DOWNLOAD
    // Pinagsasama ang lahat ng picture sa isang papel.
    // ==================================================

    function composePaper() {
        var p = paper();
        var out = document.createElement('canvas');

        out.width = Math.round(p.w * EXPORT_DPI);
        out.height = Math.round(p.h * EXPORT_DPI);

        var ctx = out.getContext('2d');

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, out.width, out.height);

        // multiply: ang puti ng isang picture ay hindi tatakpan ang nasa ilalim
        ctx.globalCompositeOperation = 'multiply';

        layers.forEach(function (l) {
            ctx.drawImage(
                l.canvas,
                l.x * EXPORT_DPI,
                l.y * EXPORT_DPI,
                l.w * EXPORT_DPI,
                l.h * EXPORT_DPI
            );
        });

        return out;
    }

    printBtn.addEventListener('click', function () {
        if (!layers.length) {
            return;
        }

        var p = paper();

        printImage.onload = function () {
            window.print();
        };

        // Buong papel, eksaktong laki sa inches - nasa tamang lugar na ang bawat picture
        printImage.style.width = p.w + 'in';
        printImage.style.height = p.h + 'in';
        printImage.style.display = 'block';
        printImage.style.margin = '0';
        printImage.style.maxWidth = 'none';
        printImage.src = composePaper().toDataURL('image/png');
    });

    downloadBtn.addEventListener('click', function () {
        if (!layers.length) {
            return;
        }

        composePaper().toBlob(function (blob) {
            var link = document.createElement('a');

            link.href = URL.createObjectURL(blob);
            link.download = 'stencil-' + paperSelect.value + '.png';
            link.click();

            setTimeout(function () {
                URL.revokeObjectURL(link.href);
            }, 1000);
        }, 'image/png');
    });

    // ==================================================
    // LIBRARY
    // ==================================================

    function getJson(url) {
        return fetch(url, { credentials: 'same-origin' })
            .then(function (response) {
                if (response.status === 401 || response.status === 403) {
                    window.location.href = '/login';
                    return null;
                }

                return response.json();
            })
            .catch(function () {
                return null;
            });
    }

    function loadLibrary() {
        if (libraryData) {
            renderLibrary();
            return;
        }

        libEmpty.style.display = 'block';
        libEmpty.textContent = 'Loading...';

        Promise.all([
            getJson('/api/photos'),
            getJson('/api/appointments/admin/all')
        ]).then(function (results) {
            var photos = (results[0] && results[0].photos) || [];
            var appointments = (results[1] && results[1].appointments) || [];

            libraryData = {
                designs: photos
                    .filter(function (p) { return p.category === 'design'; })
                    .map(function (p) { return { src: p.image, label: p.title }; }),

                gallery: photos
                    .filter(function (p) { return p.category !== 'design'; })
                    .map(function (p) { return { src: p.image, label: p.title }; }),

                references: appointments
                    .filter(function (a) { return a.reference; })
                    .map(function (a) {
                        return {
                            src: a.reference,
                            label: (a.clientName || 'Client') + ' - ' + (a.tattooType || '')
                        };
                    })
            };

            renderLibrary();
        });
    }

    function renderLibrary() {
        var items = (libraryData && libraryData[libraryTab]) || [];

        libGrid.innerHTML = '';

        libEmpty.style.display = items.length ? 'none' : 'block';
        libEmpty.textContent = 'Nothing here yet.';

        items.forEach(function (item) {
            var button = document.createElement('button');
            var img = document.createElement('img');
            var label = document.createElement('span');

            button.type = 'button';
            button.className = 'st-lib-item';

            img.src = item.src;
            img.alt = item.label;
            label.textContent = item.label;

            button.appendChild(img);
            button.appendChild(label);

            button.addEventListener('click', function () {
                closeLibrary();
                loadPicture(item.src, item.label);
            });

            libGrid.appendChild(button);
        });
    }

    function openLibrary() {
        library.style.display = 'flex';
        loadLibrary();
    }

    function closeLibrary() {
        library.style.display = 'none';
    }

    document.getElementById('stOpenLibrary').addEventListener('click', openLibrary);
    document.getElementById('stCloseLibrary').addEventListener('click', closeLibrary);

    library.addEventListener('click', function (event) {
        if (event.target === library) {
            closeLibrary();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeLibrary();
        }
    });

    document.querySelector('.st-tabs').addEventListener('click', function (event) {
        var tab = event.target.closest('[data-tab]');

        if (!tab) {
            return;
        }

        libraryTab = tab.getAttribute('data-tab');

        Array.prototype.forEach.call(this.querySelectorAll('.st-tab'), function (el) {
            el.classList.toggle('active', el === tab);
        });

        renderLibrary();
    });

    // ==================================================
    // INIT
    // ==================================================

    layoutAll();
    updateUI();

    // Galing sa modal ng appointment: /fxprint?embed=1&image=/uploads/xxx.png
    var startImage = new URLSearchParams(window.location.search).get('image');

    if (startImage && startImage.charAt(0) === '/' && startImage.charAt(1) !== '/') {
        loadPicture(startImage, startImage.split('/').pop());
    }
});