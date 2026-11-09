// public/js/report.js
//
// Reports & Records - lahat galing sa MongoDB.
//     GET /api/appointments/admin/reports
//     GET /api/inventory   (para sa Inventory table at Total Items / In Stock / Low Stock / Out of Stock)
//
// "Reference Photos" nasa baba, katabi ng Client Records.
// May kasama na ring Hamburger Menu (mobile).

document.addEventListener('DOMContentLoaded', function () {

    var appointments = [];
    var clients = [];

    // ====== CHANGE THESE IF NEEDED ======
    var INVENTORY_URL = '/api/inventory';
    var DEFAULT_LOW_LEVEL = 5;   // gagamitin kung walang minStock ang item

    // IDs ng 4 inventory cards sa HTML mo. Unang makita ang gagamitin.
    var CARD_IDS = {
        total: ['totalItems', 'total-items', 'totalItemsCount'],
        inStock: ['inStockCount', 'inStock', 'in-stock', 'inStockItems'],
        low: ['lowStockCount', 'lowStock', 'low-stock', 'lowStockItems'],
        out: ['outOfStockCount', 'outOfStock', 'out-of-stock', 'outOfStockItems']
    };
    // ====================================

    var recordsTable = document.getElementById('recordsTable');
    var noRecords = document.getElementById('noRecords');
    var clientGrid = document.getElementById('clientGrid');
    var noClients = document.getElementById('noClients');
    var photoGrid = document.getElementById('photoGrid');
    var noPhotos = document.getElementById('noPhotos');
    var shownCount = document.getElementById('shownCount');

    var inventoryTable = document.getElementById('inventoryTable');
    var noInventory = document.getElementById('noInventory');

    var searchInput = document.getElementById('searchInput');
    var statusFilter = document.getElementById('statusFilter');

    var fromDate = document.getElementById('fromDate');
    var toDate = document.getElementById('toDate');

    var STATUS_OPTIONS = [
        'Pending',
        'Confirmed',
        'Rescheduled',
        'Completed',
        'Cancelled'
    ];

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

    function setText(id, value) {
        var el = document.getElementById(id);

        if (el) {
            el.textContent = value;
        }
    }

    // Para sa inventory cards: sumusubok ng ilang posibleng ID
    function setCard(key, value) {
        var ids = CARD_IDS[key];

        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);

            if (el) {
                el.textContent = value;
                return;
            }
        }

        console.warn('Card element not found for "' + key + '". Tried IDs: ' + ids.join(', '));
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

    // Ginagawang tamang browser path ang naka-save na reference
    function imageUrl(appointment) {
        var keys = [
            'reference', 'referencePhoto', 'referenceImage',
            'image', 'imageUrl', 'imagePath', 'photo', 'design'
        ];

        var raw = '';

        for (var i = 0; i < keys.length; i++) {
            var value = appointment[keys[i]];

            if (typeof value === 'string' && value.trim()) {
                raw = value.trim();
                break;
            }
        }

        if (!raw) {
            return '';
        }

        if (/^(data:|https?:\/\/)/i.test(raw)) {
            return raw;
        }

        var clean = raw.replace(/\\/g, '/').replace(/^\.?\/?public\//i, '');

        if (clean.charAt(0) === '/') {
            return clean;
        }

        if (clean.indexOf('/') === -1) {
            return '/uploads/' + clean;
        }

        return '/' + clean;
    }

    // ==================================================
    // HAMBURGER MENU
    // (Wag nang i-load ang /js/hamburger.js - nandito na ito)
    // ==================================================

    var hamburgerBtn = document.getElementById('hamburgerBtn');
    var mobileMenu = document.getElementById('navLinks');

    if (hamburgerBtn && mobileMenu) {
        var setMenuOpen = function (isOpen) {
            hamburgerBtn.classList.toggle('open', isOpen);
            mobileMenu.classList.toggle('open', isOpen);
            document.body.classList.toggle('menu-open', isOpen);
            hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        };

        hamburgerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setMenuOpen(!mobileMenu.classList.contains('open'));
        });

        // Isara kapag pinindot ang link o ang puting/madilim na area sa labas ng drawer
        // (kailangan ang bagong CSS kung saan full-screen overlay ang #navLinks)
        mobileMenu.addEventListener('click', function (e) {
            if (e.target.closest('a') || e.target === mobileMenu) {
                setMenuOpen(false);
            }
        });

        // Backup: kahit saan sa labas ng menu at ng hamburger = isara
        document.addEventListener('click', function (e) {
            if (!mobileMenu.classList.contains('open')) {
                return;
            }

            if (mobileMenu.contains(e.target) || hamburgerBtn.contains(e.target)) {
                return;
            }

            setMenuOpen(false);
        });

        // Isara gamit ang Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                setMenuOpen(false);
            }
        });

        // Isara kapag lumaki na ang screen (desktop)
        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) {
                setMenuOpen(false);
            }
        });
    }

    // ==================================================
    // INVENTORY (table + summary cards)
    // ==================================================

    function qtyOf(item) {
        var n = Number(item.quantity !== undefined ? item.quantity : item.stock);
        return isNaN(n) ? 0 : n;
    }

    // Ginagamit pa rin para sa Low Stock / Out of Stock status (hindi na ipinapakita sa table)
    function lowLevelOf(item) {
        var n = Number(
            item.minStock !== undefined ? item.minStock :
            item.lowStockLevel !== undefined ? item.lowStockLevel :
            item.reorderLevel
        );

        return isNaN(n) ? DEFAULT_LOW_LEVEL : n;
    }

    // Returns: 'out' | 'low' | 'in'
    function stockKeyOf(item) {
        var qty = qtyOf(item);

        if (qty <= 0) {
            return 'out';
        }

        if (qty <= lowLevelOf(item)) {
            return 'low';
        }

        return 'in';
    }

    var STOCK_LABELS = {
        in: 'In Stock',
        low: 'Low Stock',
        out: 'Out of Stock'
    };

    function renderInventoryTable(list) {
        if (!inventoryTable) {
            return;
        }

        if (noInventory) {
            noInventory.style.display = list.length ? 'none' : 'block';
        }

        inventoryTable.innerHTML = list.map(function (item) {
            var key = stockKeyOf(item);

            var name = item.name || item.itemName || item.item || '';
            var category = item.category || '';

            return '<tr>' +
                '<td>' + escapeHtml(name) + '</td>' +
                '<td>' + escapeHtml(category) + '</td>' +
                '<td>' + qtyOf(item) + '</td>' +
                '<td><span class="stock-badge stock-' + key + '">' +
                    STOCK_LABELS[key] + '</span></td>' +
            '</tr>';
        }).join('');
    }

    function renderInventory(items) {
        var list = items || [];
        var inStock = 0;
        var low = 0;
        var out = 0;

        list.forEach(function (item) {
            var key = stockKeyOf(item);

            if (key === 'out') {
                out++;
            } else if (key === 'low') {
                low++;
            } else {
                inStock++;
            }
        });

        setCard('total', list.length);
        setCard('inStock', inStock);
        setCard('low', low);
        setCard('out', out);

        renderInventoryTable(list);
    }

    function loadInventory() {
        return request(INVENTORY_URL)
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (data.success === false) {
                    console.error('Inventory error:', data.message);
                    return;
                }

                // Tanggap: { items: [] } , { inventory: [] } o plain array
                var items = Array.isArray(data)
                    ? data
                    : (data.items || data.inventory || []);

                console.log('Inventory loaded:', items.length, 'items');

                renderInventory(items);
            })
            .catch(function (error) {
                console.error('Error loading inventory:', error);
            });
    }

    // ==================================================
    // FILTER
    // ==================================================

    function filtered() {
        var term = (searchInput && searchInput.value || '').trim().toLowerCase();
        var status = statusFilter && statusFilter.value || 'all';
        var from = fromDate && fromDate.value ? new Date(fromDate.value) : null;
        var to = toDate && toDate.value ? new Date(toDate.value) : null;

        if (to) {
            to.setHours(23, 59, 59, 999);
        }

        return appointments.filter(function (a) {
            if (status !== 'all' && a.status !== status) {
                return false;
            }

            var when = new Date(a.date);

            if (from && when < from) {
                return false;
            }

            if (to && when > to) {
                return false;
            }

            if (!term) {
                return true;
            }

            return [a.clientName, a.phone, a.artist, a.tattooType]
                .join(' ')
                .toLowerCase()
                .indexOf(term) !== -1;
        });
    }

    // ==================================================
    // RENDER
    // ==================================================

    function renderSummary(summary) {
        var s = summary || {};

        setText('totalAppointments', s.totalAppointments || 0);
        setText('totalClients', s.totalClients || 0);
        setText('totalPending', s.pending || 0);
        setText('totalCompleted', s.completed || 0);
    }

    function renderRecords() {
        if (!recordsTable) {
            return;
        }

        var rows = filtered();

        if (shownCount) {
            shownCount.textContent = 'Showing ' + rows.length + ' of ' + appointments.length;
        }

        if (noRecords) {
            noRecords.style.display = rows.length ? 'none' : 'block';
        }

        recordsTable.innerHTML = rows.map(function (a) {
            var status = a.status || 'Pending';
            var payment = a.payment || 'Unpaid';

            return '<tr>' +
                '<td>' + escapeHtml(a.clientName) + '</td>' +
                '<td>' + escapeHtml(a.phone) + '</td>' +
                '<td>' + formatDate(a.date) + '</td>' +
                '<td>' + escapeHtml(a.time) + '</td>' +
                '<td>' + escapeHtml(a.tattooType) + '</td>' +
                '<td><span class="payment payment-' + payment.toLowerCase() + '">' +
                    escapeHtml(payment) + '</span></td>' +
                '<td>' +
                    '<select class="status-select status-' + status.toLowerCase() + '" ' +
                        'data-id="' + escapeHtml(a._id) + '">' +
                        STATUS_OPTIONS.map(function (option) {
                            return '<option value="' + option + '"' +
                                (option === status ? ' selected' : '') + '>' +
                                option + '</option>';
                        }).join('') +
                    '</select>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    function renderClients() {
        if (!clientGrid) {
            return;
        }

        if (noClients) {
            noClients.style.display = clients.length ? 'none' : 'block';
        }

        clientGrid.innerHTML = clients.map(function (c) {
            var initial = (c.name || '?').charAt(0).toUpperCase();

            return '<div class="client-card">' +
                '<div class="client-avatar">' + escapeHtml(initial) + '</div>' +
                '<div class="client-info">' +
                    '<strong>' + escapeHtml(c.name) + '</strong>' +
                    '<span>' + escapeHtml(c.phone) + '</span>' +
                    '<small>' + c.count + ' Appointments</small>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // Reference photos ng lahat ng appointment - nasa baba, katabi ng Client Records
    function renderPhotos() {
        if (!photoGrid) {
            return;
        }

        var withPhotos = filtered()
            .map(function (a) {
                return { appointment: a, url: imageUrl(a) };
            })
            .filter(function (item) {
                return item.url;
            });

        if (noPhotos) {
            noPhotos.style.display = withPhotos.length ? 'none' : 'block';
        }

        photoGrid.innerHTML = withPhotos.map(function (item) {
            var a = item.appointment;

            return '<figure class="photo-item">' +
                '<img src="' + escapeHtml(item.url) + '" alt="Reference photo" ' +
                    'data-full="' + escapeHtml(item.url) + '">' +
                '<figcaption>' +
                    '<strong>' + escapeHtml(a.clientName) + '</strong>' +
                    '<span>' + escapeHtml(a.tattooType) + ' &middot; ' + formatDate(a.date) + '</span>' +
                '</figcaption>' +
            '</figure>';
        }).join('');
    }

    function renderAll() {
        renderRecords();
        renderPhotos();
    }

    // ==================================================
    // STATUS UPDATE - kapag "Completed", nagbabawas ng inventory ang server
    // ==================================================

    if (recordsTable) {
        recordsTable.addEventListener('change', function (event) {
            var select = event.target;

            if (!select.classList.contains('status-select')) {
                return;
            }

            var id = select.dataset.id;
            var status = select.value;

            select.disabled = true;

            request('/api/appointments/' + id + '/status', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status })
            }).then(function (data) {
                select.disabled = false;

                if (!data) {
                    return;
                }

                if (!data.success) {
                    window.alert(data.message || 'Failed to update status.');
                    load();
                    return;
                }

                appointments.forEach(function (a) {
                    if (String(a._id) === String(id)) {
                        a.status = status;
                    }
                });

                renderAll();

                if (status === 'Completed') {
                    // Nabawasan na ang stock sa server -> i-refresh ang inventory table at cards
                    loadInventory();
                    // I-refresh din ang Pending/Completed counts
                    load();

                    document.dispatchEvent(new CustomEvent('appointment:completed', {
                        detail: { appointmentId: id }
                    }));
                }
            }).catch(function (error) {
                select.disabled = false;
                console.error('Error updating status:', error);
            });
        });
    }

    // ==================================================
    // IMAGE MODAL
    // ==================================================

    if (photoGrid) {
        photoGrid.addEventListener('click', function (event) {
            var img = event.target.closest('img[data-full]');

            if (!img) {
                return;
            }

            var modal = document.getElementById('imageModal');
            var preview = document.getElementById('imagePreview');

            if (modal && preview) {
                preview.src = img.getAttribute('data-full');
                modal.style.display = 'flex';
            } else {
                window.open(img.getAttribute('data-full'), '_blank');
            }
        });
    }

    var closeImage = document.getElementById('closeImageModal');

    if (closeImage) {
        closeImage.addEventListener('click', function () {
            document.getElementById('imageModal').style.display = 'none';
        });
    }

    // ==================================================
    // LOAD
    // ==================================================

    function load() {
        return request('/api/appointments/admin/reports')
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (!data.success) {
                    console.error(data.message);
                    return;
                }

                appointments = data.appointments || [];
                clients = data.clients || [];

                renderSummary(data.summary);
                renderClients();
                renderAll();

                // Kung kasama na sa reports response ang inventory, gamitin agad
                if (Array.isArray(data.inventory) || Array.isArray(data.items)) {
                    renderInventory(data.inventory || data.items);
                }
            })
            .catch(function (error) {
                console.error('Error loading reports:', error);
            });
    }

    // ==================================================
    // CONTROLS
    // ==================================================

    [searchInput, statusFilter, fromDate, toDate].forEach(function (el) {
        if (el) {
            el.addEventListener('input', renderAll);
            el.addEventListener('change', renderAll);
        }
    });

    var clearFilters = document.getElementById('clearFilters');

    if (clearFilters) {
        clearFilters.addEventListener('click', function () {
            if (searchInput) { searchInput.value = ''; }
            if (statusFilter) { statusFilter.value = 'all'; }
            if (fromDate) { fromDate.value = ''; }
            if (toDate) { toDate.value = ''; }

            renderAll();
        });
    }

    var refreshBtn = document.getElementById('refreshBtn');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
            load();
            loadInventory();
        });
    }

    var printBtn = document.getElementById('printBtn');

    if (printBtn) {
        printBtn.addEventListener('click', function () {
            window.print();
        });
    }

    var exportBtn = document.getElementById('exportBtn');

    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            var header = ['Client', 'Contact', 'Date', 'Time', 'Tattoo Type', 'Payment', 'Status'];

            var lines = [header].concat(filtered().map(function (a) {
                return [
                    a.clientName || '',
                    a.phone || '',
                    formatDate(a.date),
                    a.time || '',
                    a.tattooType || '',
                    a.payment || 'Unpaid',
                    a.status || 'Pending'
                ];
            }));

            var csv = lines.map(function (row) {
                return row.map(function (cell) {
                    return '"' + String(cell).replace(/"/g, '""') + '"';
                }).join(',');
            }).join('\n');

            var link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            link.download = 'appointment-records.csv';
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    // ==================================================
    // LOGO - pindutin ang "Totats Skin Art Tattoo" para pumunta sa Dashboard
    // ==================================================

    var logo = document.querySelector('.logo');

    if (logo) {
        logo.setAttribute('role', 'link');
        logo.setAttribute('tabindex', '0');

        logo.addEventListener('click', function () {
            window.location.href = '/dashboard';
        });

        logo.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                window.location.href = '/dashboard';
            }
        });
    }

    // ==================================================
    // INIT
    // ==================================================

    load();
    loadInventory();
});