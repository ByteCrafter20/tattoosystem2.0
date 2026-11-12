// public/js/modal-ui.js
// Connects the new booking modal (reference image, style cards, calendar, time chips, summary)
// to the real form fields that clientdashboard.js already uses:
//   #tattooType, #date, #time, #tattooSize, #placement, #placementSide, #artist
// Load it AFTER clientdashboard.js.
//
// Needs in the HTML: <input type="file" id="reference"> placed BEFORE #styleGrid,
// and <small id="imageHint"></small> under it.
// The uploaded file name picks the Tattoo Placement (fullsleeve.jpg -> Full Sleeve).
//
// SAVING: this file saves the booking by itself (see saveBooking below). No receipt popup.
// Route: POST /api/appointments (server.js)

document.addEventListener('DOMContentLoaded', function () {

    var PH_TIMEZONE = 'Asia/Manila';
    var OPEN_MIN = 8 * 60;
    var CLOSE_MIN = 17 * 60;
    var STEP = 30;

    // ====== SAVE SETTINGS (tugma sa server.js mo) ======
    // POST /api/appointments  -> bookingRouter (multer: single("reference"))
    var SAVE_URL = '/api/appointments';
    var SAVE_METHOD = 'POST';
    // 'formdata' = may kasamang image (tama ito, may multer ang server)
    var SAVE_AS = 'formdata';
    // ========================================================

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
    var saving = false;
    var justSaved = false;
    var lastSaved = null;
    var WAIT_FLAG = 'totsShowWaiting';
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
                setHint('example. fullsleeve.jpg, fullback.jpg, fullsleeveright.jpg: ' + validPlacementNames().join(', '), true);
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

    // ---------- SAVING ----------

    // key = pangalan ng field na hinihintay ng server.js
    // Kinukuha sa id ng input; kung wala, sa name="" ng input.
    var SERVER_FIELDS = [
        'clientName', 'artist', 'date', 'time', 'tattooType', 'description',
        'tattooSize', 'customWidth', 'customHeight',
        'placement', 'placementOther', 'placementSide',
        'paymentMethod', 'paymentAmount', 'referenceUrl'
    ];

    // Mga posibleng ibang id/name ng input para sa required na fields ng server
    var FIELD_ALIASES = {
        clientName: ['name', 'fullName', 'fullname', 'client', 'clientname']
    };

    function buildPayload() {
        var fd = new FormData(form);

        SERVER_FIELDS.forEach(function (key) {
            var ids = [key].concat(FIELD_ALIASES[key] || []);
            var el = null;
            for (var i = 0; i < ids.length; i++) {
                var cand = document.getElementById(ids[i]) || form.elements[ids[i]];
                if (cand && cand.type !== 'file') {
                    el = cand;
                    if (cand.value) { break; }
                }
            }
            if (!el) { return; }
            var val = el.value;                       // RadioNodeList also works
            if (val === undefined || val === null) { return; }
            if (!fd.has(key) || fd.get(key) === '') { fd.set(key, val); }
        });

        // The server only accepts the image under the name "reference"
        if (imageInput) {
            if (imageInput.name && imageInput.name !== 'reference') { fd.delete(imageInput.name); }
            fd.delete('reference');
            if (imageInput.files && imageInput.files[0]) {
                fd.set('reference', imageInput.files[0]);
            }
        }

        if (SAVE_AS === 'json') {
            var obj = {};
            fd.forEach(function (v, k) {
                if (v instanceof File) { return; }
                obj[k] = v;
            });
            return { body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } };
        }

        return { body: fd, headers: {} };   // browser sets the multipart header
    }

    function setSaving(on) {
        saving = on;
        var btn = form.querySelector('[type="submit"]');
        if (btn) {
            btn.disabled = on;
            if (on) { btn.setAttribute('data-old', btn.textContent); btn.textContent = 'Saving...'; }
            else if (btn.hasAttribute('data-old')) {
                btn.textContent = btn.getAttribute('data-old');
                btn.removeAttribute('data-old');
            }
        }
    }

    function saveBooking() {
        if (saving) { return; }
        setSaving(true);

        var url = SAVE_URL;
        var payload = buildPayload();

        fetch(url, {
            method: SAVE_METHOD,
            headers: payload.headers,
            body: payload.body,
            credentials: 'same-origin'
        })
        .then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }

                if (!res.ok) {
                    var msg = (data && (data.message || data.error)) ||
                        text.replace(/<[^>]*>/g, ' ').trim().slice(0, 200) || res.statusText;
                    var failure = new Error('Hindi na-save (' + res.status + '): ' + msg);
                    failure.status = res.status;
                    failure.data = data;
                    throw failure;
                }
                return data;
            });
        })
        .then(function (data) {
            setSaving(false);
            justSaved = true;
            lastSaved = data && data.appointment ? data.appointment : null;
            form.reset();   // reset handler below closes the form and shows the waiting modal

            // Refresh the appointment list; if no loader function exists, reload the page
            // (the waiting modal is shown again after the reload)
            var refreshed = ['loadAppointments', 'fetchAppointments', 'renderAppointments'].some(function (fn) {
                if (typeof window[fn] === 'function') { window[fn](); return true; }
                return false;
            });

            if (!refreshed) {
                lastSaved = null;
                try { sessionStorage.setItem(WAIT_FLAG, '1'); } catch (err) { /* ignore */ }
                setTimeout(function () { window.location.reload(); }, 150);
            }
        })
        .catch(function (err) {
            setSaving(false);

            // May naghihintay nang appointment (hal. na-book mula sa ibang tab)
            if (err && err.status === 409 && err.data && err.data.code === 'PENDING_EXISTS') {
                if (typeof window.closeAppointmentModal === 'function') { window.closeAppointmentModal(); }
                showWaiting(err.data.appointment);
                return;
            }

            console.error('Save failed:', err);
            alert(err.message && err.message.indexOf('Hindi na-save') === 0
                ? err.message
                : 'Hindi na-save. Hindi maabot ang server: ' + err.message);
        });
    }

    // ---------- VALIDATION + SAVE (runs before clientdashboard.js's submit handler) ----------

    form.addEventListener('submit', function (e) {
        // We handle saving here, so stop any other submit handler / normal page submit.
        e.preventDefault();
        e.stopImmediatePropagation();

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
            alert(problem);
            return;
        }

        saveBooking();
    }, true);

    // After form.reset() (successful booking) rebuild the visual widgets
    form.addEventListener('reset', function () {
        var saved = justSaved;
        justSaved = false;

        setTimeout(function () {
            var n = phNow();
            viewYear = n.year;
            viewMonth = n.month;
            hasImage = false;
            setHint('', false);
            renderCalendar();
            renderTimes();
            sync();

            if (saved && typeof window.closeAppointmentModal === 'function') {
                window.closeAppointmentModal();
            }

            if (saved && lastSaved) { showWaiting(lastSaved); }
            lastSaved = null;
        }, 0);
    });

    // ---------- WAITING MODAL ----------
    // Kapag may appointment nang naghihintay ng aksyon (Confirm / Reschedule / Cancel)
    // ng admin o tattoo artist, ito na lang ang makikita ng client. Walang input,
    // walang pwedeng gawin - maghihintay lang.

    var WAIT_POLL_MS = 15000;
    var waitTimer = null;

    var waitCss = document.createElement('style');
    waitCss.textContent =
        '#waitModal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px}' +
        '#waitModal.open{display:flex}' +
        '#waitModal .wait-box{background:#16161b;color:#f2f2f2;border:1px solid rgba(255,255,255,.12);border-radius:14px;max-width:400px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
        '#waitModal .wait-icon{font-size:44px;line-height:1}' +
        '#waitModal h3{margin:10px 0 8px;font-size:20px}' +
        '#waitModal .wait-text{margin:0 0 16px;color:#b9b9c2;font-size:14px;line-height:1.5}' +
        '#waitModal .wait-rows{border-top:1px dashed rgba(255,255,255,.2);padding-top:10px;text-align:left;font-size:13px}' +
        '#waitModal .wait-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}' +
        '#waitModal .wait-row span{color:#8e8e99}' +
        '#waitModal .wait-ok{margin-top:18px;width:100%;padding:10px;border:0;border-radius:8px;background:#c0392b;color:#fff;font-size:14px;cursor:pointer}';
    document.head.appendChild(waitCss);

    var waitModal = document.createElement('div');
    waitModal.id = 'waitModal';
    waitModal.setAttribute('role', 'dialog');
    waitModal.setAttribute('aria-modal', 'true');
    document.body.appendChild(waitModal);

    function node(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined) { n.textContent = text; }
        return n;
    }

    function stopWaitPolling() {
        if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
    }

    function closeWait() {
        var reload = waitModal.getAttribute('data-reload') === '1';
        waitModal.classList.remove('open');
        waitModal.removeAttribute('data-reload');
        stopWaitPolling();
        if (reload) { window.location.reload(); }   // status changed -> refresh the table
    }

    waitModal.addEventListener('click', function (e) {
        if (e.target === waitModal || e.target.classList.contains('wait-ok')) { closeWait(); }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && waitModal.classList.contains('open')) { closeWait(); }
    });

    function fmtServerDate(v) {
        var d = new Date(v);
        if (isNaN(d.getTime())) { return ''; }
        return d.toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
        });
    }

    function fmtServerTime(t) {
        return /^\d{1,2}:\d{2}$/.test(String(t || '')) ? label12(pad(t.split(':')[0]) + ':' + t.split(':')[1]) : (t || '');
    }

    // Asks the server if this client still has a request waiting for an answer.
    function fetchPending() {
        return fetch('/api/appointments/pending', { credentials: 'same-origin' })
            .then(function (res) {
                return res.json().then(function (d) {
                    if (!res.ok || !d || !d.success) { throw new Error('pending check failed'); }
                    return d;
                });
            });
    }

    function startWaitPolling() {
        stopWaitPolling();
        waitTimer = setInterval(function () {
            if (!waitModal.classList.contains('open')) { stopWaitPolling(); return; }

            fetchPending().then(function (d) {
                if (!d.pending) {
                    stopWaitPolling();
                    showWaitUpdate(d.latest);
                }
            }).catch(function () { /* try again next round */ });
        }, WAIT_POLL_MS);
    }

    function openWaitBox(box, reloadOnClose) {
        waitModal.innerHTML = '';
        waitModal.appendChild(box);
        if (reloadOnClose) { waitModal.setAttribute('data-reload', '1'); }
        else { waitModal.removeAttribute('data-reload'); }
        waitModal.classList.add('open');
    }

    function showWaiting(appt) {
        var a = appt || {};
        var box = node('div', 'wait-box');

        box.appendChild(node('div', 'wait-icon', '\u23F3'));
        box.appendChild(node('h3', '', 'Waiting for Confirmation'));
        box.appendChild(node('p', 'wait-text',
            'Your appointment request was sent. Please wait for the admin or tattoo artist ' +
            'to confirm, reschedule, or cancel it. You can book again after they respond.'));

        var rows = node('div', 'wait-rows');
        [
            ['Artist', a.artist],
            ['Style', a.tattooType],
            ['Date', a.date ? fmtServerDate(a.date) : ''],
            ['Time', fmtServerTime(a.time)],
            ['Status', a.status || 'Pending']
        ].forEach(function (r) {
            if (!r[1]) { return; }
            var row = node('div', 'wait-row');
            row.appendChild(node('span', '', r[0]));
            row.appendChild(node('b', '', r[1]));
            rows.appendChild(row);
        });
        box.appendChild(rows);
        box.appendChild(node('button', 'wait-ok', 'OK'));

        openWaitBox(box, false);
        startWaitPolling();
    }

    // Shown (while the waiting modal is open) when the admin / tattoo artist responds.
    function showWaitUpdate(latest) {
        var status = latest && latest.status ? latest.status : 'updated';
        var box = node('div', 'wait-box');

        box.appendChild(node('div', 'wait-icon', '\uD83D\uDD14'));
        box.appendChild(node('h3', '', 'Your request was updated'));
        box.appendChild(node('p', 'wait-text',
            'Status: ' + status + '. Please check My Appointments for the details.'));
        box.appendChild(node('button', 'wait-ok', 'OK'));

        openWaitBox(box, true);
    }

    // ---------- OPEN THE BOOKING FORM (or the waiting modal) ----------

    var openOriginal = window.openAppointmentModal;

    function openBookingForm(self, args) {
        var r;

        if (typeof openOriginal === 'function') {
            r = openOriginal.apply(self, args);
        } else {
            var m = document.getElementById('appointmentModal');
            if (m) { m.style.display = 'flex'; }
        }

        // so "today" and passed times are fresh
        var n = phNow();
        viewYear = n.year;
        viewMonth = n.month;
        renderCalendar();
        renderTimes();
        sync();
        return r;
    }

    window.openAppointmentModal = function () {
        var self = this;
        var args = arguments;

        fetchPending().then(function (d) {
            if (d.pending) { showWaiting(d.pending); }
            else { openBookingForm(self, args); }
        }).catch(function () {
            // Could not check: open the form; the server still blocks a second request.
            openBookingForm(self, args);
        });
    };

    // ---------- INIT ----------

    buildStyleCards();
    renderCalendar();
    renderTimes();
    sync();

    // After the page reloaded following a new booking, show the waiting modal again
    try {
        if (sessionStorage.getItem(WAIT_FLAG) === '1') {
            sessionStorage.removeItem(WAIT_FLAG);
            fetchPending().then(function (d) {
                if (d.pending) { showWaiting(d.pending); }
            }).catch(function () { /* ignore */ });
        }
    } catch (err) { /* ignore */ }
});