// public/js/clientdashboard.js

document.addEventListener('DOMContentLoaded', function () {

    var REFRESH_MS = 15000;

    var ARTISTS = ['Totats'];

    // Presyo ayon sa laki ng tattoo
    var SIZE_PRICES = {
        Small: 1000,
        Medium: 1500,
        Large: 10000
    };

    // Sukat (inches) na ipinapakita sa tabi ng size
    var SIZE_DIMENSIONS = {
        Small: '1 x 1 to 1 x 9 in'
    };

    // Presyo ayon sa uri ng tattoo (mas mananaig kaysa sa size)
    var TYPE_PRICES = {
        Minimalist: 700
    };

    var TYPE_DIMENSIONS = {
        Minimalist: '1 x 1 to 1 x 9 in'
    };

    // Pinakamaliit: 1 x 1 hanggang 1 x 9 inches = 700
    var SMALLEST_PRICE = 700;
    var SMALLEST_SHORT_SIDE = 1;
    var SMALLEST_MIN_LONG_SIDE = 2;
    var SMALLEST_MAX_LONG_SIDE = 9;

    function isSmallestSize(width, height) {
        var w = Number(width);
        var h = Number(height);

        if (!w || !h) {
            return false;
        }

        var shortSide = Math.min(w, h);
        var longSide = Math.max(w, h);

        return shortSide === SMALLEST_SHORT_SIDE &&
            longSide >= SMALLEST_MIN_LONG_SIDE &&
            longSide <= SMALLEST_MAX_LONG_SIDE;
    }

    // Custom: bawat square inch
    var CUSTOM_RATE_PER_SQ_INCH = 150;
    var CUSTOM_MINIMUM = 1000;

    // Oras ng appointment: 8:00 AM hanggang 5:00 PM (Philippine Time)
    var PH_TIMEZONE = 'Asia/Manila';
    var OPEN_TIME = '08:00';
    var CLOSE_TIME = '17:00';
    var PHONE_LENGTH = 11;

    var tableBody = document.getElementById('appointmentsBody');
    var form = document.getElementById('appointmentForm');
    var artistSelect = document.getElementById('artist');
    var dateInput = document.getElementById('date');
    var tattooTypeSelect = document.getElementById('tattooType');

    var sizeSelect = document.getElementById('tattooSize');
    var customSizeRow = document.getElementById('customSizeRow');
    var widthInput = document.getElementById('customWidth');
    var heightInput = document.getElementById('customHeight');
    var amountInput = document.getElementById('amount');
    var amountDisplay = document.getElementById('amountDisplay');
    var amountNote = document.getElementById('amountNote');
    var placementSelect = document.getElementById('placement');
    var placementOtherGroup = document.getElementById('placementOtherGroup');
    var placementOtherInput = document.getElementById('placementOther');

    var paymentMethodSelect = document.getElementById('paymentMethod');
    var paymentAmountInput = document.getElementById('paymentAmount');
    var balanceInput = document.getElementById('balance');
    var balanceDisplay = document.getElementById('balanceDisplay');
    var paymentNote = document.getElementById('paymentNote');

    // Hinahanap ang time at phone fields kahit ano ang id
    var timeInput =
        document.getElementById('time') ||
        (form ? form.querySelector('[name="time"]') : null);

    var phoneInput =
        document.getElementById('contact') ||
        document.getElementById('phone') ||
        (form
            ? form.querySelector(
                '[name="contact"], [name="phone"], [name="cellphone"], ' +
                '[name="mobile"], [name="contactNumber"], input[type="tel"]'
              )
            : null);

    // Hinahanap ang file input kahit ano ang id
    var fileInput =
        document.getElementById('reference') ||
        (form ? form.querySelector('input[type="file"]') : null);

    // ==================================================
    // HELPERS
    // ==================================================

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toInputDate(value) {
        var parsed = new Date(value);

        if (isNaN(parsed.getTime())) {
            return '';
        }

        var month = String(parsed.getMonth() + 1).padStart(2, '0');
        var day = String(parsed.getDate()).padStart(2, '0');

        return parsed.getFullYear() + '-' + month + '-' + day;
    }

    function formatDate(value) {
        var parsed = new Date(value);

        return isNaN(parsed.getTime())
            ? 'N/A'
            : parsed.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
    }

    function formatPeso(value) {
        return '\u20B1' + Number(value || 0).toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // "13:30" -> "1:30 PM"
    function formatTimeLabel(value) {
        if (!value) {
            return '';
        }

        var parts = value.split(':');
        var hour = Number(parts[0]);
        var suffix = hour >= 12 ? 'PM' : 'AM';

        hour = hour % 12;

        if (hour === 0) {
            hour = 12;
        }

        return hour + ':' + parts[1] + ' ' + suffix;
    }

    function isWithinBusinessHours(time) {
        return Boolean(time) && time >= OPEN_TIME && time <= CLOSE_TIME;
    }

    // Kasalukuyang petsa at oras sa Pilipinas, kahit ano ang timezone ng device
    function getPhilippineNow() {
        var parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: PH_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(new Date());

        function get(type) {
            return parts.find(function (p) { return p.type === type; }).value;
        }

        var hour = get('hour') === '24' ? '00' : get('hour');

        return {
            date: get('year') + '-' + get('month') + '-' + get('day'),
            time: hour + ':' + get('minute')
        };
    }

    // Halimbawa: "Small (2 x 3 in)" o "Minimalist (1 x 2 in)"
    function describeSize(size, type) {
        if (type && Object.prototype.hasOwnProperty.call(TYPE_DIMENSIONS, type)) {
            return type + ' (' + TYPE_DIMENSIONS[type] + ')';
        }

        if (size && Object.prototype.hasOwnProperty.call(SIZE_DIMENSIONS, size)) {
            return size + ' (' + SIZE_DIMENSIONS[size] + ')';
        }

        return size || '';
    }

    function computeAmount(size, width, height, type) {

        // Minimalist: fixed na 700 (1 x 2 in)
        if (type && Object.prototype.hasOwnProperty.call(TYPE_PRICES, type)) {
            return {
                amount: TYPE_PRICES[type],
                note: describeSize(size, type) + ' - fixed rate of ' +
                    formatPeso(TYPE_PRICES[type]) + '.'
            };
        }

        if (Object.prototype.hasOwnProperty.call(SIZE_PRICES, size)) {
            return {
                amount: SIZE_PRICES[size],
                note: describeSize(size, '') + ' tattoo - fixed rate.'
            };
        }

        if (size === 'Custom') {
            var w = Number(width);
            var h = Number(height);

            if (!w || !h || w <= 0 || h <= 0) {
                return {
                    amount: 0,
                    note: 'Enter width and height in inches to compute the amount.'
                };
            }

            // 1 x 2 hanggang 1 x 9 = 700
            if (isSmallestSize(w, h)) {
                return {
                    amount: SMALLEST_PRICE,
                    note: w + ' in x ' + h + ' in - smallest size rate (1 x 2 to 1 x 9 in).'
                };
            }

            var squareInches = w * h;
            var raw = squareInches * CUSTOM_RATE_PER_SQ_INCH;
            var amount = Math.max(raw, CUSTOM_MINIMUM);

            var note = w + ' in x ' + h + ' in = ' + squareInches.toFixed(2) +
                ' sq in x ' + formatPeso(CUSTOM_RATE_PER_SQ_INCH) + '/sq in';

            if (amount > raw) {
                note += ' (minimum ' + formatPeso(CUSTOM_MINIMUM) + ' applied)';
            }

            return { amount: amount, note: note };
        }

        return {
            amount: 0,
            note: 'Select a tattoo size to compute the amount.'
        };
    }

    function request(url, options) {
        var opts = options || {};
        opts.credentials = 'same-origin';

        return fetch(url, opts).then(function (response) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = '/login';
                return null;
            }

            return response.text().then(function (body) {
                try {
                    return JSON.parse(body);
                } catch (e) {
                    console.error('Non-JSON response from ' + url +
                        ' (HTTP ' + response.status + '):', body.slice(0, 500));

                    return {
                        success: false,
                        message: 'Server error (HTTP ' + response.status + ') on ' + url + '.'
                    };
                }
            });
        });
    }

    // ==================================================
    // ARTIST OPTIONS + MIN DATE (Philippine date)
    // ==================================================

    if (artistSelect && !artistSelect.options.length) {
        artistSelect.innerHTML = ARTISTS.map(function (name) {
            return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
        }).join('');
    }

    if (dateInput) {
        dateInput.min = getPhilippineNow().date;
    }

    // ==================================================
    // SIZE OPTIONS - ipakita ang sukat, hal. "Small (2 x 3 in)"
    // ==================================================

    (function labelSizeOptions() {
        if (!sizeSelect) {
            return;
        }

        for (var i = 0; i < sizeSelect.options.length; i++) {
            var option = sizeSelect.options[i];

            if (Object.prototype.hasOwnProperty.call(SIZE_DIMENSIONS, option.value)) {
                option.textContent = describeSize(option.value, '');
            }
        }
    })();

    // ==================================================
    // APPOINTMENT TIME - 8:00 AM hanggang 5:00 PM lang
    // Ginagawang dropdown kusa para walang 12 AM - 7 AM na option.
    // Laging 8:00 AM ang default.
    // ==================================================

    function setupTimeField() {
        if (!timeInput) {
            return;
        }

        if (timeInput.tagName !== 'SELECT') {
            var select = document.createElement('select');

            select.id = timeInput.id;
            select.name = timeInput.name || 'time';
            select.className = timeInput.className;
            select.required = true;

            timeInput.parentNode.replaceChild(select, timeInput);
            timeInput = select;
        }

        var html = '';

        for (var m = 8 * 60; m <= 17 * 60; m += 30) {
            var value = String(Math.floor(m / 60)).padStart(2, '0') + ':' +
                String(m % 60).padStart(2, '0');

            html += '<option value="' + value + '">' + formatTimeLabel(value) + '</option>';
        }

        timeInput.innerHTML = html;
        timeInput.value = OPEN_TIME;
    }

    function resetTimeToOpening() {
        if (timeInput) {
            timeInput.value = OPEN_TIME;
        }
    }

    setupTimeField();

    // Pagbukas ng booking modal, 8:00 AM agad
    if (typeof window.openAppointmentModal === 'function') {
        var originalOpenModal = window.openAppointmentModal;

        window.openAppointmentModal = function () {
            var result = originalOpenModal.apply(this, arguments);
            resetTimeToOpening();
            return result;
        };
    }

    // ==================================================
    // CELLPHONE NUMBER - numbers lang, 11 digits
    // ==================================================

    function setupPhoneField() {
        if (!phoneInput) {
            return;
        }

        phoneInput.type = 'tel';
        phoneInput.maxLength = PHONE_LENGTH;
        phoneInput.minLength = PHONE_LENGTH;
        phoneInput.pattern = '[0-9]{' + PHONE_LENGTH + '}';
        phoneInput.inputMode = 'numeric';
        phoneInput.required = true;

        if (!phoneInput.placeholder) {
            phoneInput.placeholder = '09XXXXXXXXX';
        }

        phoneInput.addEventListener('input', function () {
            phoneInput.value = phoneInput.value
                .replace(/\D/g, '')
                .slice(0, PHONE_LENGTH);
        });
    }

    setupPhoneField();

    // ==================================================
    // TATTOO SIZE -> AUTOMATIC NA HALAGA
    // ==================================================

    function refreshAmount() {
        if (!sizeSelect || !amountInput) {
            return 0;
        }

        var size = sizeSelect.value;
        var type = tattooTypeSelect ? tattooTypeSelect.value : '';
        var isCustom = size === 'Custom';

        if (customSizeRow) {
            customSizeRow.hidden = !isCustom;
        }

        if (widthInput && heightInput) {
            widthInput.required = isCustom;
            heightInput.required = isCustom;

            if (!isCustom) {
                widthInput.value = '';
                heightInput.value = '';
            }
        }

        var result = computeAmount(
            size,
            widthInput ? widthInput.value : '',
            heightInput ? heightInput.value : '',
            type
        );

        amountInput.value = result.amount.toFixed(2);

        if (amountDisplay) {
            amountDisplay.textContent = formatPeso(result.amount);
        }

        if (amountNote) {
            amountNote.textContent = result.note;
        }

        refreshBalance(result.amount);

        return result.amount;
    }

    // ==================================================
    // PAYMENT - Cash o GCash, at ang natitirang balanse
    // ==================================================

    function refreshBalance(total) {
        if (!balanceInput) {
            return 0;
        }

        var due = Number(total === undefined ? (amountInput ? amountInput.value : 0) : total) || 0;
        var paid = Number(paymentAmountInput ? paymentAmountInput.value : 0) || 0;

        if (paymentAmountInput) {
            paymentAmountInput.max = due;
        }

        var balance = Math.max(due - paid, 0);
        balanceInput.value = balance.toFixed(2);

        if (balanceDisplay) {
            balanceDisplay.textContent = formatPeso(balance);
        }

        var method = paymentMethodSelect && paymentMethodSelect.value
            ? ' via ' + paymentMethodSelect.value
            : '';

        if (paymentNote) {
            if (paid <= 0) {
                paymentNote.textContent = 'Enter your payment to see the remaining balance.';
            } else if (paid > due) {
                paymentNote.textContent = 'Payment is more than the total amount of ' +
                    formatPeso(due) + '.';
            } else if (balance === 0) {
                paymentNote.textContent = 'Fully paid' + method + '.';
            } else {
                paymentNote.textContent = formatPeso(paid) + ' paid' + method +
                    ' out of ' + formatPeso(due) + '.';
            }
        }

        return balance;
    }

    if (paymentAmountInput) {
        paymentAmountInput.addEventListener('input', function () {
            refreshBalance();
        });
    }

    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('change', function () {
            refreshBalance();
        });
    }

    // Minimalist: naka-fixed ang size (Small) at ang presyo ay 700
    var FIXED_SIZE_BY_TYPE = {
        Minimalist: 'Small'
    };

    function applyTypeFixedSize() {
        if (!sizeSelect || !tattooTypeSelect) {
            return;
        }

        var fixed = FIXED_SIZE_BY_TYPE[tattooTypeSelect.value];

        if (fixed) {
            sizeSelect.value = fixed;
            sizeSelect.disabled = true;
            sizeSelect.title = describeSize(fixed, tattooTypeSelect.value) +
                ' is a fixed size and rate.';
        } else {
            sizeSelect.disabled = false;
            sizeSelect.title = '';
        }

        refreshAmount();
    }

    if (tattooTypeSelect) {
        tattooTypeSelect.addEventListener('change', applyTypeFixedSize);
    }

    if (sizeSelect) {
        sizeSelect.addEventListener('change', refreshAmount);
    }

    if (widthInput) {
        widthInput.addEventListener('input', refreshAmount);
    }

    if (heightInput) {
        heightInput.addEventListener('input', refreshAmount);
    }

    // ==================================================
    // PLACEMENT - saan ilalagay ang tattoo
    // ==================================================

    if (placementSelect) {
        placementSelect.addEventListener('change', function () {
            var isOther = placementSelect.value === 'Other';

            if (placementOtherGroup) {
                placementOtherGroup.hidden = !isOther;
            }

            if (placementOtherInput) {
                placementOtherInput.required = isOther;

                if (!isOther) {
                    placementOtherInput.value = '';
                }
            }
        });
    }

    applyTypeFixedSize();
    refreshAmount();

    // ==================================================
    // REFERENCE PHOTO - napiling design galing sa /photos
    // Kusang ginagawa ang UI, walang kailangang baguhin sa EJS.
    // ==================================================

    var chosenBox = null;
    var chosenImage = null;
    var chosenName = null;
    var referenceUrlInput = null;

    function injectStyles() {
        if (document.getElementById('chosenDesignStyles')) {
            return;
        }

        var style = document.createElement('style');
        style.id = 'chosenDesignStyles';

        style.textContent =
            '.chosen-design{display:flex;align-items:center;gap:12px;padding:10px;' +
            'margin-bottom:10px;border:1px solid #ddd;border-radius:8px;background:#fafafa}' +
            '.chosen-design img{width:64px;height:64px;object-fit:cover;border-radius:6px}' +
            '.chosen-design-info{display:flex;flex-direction:column;flex:1;font-size:13px}' +
            '.chosen-design-remove{border:none;background:transparent;font-size:22px;' +
            'line-height:1;cursor:pointer;color:#c0392b}';

        document.head.appendChild(style);
    }

    function buildChosenUi() {
        if (chosenBox || !form) {
            return;
        }

        injectStyles();

        // Hidden input na ipinapadala sa server
        referenceUrlInput = document.getElementById('referenceUrl');

        if (!referenceUrlInput) {
            referenceUrlInput = document.createElement('input');
            referenceUrlInput.type = 'hidden';
            referenceUrlInput.id = 'referenceUrl';
            referenceUrlInput.name = 'referenceUrl';
            form.appendChild(referenceUrlInput);
        }

        chosenBox = document.createElement('div');
        chosenBox.id = 'chosenDesign';
        chosenBox.className = 'chosen-design';
        chosenBox.style.display = 'none';

        chosenBox.innerHTML =
            '<img id="chosenDesignImage" src="" alt="Selected design">' +
            '<div class="chosen-design-info">' +
                '<strong id="chosenDesignName"></strong>' +
                '<small>Selected from Photos Gallery</small>' +
            '</div>' +
            '<button type="button" id="clearChosenDesign" class="chosen-design-remove">&times;</button>';

        // Ilalagay sa itaas mismo ng file input; kung wala, sa dulo ng form
        if (fileInput && fileInput.parentNode) {
            fileInput.parentNode.insertBefore(chosenBox, fileInput);
        } else {
            form.appendChild(chosenBox);
        }

        chosenImage = document.getElementById('chosenDesignImage');
        chosenName = document.getElementById('chosenDesignName');

        document.getElementById('clearChosenDesign')
            .addEventListener('click', clearChosenDesign);
    }

    function showChosenDesign(title, image) {
        buildChosenUi();

        if (!chosenBox) {
            return;
        }

        referenceUrlInput.value = image;
        chosenImage.src = image;
        chosenName.textContent = title || 'Selected design';
        chosenBox.style.display = 'flex';

        if (fileInput) {
            fileInput.value = '';
        }

        // Itugma ang service sa design kung may ganoong option
        if (tattooTypeSelect && title) {
            for (var i = 0; i < tattooTypeSelect.options.length; i++) {
                if (tattooTypeSelect.options[i].value.toLowerCase() === title.toLowerCase()) {
                    tattooTypeSelect.selectedIndex = i;
                    applyTypeFixedSize();
                    break;
                }
            }
        }
    }

    function clearChosenDesign() {
        if (referenceUrlInput) {
            referenceUrlInput.value = '';
        }

        if (chosenBox) {
            chosenBox.style.display = 'none';
        }

        if (chosenImage) {
            chosenImage.src = '';
        }
    }

    // Kung mag-a-upload ng sariling larawan, iyon ang mananaig
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files.length) {
                clearChosenDesign();
            }
        });
    }

    function openBookingModal() {
        if (typeof window.openAppointmentModal === 'function') {
            window.openAppointmentModal();
            return;
        }

        // Fallback: hanapin ang modal na naglalaman ng form
        var modal = document.getElementById('appointmentModal');

        if (!modal && form) {
            modal = form.closest('.modal');
        }

        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active', 'show');
        }

        resetTimeToOpening();
    }

    (function applyDesignFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var image = params.get('image');

        if (!image) {
            return;
        }

        showChosenDesign(params.get('design') || '', image);
        openBookingModal();
    })();

    // ==================================================
    // MY APPOINTMENTS
    // ==================================================

    function render(appointments) {
        if (!tableBody) {
            return;
        }

        if (!appointments.length) {
            tableBody.innerHTML =
                '<tr><td colspan="11" style="text-align:center;">No appointments yet.</td></tr>';
            return;
        }

        tableBody.innerHTML = appointments.map(function (a) {
            var status = a.status || 'Pending';

            // Ang lumang records ay "size" ang field, hindi "tattooSize",
            // at ang Minimalist ay laging Small.
            var sizeValue = a.tattooSize || a.size ||
                FIXED_SIZE_BY_TYPE[a.tattooType] || '';

            var size = describeSize(sizeValue, a.tattooType) || 'N/A';

            if (sizeValue === 'Custom' && a.customWidth && a.customHeight) {
                size = 'Custom (' + a.customWidth + ' x ' + a.customHeight + ' in)';
            }

            var placement = a.placement === 'Other'
                ? (a.placementOther || 'Other')
                : (a.placement || 'N/A');

            if (a.placementSide) {
                placement = a.placementSide + ' ' + placement;
            }

            // Kung hindi pa na-set ang amount (lumang booking), kuwentahin
            // gamit ang parehong presyo na ginagamit sa booking form.
            var amount = Number(a.amount || 0);

            if (!amount) {
                amount = computeAmount(
                    sizeValue,
                    a.customWidth,
                    a.customHeight,
                    a.tattooType
                ).amount;
            }

            var paid = Number(a.paymentAmount || 0);

            if (!paid && a.payment === 'Paid') {
                paid = amount;
            }

            var balance = a.balance === undefined || a.balance === null ||
                (Number(a.balance) === 0 && amount > paid)
                ? Math.max(amount - paid, 0)
                : Number(a.balance);

            var method = a.paymentMethod ||
                (a.payment && a.payment !== 'Unpaid' && a.payment !== 'Paid'
                    ? a.payment
                    : '');

            var payment = paid > 0
                ? formatPeso(paid) + (method ? ' (' + method + ')' : ' (Paid)')
                : (method || 'Unpaid');

            // Kung may natitirang balanse, may input para makabayad ulit.
            var canPay = balance > 0 && status !== 'Cancelled';

            var payCell = canPay
                ? '<div class="pay-box">' +
                    '<select class="pay-method" data-id="' + escapeHtml(a._id) + '">' +
                        '<option value="Cash">Cash</option>' +
                        '<option value="GCash">GCash</option>' +
                    '</select>' +
                    '<input type="number" class="pay-amount" data-id="' + escapeHtml(a._id) + '" ' +
                        'min="0.01" step="0.01" max="' + balance + '" ' +
                        'placeholder="' + balance.toFixed(2) + '">' +
                    '<button type="button" class="pay-btn" data-id="' + escapeHtml(a._id) + '">Pay</button>' +
                  '</div>'
                : '<span class="pay-done">' +
                    (Number(a.amount || amount) > 0 ? 'Fully paid' : '-') +
                  '</span>';

            return '<tr>' +
                '<td>' + escapeHtml(a.artist) + '</td>' +
                '<td>' + formatDate(a.date) + '</td>' +
                '<td>' + escapeHtml(a.time) + '</td>' +
                '<td>' + escapeHtml(a.tattooType) + '</td>' +
                '<td>' + escapeHtml(size) + '</td>' +
                '<td>' + escapeHtml(placement) + '</td>' +
                '<td>' + escapeHtml(formatPeso(amount)) + '</td>' +
                '<td>' + escapeHtml(payment) + '</td>' +
                '<td>' + escapeHtml(formatPeso(balance)) + '</td>' +
                '<td><span class="status status-' + status.toLowerCase() + '">' +
                    escapeHtml(status) +
                '</span></td>' +
                '<td>' + payCell + '</td>' +
            '</tr>';
        }).join('');
    }

    // ==================================================
    // PAY BALANCE - bayad sa natitirang balanse
    // ==================================================

    function injectPayStyles() {
        if (document.getElementById('payBalanceStyles')) {
            return;
        }

        var style = document.createElement('style');
        style.id = 'payBalanceStyles';

        style.textContent =
            '.pay-box{display:flex;gap:4px;align-items:center}' +
            '.pay-box select,.pay-box input{padding:4px;font-size:12px;border:1px solid #ccc;' +
            'border-radius:4px}' +
            '.pay-box input{width:80px}' +
            '.pay-btn{padding:4px 10px;font-size:12px;border:none;border-radius:4px;' +
            'background:#c0392b;color:#fff;cursor:pointer}' +
            '.pay-btn:disabled{opacity:.6;cursor:not-allowed}' +
            '.pay-done{font-size:12px;color:#777}';

        document.head.appendChild(style);
    }

    injectPayStyles();

    if (tableBody) {
        tableBody.addEventListener('click', function (event) {
            var button = event.target.closest
                ? event.target.closest('.pay-btn')
                : null;

            if (!button) {
                return;
            }

            var id = button.getAttribute('data-id');

            var amountField = tableBody.querySelector(
                '.pay-amount[data-id="' + id + '"]'
            );

            var methodField = tableBody.querySelector(
                '.pay-method[data-id="' + id + '"]'
            );

            var value = Number(amountField ? amountField.value : 0) || 0;
            var maximum = Number(amountField ? amountField.max : 0) || 0;

            if (value <= 0) {
                alert('Please enter the amount you want to pay.');
                return;
            }

            if (maximum && value > maximum) {
                alert('Payment cannot be more than the remaining balance of ' +
                    formatPeso(maximum) + '.');
                return;
            }

            button.disabled = true;

            request('/api/appointments/' + id + '/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: value,
                    paymentMethod: methodField ? methodField.value : 'Cash'
                })
            })
                .then(function (data) {
                    button.disabled = false;

                    if (!data) {
                        return;
                    }

                    if (!data.success) {
                        alert(data.message || 'Payment failed. Please try again.');
                        return;
                    }

                    alert('Payment recorded. Remaining balance: ' +
                        formatPeso(data.appointment.balance) + '.');

                    load();
                })
                .catch(function (error) {
                    console.error('Error paying balance:', error);
                    button.disabled = false;
                    alert('An error occurred. Please try again.');
                });
        });
    }

    function load() {
        return request('/api/appointments')
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (data.success) {
                    render(data.appointments || []);
                } else {
                    console.error(data.message);
                }
            })
            .catch(function (error) {
                console.error('Error loading appointments:', error);
            });
    }

    // ==================================================
    // BOOKING
    // FormData - para talagang naipapadala ang reference photo.
    // Huwag maglagay ng Content-Type header, awtomatiko iyon.
    // ==================================================

    if (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();

            var due = refreshAmount();

            // Cellphone: eksaktong 11 digits
            if (phoneInput && !/^\d{11}$/.test(phoneInput.value.trim())) {
                alert('Cellphone number must be exactly ' + PHONE_LENGTH + ' digits.');
                phoneInput.focus();
                return;
            }

            // Oras: 8:00 AM hanggang 5:00 PM lang
            var timeValue = timeInput ? timeInput.value : '';

            if (timeInput && !isWithinBusinessHours(timeValue)) {
                alert('Appointments are only available from 8:00 AM to 5:00 PM (Philippine Time).');
                return;
            }

            // Hindi puwede ang petsa/oras na lumipas na (Philippine Time)
            if (dateInput && dateInput.value && timeInput) {
                var now = getPhilippineNow();

                if (dateInput.value < now.date ||
                    (dateInput.value === now.date && timeValue <= now.time)) {
                    alert('Please choose a date and time that has not passed yet (Philippine Time).');
                    return;
                }
            }

            if (due <= 0) {
                alert('Please choose a tattoo size (and inches for a custom size) first.');
                return;
            }

            if (paymentMethodSelect && !paymentMethodSelect.value) {
                alert('Please choose a payment method (Cash or GCash).');
                return;
            }

            if (paymentAmountInput && Number(paymentAmountInput.value || 0) > due) {
                alert('Payment cannot be more than the total amount of ' + formatPeso(due) + '.');
                return;
            }

            var submitButton = form.querySelector('button[type="submit"]');

            if (submitButton) {
                submitButton.disabled = true;
            }

            var payload = new FormData(form);

            // Hindi kasama sa FormData ang naka-disable na select
            if (sizeSelect && sizeSelect.disabled) {
                payload.set('tattooSize', sizeSelect.value);
            }

            fetch('/api/appointments', {
                method: 'POST',
                credentials: 'same-origin',
                body: payload
            })
                .then(function (response) {
                    if (response.status === 401 || response.status === 403) {
                        window.location.href = '/login';
                        return null;
                    }

                    return response.json();
                })
                .then(function (data) {
                    if (submitButton) {
                        submitButton.disabled = false;
                    }

                    if (!data) {
                        return;
                    }

                    if (!data.success) {
                        alert(data.message || 'Booking failed. Please try again.');
                        return;
                    }

                    form.reset();
                    clearChosenDesign();
                    resetTimeToOpening();
                    applyTypeFixedSize();
                    refreshBalance();

                    if (typeof window.closeAppointmentModal === 'function') {
                        window.closeAppointmentModal();
                    }

                    alert('Appointment booked! Please wait for the admin to confirm.');
                    load();
                })
                .catch(function (error) {
                    console.error('Error booking appointment:', error);

                    if (submitButton) {
                        submitButton.disabled = false;
                    }

                    alert('An error occurred. Please try again.');
                });
        });
    }

    // ==================================================
    // INIT
    // ==================================================

    load();
    setInterval(load, REFRESH_MS);

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            load();
        }
    });
});