// public/js/dashboard.js

(function () {

    function imageUrl(value) {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(value)
            ? '/images/' + value
            : '/images/' + value + '.jpg';
    }

    function swap(selectId, imageId) {
        var select = document.getElementById(selectId);
        var image = document.getElementById(imageId);

        if (!select || !image || !select.value) return;

        image.src = imageUrl(select.value);
    }

    var pairs = [
        { select: 'categorySelect', image: 'tattooImage', handler: 'changeImage' },
        { select: 'minimalistSelect', image: 'minimalistImage', handler: 'changeMinimalistImage' },
        { select: 'legsSelect', image: 'legsImage', handler: 'changeLegsImage' },
        { select: 'backPieceSelect', image: 'backPieceImage', handler: 'changeBackPieceImage' }
    ];

    pairs.forEach(function (pair) {
        window[pair.handler] = function () {
            swap(pair.select, pair.image);
        };
    });

    var REFRESH_MS = 30000;

    function peso(value) {
        return '₱' + Number(value || 0).toLocaleString('en-PH');
    }

    function setText(id, text) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Returns the first non-empty value among several possible field names
    function pick(a, keys, fallback) {
        for (var i = 0; i < keys.length; i++) {
            if (a[keys[i]] !== undefined && a[keys[i]] !== null && a[keys[i]] !== '') {
                return a[keys[i]];
            }
        }
        return fallback;
    }

    function formatDate(value) {
        var date = new Date(value);

        if (isNaN(date.getTime())) {
            return 'N/A';
        }

        return date.toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function statusClass(status) {
        if (status === 'Confirmed') return 'status-badge status-confirmed';
        if (status === 'Completed') return 'status-badge status-completed';
        if (status === 'Cancelled') return 'status-badge status-cancelled';

        return 'status-badge status-pending';
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
            average: rows.length
                ? Math.round(revenue / rows.length)
                : 0,
            noShowRate: rows.length
                ? Math.round((noShows / rows.length) * 100)
                : 0
        };
    }

    function renderStats(stats) {
        setText('totalAppointments', Number(stats.count || 0).toLocaleString());
        setText('totalRevenue', peso(stats.revenue));
        setText('avgBookingValue', peso(stats.average));
        setText('noShowRate', (stats.noShowRate || 0) + '%');
    }

    function renderBookingInsight(rows) {
        var element = document.getElementById('bookingInsight');

        if (!element) {
            return;
        }

        if (!rows.length) {
            element.textContent = 'No booking data available.';
            return;
        }

        var confirmed = rows.filter(function (a) {
            return a.status === 'Confirmed';
        }).length;

        var completed = rows.filter(function (a) {
            return a.status === 'Completed';
        }).length;

        var cancelled = rows.filter(function (a) {
            return a.status === 'Cancelled';
        }).length;

        var pending = rows.filter(function (a) {
            return a.status === 'Pending';
        }).length;

        element.innerHTML =
            '<div class="insight-item">' +
                '<strong>Total Bookings</strong>' +
                '<span>' + rows.length + '</span>' +
            '</div>' +

            '<div class="insight-item">' +
                '<strong>Confirmed</strong>' +
                '<span>' + confirmed + '</span>' +
            '</div>' +

            '<div class="insight-item">' +
                '<strong>Completed</strong>' +
                '<span>' + completed + '</span>' +
            '</div>' +

            '<div class="insight-item">' +
                '<strong>Pending</strong>' +
                '<span>' + pending + '</span>' +
            '</div>' +

            '<div class="insight-item">' +
                '<strong>Cancelled</strong>' +
                '<span>' + cancelled + '</span>' +
            '</div>';
    }

    var NAME_KEYS = ['clientName', 'name', 'fullName', 'customerName', 'client'];
    var TYPE_KEYS = ['bookingType', 'type', 'appointmentType', 'service', 'paymentMethod'];
    var STYLE_KEYS = ['tattooType', 'style', 'tattooStyle', 'tattooSize', 'placement'];
    var DATE_KEYS = ['date', 'appointmentDate', 'bookingDate', 'preferredDate', 'scheduledDate', 'createdAt'];
    var TIME_KEYS = ['time', 'appointmentTime', 'timeSlot'];

    // Fills the "New Bookings Feed" table and the "Upcoming Appointments" box
    // when these exist in the EJS:
    //   <tbody id="newBookingsBody"></tbody>
    //   <div id="upcomingList"></div>
    function renderUpcoming(rows) {
        var feedBody = document.getElementById('newBookingsBody');
        var upcomingBox = document.getElementById('upcomingList');

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var active = rows.filter(function (a) {
            return a.status !== 'Cancelled';
        });

        var upcoming = active.filter(function (a) {
            var d = new Date(pick(a, DATE_KEYS, ''));
            return isNaN(d.getTime()) || d >= today;
        }).sort(function (a, b) {
            return new Date(pick(a, DATE_KEYS, 0)) -
                   new Date(pick(b, DATE_KEYS, 0));
        }).slice(0, 5);

        var newest = active.slice().sort(function (a, b) {
            return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
        }).slice(0, 5);

        if (feedBody) {
            feedBody.innerHTML = newest.length ? newest.map(function (a) {
                return '<tr>' +
                    '<td>' + escapeHtml(pick(a, NAME_KEYS, 'N/A')) + '</td>' +
                    '<td>' + escapeHtml(pick(a, TYPE_KEYS, 'N/A')) + '</td>' +
                    '<td>' + escapeHtml(pick(a, STYLE_KEYS, 'N/A')) + '</td>' +
                    '<td>' + formatDate(pick(a, DATE_KEYS, '')) + ' ' +
                        escapeHtml(pick(a, TIME_KEYS, '')) + '</td>' +
                '</tr>';
            }).join('') : '<tr><td colspan="4" class="no-records">No new bookings</td></tr>';
        }

        if (upcomingBox) {
            upcomingBox.innerHTML = upcoming.length ? upcoming.map(function (a) {
                return '<div class="upcoming-item">' +
                    '<strong>' + escapeHtml(pick(a, NAME_KEYS, 'N/A')) + '</strong> ' +
                    '<span>' + formatDate(pick(a, DATE_KEYS, '')) + ' ' +
                        escapeHtml(pick(a, TIME_KEYS, '')) + '</span> ' +
                    '<span class="' + statusClass(a.status) + '">' +
                        escapeHtml(a.status || 'Pending') + '</span>' +
                '</div>';
            }).join('') : '<div class="no-records">No upcoming appointments</div>';
        }
    }

    function refreshDashboard() {
        fetch('/api/appointments/admin/all', {
            credentials: 'same-origin'
        })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Failed to fetch appointments: ' + response.status);
            }

            return response.json();
        })
        .then(function (payload) {

            if (!payload || !Array.isArray(payload.appointments)) {
                console.error('Invalid API response:', payload);
                return;
            }

            var rows = payload.appointments;

            renderStats(summarize(rows));
            renderUpcoming(rows);
            renderBookingInsight(rows);
        })
        .catch(function (error) {
            console.error('Dashboard refresh error:', error);
        });
    }

    // ---------- Hamburger menu (markup lives in dashboard.ejs) ----------
    function initHamburger() {
        var btn = document.getElementById('hamburgerBtn');
        var overlay = document.getElementById('mobileMenu');
        if (!btn || !overlay) return;

        function setOpen(isOpen) {
            btn.classList.toggle('open', isOpen);
            overlay.classList.toggle('open', isOpen);
            btn.setAttribute('aria-expanded', String(isOpen));
        }

        btn.addEventListener('click', function () {
            setOpen(!overlay.classList.contains('open'));
        });

        overlay.addEventListener('click', function (e) {
            if (e.target.closest('a') || e.target === overlay) setOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) setOpen(false);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {

        initHamburger();

        if (document.getElementById('totalAppointments')) {
            refreshDashboard();
            setInterval(refreshDashboard, REFRESH_MS);
        }

        pairs.forEach(function (pair) {
            var select = document.getElementById(pair.select);

            if (select) {
                select.addEventListener('change', window[pair.handler]);
            }
        });

        var gallerySelects = document.querySelectorAll('.gallery-select');

        Array.prototype.forEach.call(gallerySelects, function (select) {

            var figure = select.closest('.gallery-item');
            var image = figure ? figure.querySelector('.gallery-image') : null;

            if (!image) return;

            function updateImage() {
                if (select.value) {
                    image.src = imageUrl(select.value);
                }
            }

            select.addEventListener('change', updateImage);
            updateImage();
        });

    });

})();