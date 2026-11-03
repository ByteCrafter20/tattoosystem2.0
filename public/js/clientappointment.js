// clientappointment.js
// Admin page - lahat ng booking ng lahat ng client galing MongoDB.

document.addEventListener('DOMContentLoaded', function () {

    var REFRESH_MS = 15000;

    var tableBody = document.getElementById('appointmentTable');
    var emptyMessage = document.getElementById('noAppointments');
    var totalBox = document.getElementById('totalAppointments');
    var searchInput = document.getElementById('searchInput');
    var statusFilter = document.getElementById('statusFilter');
    var dateFilter = document.getElementById('dateFilter');
    var sizeFilter = document.getElementById('sizeFilter');

    var rescheduleModal = document.getElementById('rescheduleModal');
    var rescheduleForm = document.getElementById('rescheduleForm');
    var modalClient = document.getElementById('modalClient');
    var modalArtist = document.getElementById('modalArtist');
    var newDate = document.getElementById('newDate');
    var newTime = document.getElementById('newTime');
    var conflictMessage = document.getElementById('conflictMessage');

    var messageModal = document.getElementById('messageModal');
    var messageIcon = document.getElementById('messageIcon');
    var messageTitle = document.getElementById('messageTitle');
    var messageText = document.getElementById('messageText');

    var imageModal = document.getElementById('imageModal');
    var imagePreview = document.getElementById('imagePreview');
    var paymentModal = document.getElementById('paymentModal');

    var tattooDetailsModal = document.getElementById('tattooDetailsModal');
    var detailSize = document.getElementById('detailSize');
    var detailDimensions = document.getElementById('detailDimensions');
    var detailPlacement = document.getElementById('detailPlacement');
    var detailAmount = document.getElementById('detailAmount');

    if (!tableBody) {
        return;
    }

    var allAppointments = [];
    var rescheduleId = null;
    var paymentId = null;

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

    // YYYY-MM-DD sa local time, para tugma sa <input type="date">
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
            : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // ==================================================
    // SIZE / PLACEMENT / AMOUNT
    // ==================================================

    var PRESET_INCHES = {
        Small: 'up to 3 in',
        Medium: 'up to 6 in',
        Large: 'up to 12 in'
    };

    function formatPeso(value) {
        return '\u20B1' + Number(value || 0).toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // "Custom (5 x 8 in)" o "Medium"
    function formatSize(a) {
        if (!a.tattooSize) {
            return 'N/A';
        }

        if (a.tattooSize === 'Custom' && a.customWidth && a.customHeight) {
            return 'Custom (' + a.customWidth + ' x ' + a.customHeight + ' in)';
        }

        return a.tattooSize;
    }

    // "Left Forearm"
    function formatPlacement(a) {
        var place = a.placement === 'Other'
            ? (a.placementOther || 'Other')
            : (a.placement || 'N/A');

        if (a.placementSide && place !== 'N/A') {
            place = a.placementSide + ' ' + place;
        }

        return place;
    }

    // Gaano kalaki - eksaktong inches kapag custom
    function formatDimensions(a) {
        if (a.customWidth && a.customHeight) {
            var squareInches = Number(a.customWidth) * Number(a.customHeight);

            return a.customWidth + ' in x ' + a.customHeight + ' in (' +
                squareInches.toFixed(2) + ' sq in)';
        }

        return PRESET_INCHES[a.tattooSize] || 'N/A';
    }

    // ==================================================
    // REFERENCE PHOTO
    // Kahit anong pangalan ng field sa MongoDB, hahanapin dito.
    // ==================================================

    var IMAGE_KEYS = [
        'reference',
        'referencePhoto',
        'referenceImage',
        'refPhoto',
        'image',
        'imageUrl',
        'imagePath',
        'photo',
        'photoUrl',
        'picture',
        'file',
        'filename',
        'attachment',
        'design'
    ];

    function imageUrl(appointment) {
        var raw = '';

        for (var i = 0; i < IMAGE_KEYS.length; i++) {
            var value = appointment[IMAGE_KEYS[i]];

            if (typeof value === 'string' && value.trim()) {
                raw = value.trim();
                break;
            }

            // { path: "..." } o { url: "..." } o { filename: "..." }
            if (value && typeof value === 'object') {
                var nested = value.url || value.path || value.filename || value.secure_url;
                if (typeof nested === 'string' && nested.trim()) {
                    raw = nested.trim();
                    break;
                }
            }
        }

        if (!raw) {
            return '';
        }

        // base64 o kumpletong URL - gamitin as is
        if (/^(data:|https?:\/\/)/i.test(raw)) {
            return raw;
        }

        // Windows path -> forward slashes, tapos alisin ang "public/"
        var clean = raw.replace(/\\/g, '/').replace(/^\.?\/?public\//i, '');

        if (clean.charAt(0) === '/') {
            return clean;
        }

        // filename lang - nasa /uploads/ ang default na folder
        if (clean.indexOf('/') === -1) {
            return '/uploads/' + clean;
        }

        return '/' + clean;
    }

    function request(url, options) {
        var opts = options || {};
        opts.credentials = 'same-origin';

        return fetch(url, opts).then(function (response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            // Logged in, pero hindi admin ang role - huwag i-bounce sa login
            if (response.status === 403) {
                return {
                    success: false,
                    message: 'Admin account is required to manage client appointments.'
                };
            }

            return response.text().then(function (body) {
                try {
                    return JSON.parse(body);
                } catch (e) {
                    console.error('Non-JSON response from ' + url + ' (HTTP ' + response.status + '):',
                        body.slice(0, 500));
                    return {
                        success: false,
                        message: 'Server error (HTTP ' + response.status + ') on ' + url + '.'
                    };
                }
            });
        });
    }

    function showMessage(title, text, ok) {
        if (!messageModal) {
            alert(title + '\n' + text);
            return;
        }
        if (messageIcon) {
            messageIcon.innerHTML = ok ? '&#10003;' : '&#10007;';
            messageIcon.className = 'message-icon ' + (ok ? 'success' : 'error');
        }
        messageTitle.textContent = title;
        messageText.textContent = text;
        messageModal.style.display = 'flex';
    }

    // ==================================================
    // RENDER
    // ==================================================

    function visibleAppointments() {
        var term = (searchInput && searchInput.value || '').trim().toLowerCase();
        var status = statusFilter ? statusFilter.value : 'all';
        var day = dateFilter ? dateFilter.value : '';
        var size = sizeFilter ? sizeFilter.value : 'all';

        return allAppointments.filter(function (a) {
            if (status !== 'all' && (a.status || 'Pending') !== status) {
                return false;
            }

            if (day && toInputDate(a.date) !== day) {
                return false;
            }

            if (size !== 'all' && a.tattooSize !== size) {
                return false;
            }

            if (term) {
                var haystack = [a.clientName, a.username, a.phone, a.artist, a.tattooType,
                    a.tattooSize, formatPlacement(a)]
                    .join(' ')
                    .toLowerCase();

                if (haystack.indexOf(term) === -1) {
                    return false;
                }
            }

            return true;
        });
    }

    function summarize(rows) {
        var revenue = rows.reduce(function (sum, a) {
            return sum + (Number(a.amount) || 0);
        }, 0);

        var noShows = rows.filter(function (a) {
            return a.status === 'Cancelled';
        }).length;

        return {
            count: rows.length,
            revenue: revenue,
            average: rows.length ? Math.round(revenue / rows.length) : 0,
            noShowRate: rows.length ? Math.round((noShows / rows.length) * 100) : 0
        };
    }

    function percentChange(current, previous) {
        if (!previous) {
            return current ? 100 : 0;
        }

        return Math.round(((current - previous) / previous) * 100);
    }

    function setStat(id, text) {
        var element = document.getElementById(id);

        if (element) {
            element.textContent = text;
        }
    }

    function setDelta(id, value) {
        var element = document.getElementById(id);

        if (!element) {
            return;
        }

        element.className = value < 0 ? 'delta down' : 'delta up';
        element.textContent = (value > 0 ? '+' : '') + value + '% last month';
    }

    function peso(value) {
        return '₱' + Number(value || 0).toLocaleString();
    }

    function renderStats(rows) {
        var now = new Date();
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        var previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        var overall = summarize(rows);

        var thisMonth = summarize(rows.filter(function (a) {
            return new Date(a.date) >= monthStart;
        }));

        var lastMonth = summarize(rows.filter(function (a) {
            var date = new Date(a.date);
            return date >= previousMonthStart && date < monthStart;
        }));

        setStat('statBookings', overall.count.toLocaleString());
        setStat('statRevenue', peso(overall.revenue));
        setStat('statAverage', peso(overall.average));
        setStat('statNoShow', overall.noShowRate + '%');

        setDelta('statBookingsDelta', percentChange(thisMonth.count, lastMonth.count));
        setDelta('statRevenueDelta', percentChange(thisMonth.revenue, lastMonth.revenue));
        setDelta('statAverageDelta', percentChange(thisMonth.average, lastMonth.average));
        setDelta('statNoShowDelta', percentChange(thisMonth.noShowRate, lastMonth.noShowRate));
    }

    function render() {
        var rows = visibleAppointments();

        if (totalBox) {
            totalBox.textContent = rows.length;
        }

        renderStats(rows);

        if (!rows.length) {
            tableBody.innerHTML = '';
            if (emptyMessage) {
                emptyMessage.style.display = 'block';
            }
            return;
        }

        if (emptyMessage) {
            emptyMessage.style.display = 'none';
        }

        tableBody.innerHTML = rows.map(function (a) {
            var status = a.status || 'Pending';
            var payment = a.payment || 'Unpaid';
            var id = escapeHtml(a._id);
            var image = imageUrl(a);
            var closed = status === 'Cancelled' || status === 'Completed';

            var actions = '';

            if (!closed) {
                if (status === 'Pending') {
                    actions += '<button type="button" class="confirm-btn" data-action="Confirmed" data-id="' + id + '">Confirm</button> ';
                }
                actions += '<button type="button" class="reschedule-btn" data-action="reschedule" data-id="' + id + '">Reschedule</button> ';
                actions += '<button type="button" class="complete-btn" data-action="Completed" data-id="' + id + '">Complete</button> ';
                actions += '<button type="button" class="cancel-btn" data-action="Cancelled" data-id="' + id + '">Cancel</button>';
            } else {
                actions = '&mdash;';
            }

            // Thumbnail na clickable - kung wala, "No image"
            var imageCell = image
                ? '<button type="button" class="view-img" data-id="' + id + '" data-img="' + escapeHtml(image) + '" title="View reference photo">' +
                      '<img src="' + escapeHtml(image) + '" alt="Reference" class="thumb" ' +
                          'onerror="this.style.display=\'none\'">' +
                      '<span>View</span>' +
                  '</button>'
                : '<span class="no-image">No image</span>';

            return '<tr>' +
                '<td>' + escapeHtml(a.clientName) + '</td>' +
                '<td>' + escapeHtml(a.phone) + '</td>' +
                '<td>' + escapeHtml(a.artist) + '</td>' +
                '<td>' + formatDate(a.date) + '</td>' +
                '<td>' + escapeHtml(a.time) + '</td>' +
                '<td>' + escapeHtml(a.tattooType) + '</td>' +
                '<td>' +
                    '<button type="button" class="size-btn" data-detail-id="' + id + '" ' +
                        'title="View tattoo details">' +
                        escapeHtml(formatSize(a)) +
                    '</button>' +
                '</td>' +
                '<td>' + escapeHtml(formatPlacement(a)) + '</td>' +
                '<td>' + escapeHtml(formatPeso(a.amount)) + '</td>' +
                '<td>' + imageCell + '</td>' +
                '<td>' +
                    '<button type="button" class="payment payment-' + payment.toLowerCase().replace(/\s+/g, '-') + '" ' +
                        'data-pay-id="' + id + '" title="Click to change payment">' +
                        escapeHtml(payment) +
                    '</button>' +
                '</td>' +
                '<td><span class="status status-' + status.toLowerCase() + '">' + escapeHtml(status) + '</span></td>' +
                '<td class="actions">' + actions + '</td>' +
            '</tr>';
        }).join('');
    }

    // ==================================================
    // LOAD
    // ==================================================

    function load() {
        return request('/api/appointments/admin/all')
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (data.success) {
                    allAppointments = data.appointments || [];
                    render();
                } else {
                    console.error(data.message);
                }
            })
            .catch(function (error) {
                console.error('Error loading appointments:', error);
            });
    }

    // ==================================================
    // ACTIONS
    // ==================================================

    function updateStatus(id, status) {
        request('/api/appointments/admin/' + encodeURIComponent(id) + '/status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        })
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (data.success) {
                    showMessage('Appointment Updated', 'Status is now ' + status + '.', true);
                    load();
                } else {
                    showMessage('Update Failed', data.message || 'Please try again.', false);
                }
            })
            .catch(function (error) {
                console.error('Error:', error);
                showMessage('Update Failed', 'An error occurred. Please try again.', false);
            });
    }

    function updatePayment(id, payment) {
        request('/api/appointments/admin/' + encodeURIComponent(id) + '/payment', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment: payment })
        })
            .then(function (data) {
                window.closePayment();

                if (!data) {
                    return;
                }

                if (data.success) {
                    showMessage('Payment Updated', 'Payment is now ' + payment + '.', true);
                    load();
                } else {
                    showMessage('Update Failed', data.message || 'Please try again.', false);
                }
            })
            .catch(function (error) {
                console.error('Error:', error);
                window.closePayment();
                showMessage('Update Failed', 'An error occurred. Please try again.', false);
            });
    }

    function openReschedule(appointment) {
        rescheduleId = appointment._id;

        if (modalClient) { modalClient.textContent = appointment.clientName || ''; }
        if (modalArtist) { modalArtist.textContent = appointment.artist || ''; }
        if (conflictMessage) { conflictMessage.textContent = ''; conflictMessage.style.display = 'none'; }

        if (newDate) {
            newDate.min = toInputDate(new Date());
            newDate.value = toInputDate(appointment.date);
        }
        if (newTime) {
            newTime.value = appointment.time || '';
        }

        rescheduleModal.style.display = 'flex';
    }

    function openTattooDetails(appointment) {
        if (!tattooDetailsModal) {
            return;
        }

        if (detailSize) { detailSize.textContent = formatSize(appointment); }
        if (detailDimensions) { detailDimensions.textContent = formatDimensions(appointment); }
        if (detailPlacement) { detailPlacement.textContent = formatPlacement(appointment); }
        if (detailAmount) { detailAmount.textContent = formatPeso(appointment.amount); }

        tattooDetailsModal.style.display = 'flex';
    }

    // ==================================================
    // IMAGE VIEWER - i-click ang picture para magpadala ng bagong larawan
    // ==================================================

    var currentImageId = null;

    // Nakatagong file picker (walang binago sa EJS/CSS)
    var photoPicker = document.createElement('input');
    photoPicker.type = 'file';
    photoPicker.accept = 'image/*';
    photoPicker.style.display = 'none';
    document.body.appendChild(photoPicker);

    if (imagePreview) {
        imagePreview.style.cursor = 'pointer';
        imagePreview.title = 'Click to send a different photo';

        imagePreview.addEventListener('click', function () {
            if (currentImageId) {
                photoPicker.click();
            }
        });
    }

    photoPicker.addEventListener('change', function () {
        if (!photoPicker.files.length || !currentImageId) {
            return;
        }

        var body = new FormData();
        body.append('reference', photoPicker.files[0]);

        // Walang Content-Type header - awtomatiko para sa FormData
        request('/api/appointments/admin/' + encodeURIComponent(currentImageId) + '/reference', {
            method: 'PUT',
            body: body
        })
            .then(function (data) {
                photoPicker.value = '';

                if (!data) {
                    return;
                }

                if (data.success) {
                    imagePreview.src = data.appointment.reference;
                    showMessage('Photo Updated', 'The reference photo has been saved.', true);
                    load();
                } else {
                    showMessage('Upload Failed', data.message || 'Please try again.', false);
                }
            })
            .catch(function (error) {
                console.error('Error uploading photo:', error);
                photoPicker.value = '';
                showMessage('Upload Failed', 'An error occurred. Please try again.', false);
            });
    });

    // ---------- Choices under the picture: Stencil Print / Photoshop / Download ----------

    function setImageStatus(text, isError) {
        var status = document.getElementById('imageActionStatus');

        if (!status) {
            return;
        }

        status.textContent = text;
        status.style.color = isError ? '#c0392b' : '#1e7a46';
    }

    // Hinihiling sa server (parehong computer) na buksan ang larawan sa Photoshop
    function openInPhotoshop() {
        var src = imagePreview ? imagePreview.getAttribute('src') : '';

        if (!src) {
            return;
        }

        if (/^data:/i.test(src) || (/^https?:\/\//i.test(src) && src.indexOf(window.location.origin) !== 0)) {
            setImageStatus('Only images saved on this server can be opened. Use Download instead.', true);
            return;
        }

        var imagePath;

        try {
            imagePath = new URL(src, window.location.href).pathname;
        } catch (e) {
            imagePath = src;
        }

        setImageStatus('Opening in Photoshop...', false);

        request('/api/open-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app: 'photoshop', image: imagePath })
        })
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (data.ok) {
                    setImageStatus('Sent to Photoshop.', false);
                } else {
                    setImageStatus(data.error || data.message || 'Could not open the image.', true);
                }
            })
            .catch(function () {
                setImageStatus('Could not reach the server.', true);
            });
    }

    // Binubuksan ang Stencil Print page (/fxprint) sa loob ng modal
    function openStencil() {
        var src = imagePreview ? imagePreview.getAttribute('src') : '';

        if (!src) {
            return;
        }

        if (/^data:/i.test(src) || (/^https?:\/\//i.test(src) && src.indexOf(window.location.origin) !== 0)) {
            setImageStatus('Only images saved on this server can be sent to Stencil Print.', true);
            return;
        }

        var imagePath;

        try {
            imagePath = new URL(src, window.location.href).pathname;
        } catch (e) {
            imagePath = src;
        }

        var overlay = document.getElementById('stencilOverlay');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'stencilOverlay';
            overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;' +
                'background:rgba(0,0,0,.6);align-items:center;justify-content:center;';

            overlay.innerHTML =
                '<div style="position:relative;width:95vw;height:92vh;background:#fff;' +
                    'border-radius:12px;overflow:hidden;">' +
                    '<button type="button" id="stencilClose" style="position:absolute;top:8px;right:12px;' +
                        'z-index:2;width:36px;height:36px;border:0;border-radius:50%;background:#e63946;' +
                        'color:#fff;font-size:22px;cursor:pointer;">&times;</button>' +
                    '<iframe title="Stencil Print" style="width:100%;height:100%;border:0;"></iframe>' +
                '</div>';

            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    window.closeStencil();
                }
            });

            document.body.appendChild(overlay);

            document.getElementById('stencilClose').addEventListener('click', function () {
                window.closeStencil();
            });
        }

        var frame = overlay.querySelector('iframe');

        // Itago ang navbar (Dashboard, Inventory, ... Logout) sa loob ng modal
        frame.onload = function () {
            try {
                var doc = frame.contentDocument;

                if (!doc || !doc.head || doc.getElementById('embedHideNav')) {
                    return;
                }

                var style = doc.createElement('style');
                style.id = 'embedHideNav';
                style.textContent = '.navbar{display:none !important;}' +
                    '.st-app{padding-top:16px;}';
                doc.head.appendChild(style);
            } catch (e) {
                console.warn('Could not hide navbar in Stencil Print modal:', e);
            }
        };

        frame.src = '/fxprint?embed=1&image=' + encodeURIComponent(imagePath);
        overlay.style.display = 'flex';
    }

    window.closeStencil = function () {
        var overlay = document.getElementById('stencilOverlay');

        if (overlay) {
            overlay.style.display = 'none';
            overlay.querySelector('iframe').src = 'about:blank';
        }
    };

    function ensureImageActions() {
        if (!imageModal || !imagePreview || imageModal.querySelector('.image-actions')) {
            return;
        }

        var bar = document.createElement('div');
        bar.className = 'image-actions';
        bar.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;';

        bar.innerHTML =
            '<button type="button" class="save-btn" data-app="stencil">Stencil Print</button>' +
            '<button type="button" class="save-btn" data-app="photoshop">Open in Photoshop</button>' +
            '<a class="cancel-modal-btn" id="imageDownloadLink" download ' +
                'style="text-decoration:none;display:inline-block;">Download</a>' +
            '<span id="imageActionStatus" style="width:100%;font-size:13px;"></span>';

        bar.addEventListener('click', function (event) {
            var button = event.target.closest('button[data-app]');

            if (!button) {
                return;
            }

            if (button.getAttribute('data-app') === 'stencil') {
                openStencil();
            } else {
                openInPhotoshop();
            }
        });

        imagePreview.insertAdjacentElement('afterend', bar);
    }

    function openImage(src, id) {
        currentImageId = id || null;

        if (imagePreview) {
            imagePreview.src = src;
        }

        if (imageModal) {
            ensureImageActions();

            var download = document.getElementById('imageDownloadLink');

            if (download) {
                download.href = src;
            }

            setImageStatus('', false);
            imageModal.style.display = 'flex';
        } else {
            window.open(src, '_blank');
        }
    }

    tableBody.addEventListener('click', function (event) {

        // ---------- VIEW IMAGE ----------
        var imageButton = event.target.closest('.view-img');

        if (imageButton) {
            openImage(imageButton.getAttribute('data-img'), imageButton.getAttribute('data-id'));
            return;
        }

        // ---------- TATTOO DETAILS ----------
        var detailButton = event.target.closest('[data-detail-id]');

        if (detailButton) {
            var detailId = detailButton.getAttribute('data-detail-id');
            var detailAppointment = allAppointments.find(function (a) {
                return a._id === detailId;
            });

            if (detailAppointment) {
                openTattooDetails(detailAppointment);
            }
            return;
        }

        // ---------- PAYMENT ----------
        var paymentButton = event.target.closest('[data-pay-id]');

        if (paymentButton) {
            paymentId = paymentButton.getAttribute('data-pay-id');

            if (paymentModal) {
                paymentModal.style.display = 'flex';
            } else {
                var choice = prompt('Payment (GCash / Cash / Unpaid):', 'GCash');
                if (choice) {
                    updatePayment(paymentId, choice);
                }
            }
            return;
        }

        // ---------- STATUS / RESCHEDULE ----------
        var button = event.target.closest('[data-action]');

        if (!button) {
            return;
        }

        var id = button.getAttribute('data-id');
        var action = button.getAttribute('data-action');

        if (action === 'reschedule') {
            var appointment = allAppointments.find(function (a) { return a._id === id; });
            if (appointment) {
                openReschedule(appointment);
            }
            return;
        }

        if (action === 'Cancelled' && !confirm('Cancel this appointment?')) {
            return;
        }

        updateStatus(id, action);
    });

    if (paymentModal) {
        paymentModal.querySelectorAll('[data-pay]').forEach(function (button) {
            button.addEventListener('click', function () {
                if (!paymentId) {
                    return;
                }
                updatePayment(paymentId, button.getAttribute('data-pay'));
            });
        });
    }

    if (rescheduleForm) {
        rescheduleForm.addEventListener('submit', function (event) {
            event.preventDefault();

            if (!rescheduleId) {
                return;
            }

            if (conflictMessage) {
                conflictMessage.textContent = '';
                conflictMessage.style.display = 'none';
            }

            request('/api/appointments/admin/' + encodeURIComponent(rescheduleId) + '/reschedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: newDate.value, time: newTime.value })
            })
                .then(function (data) {
                    if (!data) {
                        return;
                    }

                    if (data.success) {
                        window.closeReschedule();
                        showMessage('Appointment Updated', 'The schedule has been updated.', true);
                        load();
                    } else if (conflictMessage) {
                        conflictMessage.textContent = data.message || 'Failed to reschedule.';
                        conflictMessage.style.display = 'block';
                    } else {
                        showMessage('Reschedule Failed', data.message || 'Please try again.', false);
                    }
                })
                .catch(function (error) {
                    console.error('Error:', error);
                    showMessage('Reschedule Failed', 'An error occurred. Please try again.', false);
                });
        });
    }

    // ==================================================
    // MODAL HELPERS (tinatawag ng inline onclick sa EJS)
    // ==================================================

    window.closeReschedule = function () {
        rescheduleId = null;
        if (rescheduleModal) {
            rescheduleModal.style.display = 'none';
        }
        if (rescheduleForm) {
            rescheduleForm.reset();
        }
    };

    window.closeMessage = function () {
        if (messageModal) {
            messageModal.style.display = 'none';
        }
    };

    window.closeImage = function () {
        currentImageId = null;
        if (imageModal) {
            imageModal.style.display = 'none';
        }
        if (imagePreview) {
            imagePreview.src = '';
        }
    };

    window.closeTattooDetails = function () {
        if (tattooDetailsModal) {
            tattooDetailsModal.style.display = 'none';
        }
    };

    window.closePayment = function () {
        paymentId = null;
        if (paymentModal) {
            paymentModal.style.display = 'none';
        }
    };

    window.addEventListener('click', function (event) {
        if (event.target === rescheduleModal) {
            window.closeReschedule();
        }
        if (event.target === messageModal) {
            window.closeMessage();
        }
        if (event.target === imageModal) {
            window.closeImage();
        }
        if (event.target === paymentModal) {
            window.closePayment();
        }
        if (event.target === tattooDetailsModal) {
            window.closeTattooDetails();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            window.closeStencil();
            window.closeReschedule();
            window.closeMessage();
            window.closeImage();
            window.closePayment();
            window.closeTattooDetails();
        }
    });

    // ==================================================
    // FILTERS
    // ==================================================

    if (searchInput) { searchInput.addEventListener('input', render); }
    if (statusFilter) { statusFilter.addEventListener('change', render); }
    if (dateFilter) { dateFilter.addEventListener('change', render); }
    if (sizeFilter) { sizeFilter.addEventListener('change', render); }

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