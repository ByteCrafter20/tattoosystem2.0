// public/js/modal-ui.js
// Connects the new booking modal (reference image, style cards, calendar, time chips, summary)
// to the real form fields that clientdashboard.js already uses:
//   #tattooType, #date, #time, #tattooSize, #placement, #placementSide, #artist
// Load it AFTER clientdashboard.js.
//
// Needs in the HTML: <input type="file" id="reference"> placed BEFORE #styleGrid,
// and <small id="imageHint"></small> under it.
// The uploaded file name picks the Tattoo Placement (fullsleeve.jpg -> Full Sleeve).

document.addEventListener('DOMContentLoaded', function () {

    var PH_TIMEZONE = 'Asia/Manila';
    var OPEN_MIN = 8 * 60;
    var CLOSE_MIN = 17 * 60;
    var STEP = 30;

    var form = document.getElementById('appointmentForm');
    if (!form) { return; }

    var styleGrid = document.getElementById('styleGrid');
    var calGrid = document.getElementById('calGrid');
    var calLabel = document.getElementById('calLabel');
    var calPrev = document.getElementById('calPrev');
    var calNext = document.getElementById('calNext');
    var timeGrid = document.getElementById('timeGrid');

    var typeSelect = document.getElementById('tattooType');
    var dateInput = document.getElementById('date');
    var timeInput = document.getElementById('time');
    var artistSelect = document.getElementById('artist');
    var sizeSelect = document.getElementById('tattooSize');
    var placementSelect = document.getElementById('placement');
    var sideSelect = document.getElementById('placementSide');
    var placementOther = document.getElementById('placementOther');

    var imageInput = document.getElementById('reference');
    var imageHint = document.getElementById('imageHint');

    var hasImage = false;
    var LOCK_MSG = 'Mag-insert muna ng reference image (hal. fullsleeve.jpg) bago pumili ng style.';

    // ---------- helpers ----------

    function pad(n) { return String(n).padStart(2, '0'); }

    function phNow() {
        var parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: PH_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date());

        function get(t) {
            return parts.find(function (p) { return p.type === t; }).value;
        }

        var h = get('hour') === '24' ? '00' : get('hour');

        return {
            year: Number(get('year')),
            month: Number(get('month')) - 1,
            date: get('year') + '-' + get('month') + '-' + get('day'),
            time: h + ':' + get('minute')
        };
    }

    function label12(value) {
        var p = value.split(':');
        var h = Number(p[0]);
        var s = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + p[1] + ' ' + s;
    }

    function prettyDate(value) {
        if (!value) { return '-'; }
        var p = value.split('-');
        return new Date(p[0], Number(p[1]) - 1, p[2]).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    function fire(el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Minimal styles (low specificity so your Modal.css can override them)
    var css = document.createElement('style');
    css.textContent =
        ':where(.style-grid){display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}' +
        ':where(.style-card){padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-size:13px}' +
        ':where(.style-card.selected){border-color:#c0392b;background:#fdeceb;font-weight:600}' +
        ':where(.style-card.locked){opacity:.45;cursor:not-allowed}' +
        ':where(.cal-grid){display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:12px}' +
        ':where(.cal-head){text-align:center;font-size:11px;color:#777}' +
        ':where(.cal-day){padding:6px 0;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer}' +
        ':where(.cal-day.selected){background:#c0392b;color:#fff;border-color:#c0392b}' +
        ':where(.cal-day:disabled){opacity:.35;cursor:not-allowed}' +
        ':where(.time-grid){display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}' +
        ':where(.time-chip){padding:6px 0;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:12px}' +
        ':where(.time-chip.selected){background:#c0392b;color:#fff;border-color:#c0392b}' +
        ':where(.time-chip:disabled){opacity:.35;cursor:not-allowed}' +
        '.native-proxy{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}';
    document.head.appendChild(css);

    // The real fields are hidden behind the cards/calendar/chips, so the browser
    // cannot focus them for its own "required" popup. We validate in JS instead.
    [typeSelect, dateInput, timeInput].forEach(function (el) {
        if (el) { el.required = false; }
    });

    // ---------- REFERENCE IMAGE (required before choosing a style) ----------

    // "Full Sleeve — ₱5,000"  ->  "fullsleeve"
    function norm(s) {
        return String(s || '').toLowerCase()
            .replace(/\s+\u2014.*$/, '')
            .replace(/[^a-z0-9]/g, '');
    }

    function optionLabel(o) {
        return o.textContent.replace(/\s+\u2014.*$/, '').trim();
    }

    // "Other" is skipped: it needs a typed description, so it has no file name.
    function validPlacementNames() {
        var names = [];
        if (!placementSelect) { return names; }
        for (var i = 0; i < placementSelect.options.length; i++) {
            var o = placementSelect.options[i];
            if (o.value && o.value !== 'Other') { names.push(norm(o.value) + '.jpg'); }
        }
        return names;
    }

    // The placement name only has to be INSIDE the file name, so
    // "fullsleeverightarm.jpg" -> Full Sleeve. The longest match wins.
    function findPlacementOption(fileName) {
        var base = norm(fileName.replace(/\.[^.]+$/, ''));
        if (!base || !placementSelect) { return null; }
        var best = null;
        var bestLen = 0;
        for (var i = 0; i < placementSelect.options.length; i++) {
            var o = placementSelect.options[i];
            if (!o.value || o.value === 'Other') { continue; }
            var key = norm(o.value);
            if (base.indexOf(key) !== -1 && key.length > bestLen) {
                best = o;
                bestLen = key.length;
            }
        }
        return best;
    }

    // "left" / "right" / "center" in the file name also fills the Side field.
    function findSide(fileName) {
        var base = norm(fileName.replace(/\.[^.]+$/, ''));
        if (base.indexOf('left') !== -1) { return 'Left'; }
        if (base.indexOf('right') !== -1) { return 'Right'; }
        if (base.indexOf('center') !== -1 || base.indexOf('centre') !== -1) { return 'Center'; }
        return '';
    }

    function setHint(text, isError) {
        if (!imageHint) { return; }
        imageHint.textContent = text;
        imageHint.style.color = isError ? '#c0392b' : '#2e7d32';
    }

    if (imageInput) {
        imageInput.addEventListener('change', function () {
            var file = imageInput.files && imageInput.files[0];

            if (!file) {
                hasImage = false;
                setHint('', false);
                syncStyleCards();
                return;
            }

            var match = findPlacementOption(file.name);

            if (!match) {
                imageInput.value = '';      // reject the file
                hasImage = false;
                setHint('Walang placement sa pangalan ng file. Isama ang isa sa mga ito (puwede ring may left/right), hal. fullsleeveright.jpg: ' + validPlacementNames().join(', '), true);
                syncStyleCards();
                return;
            }

            hasImage = true;
            placementSelect.value = match.value; // auto-select placement from file name
            fire(placementSelect);

            var side = findSide(file.name);
            if (side && sideSelect) {
                sideSelect.value = side;
                fire(sideSelect);
            }

            setHint('Placement: ' + optionLabel(match) + (side ? ' (' + side + ')' : ''), false);
            sync();
        });
    }

    // ---------- STYLE CARDS ----------

    function buildStyleCards() {
        if (!styleGrid || !typeSelect) { return; }

        var html = '';

        for (var i = 0; i < typeSelect.options.length; i++) {
            var o = typeSelect.options[i];
            if (!o.value) { continue; }
            html += '<button type="button" class="style-card" data-value="' +
                o.value.replace(/"/g, '&quot;') + '">' + o.textContent + '</button>';
        }

        styleGrid.innerHTML = html;

        styleGrid.addEventListener('click', function (e) {
            var card = e.target.closest('.style-card');
            if (!card) { return; }

            if (!hasImage) {                // locked until image is inserted
                setHint(LOCK_MSG, true);
                return;
            }

            typeSelect.value = card.getAttribute('data-value');
            fire(typeSelect); // clientdashboard.js applies Minimalist fixed size + price
            sync();
        });
    }

    function syncStyleCards() {
        if (!styleGrid || !typeSelect) { return; }
        var cards = styleGrid.querySelectorAll('.style-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('selected',
                cards[i].getAttribute('data-value') === typeSelect.value);
            cards[i].classList.toggle('locked', !hasImage);
            cards[i].setAttribute('aria-disabled', String(!hasImage));
            // hover message
            if (!hasImage) { cards[i].title = LOCK_MSG; }
            else { cards[i].removeAttribute('title'); }
        }
    }

    // ---------- CALENDAR ----------

    var now = phNow();
    var viewYear = now.year;
    var viewMonth = now.month;

    function renderCalendar() {
        if (!calGrid) { return; }

        var today = phNow().date;
        var first = new Date(viewYear, viewMonth, 1);
        var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        if (calLabel) {
            calLabel.textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        var html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(function (d) {
            return '<div class="cal-head">' + d + '</div>';
        }).join('');

        for (var b = 0; b < first.getDay(); b++) { html += '<div></div>'; }

        for (var d = 1; d <= daysInMonth; d++) {
            var value = viewYear + '-' + pad(viewMonth + 1) + '-' + pad(d);
            var past = value < today;
            var selected = dateInput && dateInput.value === value;

            html += '<button type="button" class="cal-day' + (selected ? ' selected' : '') +
                '" data-date="' + value + '"' + (past ? ' disabled' : '') + '>' + d + '</button>';
        }

        calGrid.innerHTML = html;

        // Do not allow browsing to months that are entirely in the past
        if (calPrev) {
            var cur = phNow();
            calPrev.disabled = viewYear < cur.year ||
                (viewYear === cur.year && viewMonth <= cur.month);
        }
    }

    if (calGrid) {
        calGrid.addEventListener('click', function (e) {
            var btn = e.target.closest('.cal-day');
            if (!btn || btn.disabled || !dateInput) { return; }
            dateInput.value = btn.getAttribute('data-date');
            fire(dateInput);
            renderCalendar();
            renderTimes();
            updateSummary();
        });
    }

    if (calPrev) {
        calPrev.addEventListener('click', function () {
            viewMonth--;
            if (viewMonth < 0) { viewMonth = 11; viewYear--; }
            renderCalendar();
        });
    }

    if (calNext) {
        calNext.addEventListener('click', function () {
            viewMonth++;
            if (viewMonth > 11) { viewMonth = 0; viewYear++; }
            renderCalendar();
        });
    }

    // ---------- TIME CHIPS (8:00 AM - 5:00 PM, Philippine Time) ----------

    function renderTimes() {
        if (!timeGrid || !timeInput) { return; }

        var n = phNow();
        var isToday = dateInput && dateInput.value === n.date;
        var html = '';

        for (var m = OPEN_MIN; m <= CLOSE_MIN; m += STEP) {
            var value = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
            var passed = isToday && value <= n.time;
            var selected = timeInput.value === value;

            html += '<button type="button" class="time-chip' + (selected ? ' selected' : '') +
                '" data-time="' + value + '"' + (passed ? ' disabled' : '') + '>' +
                label12(value) + '</button>';
        }

        timeGrid.innerHTML = html;
    }

    if (timeGrid) {
        timeGrid.addEventListener('click', function (e) {
            var btn = e.target.closest('.time-chip');
            if (!btn || btn.disabled || !timeInput) { return; }
            timeInput.value = btn.getAttribute('data-time');
            fire(timeInput);
            renderTimes();
            updateSummary();
        });
    }

    // ---------- BOOKING SUMMARY ----------

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) { el.textContent = text || '-'; }
    }

    function selectedText(select) {
        if (!select || !select.value) { return ''; }
        var o = select.options[select.selectedIndex];
        return o ? optionLabel(o) : select.value;
    }

    function updateSummary() {
        setText('sumArtist', artistSelect ? artistSelect.value : '');
        setText('sumStyle', selectedText(typeSelect));
        setText('sumDate', dateInput && dateInput.value ? prettyDate(dateInput.value) : '');
        setText('sumTime', timeInput && timeInput.value ? label12(timeInput.value) : '');
        setText('sumSize', selectedText(sizeSelect));

        var place = '';
        if (placementSelect && placementSelect.value) {
            place = placementSelect.value === 'Other'
                ? (placementOther && placementOther.value.trim() ? placementOther.value.trim() : 'Other')
                : placementSelect.value;
            if (sideSelect && sideSelect.value) { place = sideSelect.value + ' ' + place; }
        }
        setText('sumPlacement', place);
    }

    function sync() {
        syncStyleCards();
        updateSummary();
    }

    [artistSelect, sizeSelect, placementSelect, sideSelect, typeSelect].forEach(function (el) {
        if (el) { el.addEventListener('change', sync); }
    });

    if (placementOther) { placementOther.addEventListener('input', updateSummary); }

    // clientdashboard.js changes some fields from code (design picked from the
    // gallery, Minimalist locking the size), which does not fire events.
    setInterval(sync, 500);

    // ---------- VALIDATION (runs before clientdashboard.js's submit handler) ----------

    form.addEventListener('submit', function (e) {
        var problem = '';

        if (!hasImage) {
            problem = 'Please insert a reference image (e.g. fullsleeve.jpg).';
        } else if (!typeSelect || !typeSelect.value) {
            problem = 'Please choose a tattoo style.';
        } else if (!dateInput || !dateInput.value) {
            problem = 'Please select a date on the calendar.';
        } else if (!timeInput || !timeInput.value) {
            problem = 'Please select a time.';
        }

        if (problem) {
            e.preventDefault();
            e.stopImmediatePropagation();
            alert(problem);
        } else {
            // Validation passed: remember what is being booked, because the form
            // is cleared after saving and the receipt still needs these details.
            pendingBooking = takeSnapshot();
            pendingAt = Date.now();
        }
    }, true);

    // After form.reset() (successful booking) rebuild the visual widgets
    form.addEventListener('reset', function () {
        // A reset right after a validated submit means the booking was saved.
        // (30 second window so a later Cancel/reset never shows a receipt.)
        var booking = (pendingBooking && Date.now() - pendingAt < 30000) ? pendingBooking : null;
        pendingBooking = null;

        setTimeout(function () {
            var n = phNow();
            viewYear = n.year;
            viewMonth = n.month;
            hasImage = false;
            setHint('', false);
            renderCalendar();
            renderTimes();
            sync();

            if (booking) {
                if (typeof window.closeAppointmentModal === 'function') {
                    window.closeAppointmentModal();
                }
                window.showBookingReceipt(null, booking);
            }
        }, 0);
    });

    // Re-render when the modal is opened (so "today" and passed times are fresh)
    var openOriginal = window.openAppointmentModal;

    if (typeof openOriginal === 'function') {
        window.openAppointmentModal = function () {
            var r = openOriginal.apply(this, arguments);
            var n = phNow();
            viewYear = n.year;
            viewMonth = n.month;
            renderCalendar();
            renderTimes();
            sync();
            return r;
        };
    }

    // ---------- BOOKING RECEIPT ("Book Appointment Complete") ----------
    // Receipt numbers: TOTS0001, TOTS0002 ... TOTS0030, then back to TOTS0001.

    var RECEIPT_PREFIX = 'TOTS';
    var RECEIPT_MAX = 30;
    var RECEIPT_KEY = 'totsReceiptCounter';

    var pendingBooking = null;
    var pendingAt = 0;

    // NOTE: this counter lives in this browser's localStorage. For one shared
    // counter across all clients, generate the number on the server and pass it
    // in:  window.showBookingReceipt('TOTS0007', details)
    function nextReceiptNo() {
        var last = 0;
        try { last = Number(localStorage.getItem(RECEIPT_KEY)) || 0; } catch (err) { last = 0; }
        var next = (last % RECEIPT_MAX) + 1;
        try { localStorage.setItem(RECEIPT_KEY, String(next)); } catch (err) { /* ignore */ }
        return RECEIPT_PREFIX + String(next).padStart(4, '0');
    }

    function readText(id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    function takeSnapshot() {
        return {
            artist: readText('sumArtist'),
            style: readText('sumStyle'),
            date: readText('sumDate'),
            time: readText('sumTime'),
            size: readText('sumSize'),
            placement: readText('sumPlacement'),
            amount: readText('amountDisplay'),
            balance: readText('balanceDisplay')
        };
    }

    var receiptCss = document.createElement('style');
    receiptCss.textContent =
        '#receiptModal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px}' +
        '#receiptModal.open{display:flex}' +
        '#receiptModal .receipt-box{background:#fff;color:#222;border-radius:12px;max-width:380px;width:100%;padding:24px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}' +
        '#receiptModal .receipt-check{font-size:42px;color:#2e7d32;line-height:1}' +
        '#receiptModal h3{margin:8px 0 2px;font-size:20px}' +
        '#receiptModal .receipt-sub{margin:0 0 14px;color:#666;font-size:14px}' +
        '#receiptModal .receipt-label{font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.08em}' +
        '#receiptModal .receipt-no{font-size:28px;font-weight:700;letter-spacing:.06em;color:#c0392b;margin:2px 0 14px}' +
        '#receiptModal .receipt-rows{border-top:1px dashed #bbb;padding-top:10px;text-align:left;font-size:13px}' +
        '#receiptModal .receipt-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}' +
        '#receiptModal .receipt-row span{color:#777}' +
        '#receiptModal .receipt-ok{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:#c0392b;color:#fff;font-size:14px;cursor:pointer}';
    document.head.appendChild(receiptCss);

    var receiptModal = document.createElement('div');
    receiptModal.id = 'receiptModal';
    receiptModal.setAttribute('role', 'dialog');
    receiptModal.setAttribute('aria-modal', 'true');
    document.body.appendChild(receiptModal);

    function closeReceipt() { receiptModal.classList.remove('open'); }

    receiptModal.addEventListener('click', function (e) {
        if (e.target === receiptModal || e.target.classList.contains('receipt-ok')) { closeReceipt(); }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeReceipt(); }
    });

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) { node.className = cls; }
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    // receiptNo: pass a server-made number, or null to use the local counter.
    window.showBookingReceipt = function (receiptNo, booking) {
        var no = receiptNo || nextReceiptNo();
        var b = booking || {};

        var box = el('div', 'receipt-box');
        box.appendChild(el('div', 'receipt-check', '\u2714'));
        box.appendChild(el('h3', '', 'Book Appointment Complete'));
        box.appendChild(el('p', 'receipt-sub', 'Saved'));
        box.appendChild(el('div', 'receipt-label', 'Receipt No.'));
        box.appendChild(el('div', 'receipt-no', no));

        var rows = el('div', 'receipt-rows');
        [
            ['Artist', b.artist], ['Style', b.style], ['Date', b.date], ['Time', b.time],
            ['Size', b.size], ['Placement', b.placement],
            ['Amount', b.amount], ['Balance', b.balance]
        ].forEach(function (r) {
            if (!r[1] || r[1] === '-') { return; }
            var row = el('div', 'receipt-row');
            row.appendChild(el('span', '', r[0]));
            row.appendChild(el('b', '', r[1]));
            rows.appendChild(row);
        });
        box.appendChild(rows);
        box.appendChild(el('button', 'receipt-ok', 'OK'));

        receiptModal.innerHTML = '';
        receiptModal.appendChild(box);
        receiptModal.classList.add('open');

        return no;
    };

    // ---------- INIT ----------

    buildStyleCards();
    renderCalendar();
    renderTimes();
    sync();
});