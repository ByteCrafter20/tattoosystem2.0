// users.js
// User Management - admin / owner / tattoo artist accounts.
// Expected API:
//   GET    /api/users        -> { success, users: [...] }
//   POST   /api/users        -> { success, message }
//   PUT    /api/users/:id    -> { success, message }
//   DELETE /api/users/:id    -> { success, message }
// The password must never be returned by the server.

document.addEventListener('DOMContentLoaded', function () {

    var currentUserId = document.body.getAttribute('data-user-id') || '';

    var ROLE_LABELS = {
        admin: 'Admin',
        owner: 'Owner',
        tattooartist: 'Tattoo Artist'
    };

    var users = [];

    // Elements
    var usersBody = document.getElementById('usersBody');
    var noUsers = document.getElementById('noUsers');

    var searchInput = document.getElementById('searchInput');
    var roleFilter = document.getElementById('roleFilter');
    var statusFilter = document.getElementById('statusFilter');

    var modal = document.getElementById('userModal');
    var form = document.getElementById('userForm');
    var formError = document.getElementById('formError');
    var modalTitle = document.getElementById('modalTitle');
    var modalSubtitle = document.getElementById('modalSubtitle');
    var passwordHint = document.getElementById('passwordHint');
    var saveBtn = document.getElementById('saveUserBtn');

    var addUserBtn = document.getElementById('addUserBtn');
    var closeModalBtn = document.getElementById('closeModalBtn');
    var cancelModalBtn = document.getElementById('cancelModalBtn');

    var fields = {
        id: document.getElementById('userId'),
        fullName: document.getElementById('fullName'),
        username: document.getElementById('username'),
        email: document.getElementById('email'),
        contact: document.getElementById('contact'),
        role: document.getElementById('userRole'),
        status: document.getElementById('userStatus'),
        password: document.getElementById('password')
    };

    if (!usersBody) {
        return;
    }

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

    function request(url, options) {
        var opts = options || {};
        opts.credentials = 'same-origin';

        return fetch(url, opts).then(function (response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            return response.text().then(function (body) {
                try {
                    return JSON.parse(body);
                } catch (e) {
                    console.error('Non-JSON response from ' + url + ' (HTTP ' + response.status + '):',
                        body.slice(0, 500));
                    return {
                        success: false,
                        message: 'Server error (HTTP ' + response.status + ').'
                    };
                }
            });
        });
    }

    function jsonRequest(url, method, payload) {
        return request(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    function getId(user) {
        return user._id || user.id;
    }

    function initials(name) {
        var parts = String(name || '?').trim().split(/\s+/);
        var first = parts[0] ? parts[0].charAt(0) : '?';
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    // ==================================================
    // RENDER
    // ==================================================

    function updateSummary() {
        function count(role) {
            return users.filter(function (u) { return u.role === role; }).length;
        }

        setText('countTotal', users.length);
        setText('countAdmin', count('admin'));
        setText('countOwner', count('owner'));
        setText('countArtist', count('tattooartist'));
    }

    function getFiltered() {
        var term = searchInput ? searchInput.value.trim().toLowerCase() : '';
        var role = roleFilter ? roleFilter.value : 'all';
        var status = statusFilter ? statusFilter.value : 'all';

        return users.filter(function (u) {
            var matchesTerm = !term ||
                String(u.fullName || '').toLowerCase().indexOf(term) !== -1 ||
                String(u.username || '').toLowerCase().indexOf(term) !== -1 ||
                String(u.email || '').toLowerCase().indexOf(term) !== -1 ||
                String(u.contact || '').toLowerCase().indexOf(term) !== -1;

            var matchesRole = role === 'all' || u.role === role;
            var matchesStatus = status === 'all' || (u.status || 'active') === status;

            return matchesTerm && matchesRole && matchesStatus;
        });
    }

    function render() {
        var list = getFiltered();

        if (noUsers) {
            noUsers.style.display = list.length ? 'none' : 'block';
        }

        usersBody.innerHTML = list.map(function (u) {
            var id = escapeHtml(getId(u));
            var status = u.status === 'inactive' ? 'inactive' : 'active';
            var isSelf = currentUserId && String(getId(u)) === String(currentUserId);
            var sub = u.username ? '@' + u.username + ' · ' + (u.email || '') : (u.email || '');

            return '<tr>' +
                '<td>' +
                    '<div class="user-cell">' +
                        '<span class="avatar">' + escapeHtml(initials(u.fullName)) + '</span>' +
                        '<div>' +
                            '<strong>' + escapeHtml(u.fullName) + (isSelf ? ' (You)' : '') + '</strong>' +
                            '<small>' + escapeHtml(sub) + '</small>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
                '<td>' + escapeHtml(u.contact || '-') + '</td>' +
                '<td><span class="badge role-' + escapeHtml(u.role) + '">' +
                    escapeHtml(ROLE_LABELS[u.role] || u.role) + '</span></td>' +
                '<td><span class="badge status-' + status + '">' +
                    (status === 'active' ? 'Active' : 'Inactive') + '</span></td>' +
                '<td>' +
                    '<div class="actions">' +
                        '<button type="button" class="edit-btn" data-action="edit" data-id="' + id + '">Edit</button>' +
                        (isSelf ? '' :
                            '<button type="button" class="toggle-btn" data-action="toggle" data-id="' + id + '">' +
                                (status === 'active' ? 'Deactivate' : 'Activate') + '</button>' +
                            '<button type="button" class="delete-btn" data-action="delete" data-id="' + id + '">Delete</button>') +
                    '</div>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // ==================================================
    // LOAD
    // ==================================================

    function load() {
        return request('/api/users')
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (!data.success) {
                    console.error(data.message);
                    alert(data.message || 'Unable to load users.');
                    return;
                }

                users = data.users || [];
                updateSummary();
                render();
            })
            .catch(function (error) {
                console.error('Error loading users:', error);
            });
    }

    // ==================================================
    // MODAL
    // ==================================================

    function showError(message) {
        if (!formError) {
            return;
        }
        formError.textContent = message;
        formError.style.display = message ? 'block' : 'none';
    }

    function openModal(user) {
        if (!modal || !form) {
            console.error('User modal or form not found in the HTML (#userModal / #userForm).');
            return;
        }

        form.reset();
        showError('');

        if (user) {
            modalTitle.textContent = 'Edit User';
            modalSubtitle.textContent = 'Update account details or change the role.';
            passwordHint.textContent = 'Leave blank to keep the current password.';

            fields.id.value = getId(user);
            fields.fullName.value = user.fullName || '';
            if (fields.username) { fields.username.value = user.username || ''; }
            fields.email.value = user.email || '';
            fields.contact.value = user.contact || '';
            fields.role.value = user.role || 'tattooartist';
            fields.status.value = user.status === 'inactive' ? 'inactive' : 'active';
        } else {
            modalTitle.textContent = 'Add User';
            modalSubtitle.textContent = 'Create a new account and choose its role.';
            passwordHint.textContent = 'Required for new users.';

            fields.id.value = '';
            fields.role.value = 'tattooartist';
            fields.status.value = 'active';
        }

        modal.classList.add('active');
        fields.fullName.focus();
    }

    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
        }
    }

    if (addUserBtn) {
        addUserBtn.addEventListener('click', function () { openModal(null); });
    } else {
        console.error('#addUserBtn not found in the HTML.');
    }

    if (closeModalBtn) { closeModalBtn.addEventListener('click', closeModal); }
    if (cancelModalBtn) { cancelModalBtn.addEventListener('click', closeModal); }

    if (modal) {
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    // ==================================================
    // SAVE (ADD / EDIT)
    // ==================================================

    if (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            showError('');

            var id = fields.id.value;
            var password = fields.password.value;

            var payload = {
                fullName: fields.fullName.value.trim(),
                email: fields.email.value.trim().toLowerCase(),
                contact: fields.contact.value.trim(),
                role: fields.role.value,
                status: fields.status.value
            };

            if (fields.username) {
                payload.username = fields.username.value.trim();
            }

            if (!payload.fullName) {
                showError('Full name is required.');
                return;
            }

            if (fields.username && !payload.username) {
                showError('Username is required.');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
                showError('Please enter a valid email address.');
                return;
            }

            if (!id && password.length < 6) {
                showError('Password must be at least 6 characters.');
                return;
            }

            if (id && password && password.length < 6) {
                showError('New password must be at least 6 characters.');
                return;
            }

            if (password) {
                payload.password = password;
            }

            saveBtn.disabled = true;

            var url = id ? '/api/users/' + encodeURIComponent(id) : '/api/users';
            var method = id ? 'PUT' : 'POST';

            jsonRequest(url, method, payload)
                .then(function (data) {
                    saveBtn.disabled = false;

                    if (!data) {
                        return;
                    }

                    if (!data.success) {
                        showError(data.message || 'Unable to save user.');
                        return;
                    }

                    closeModal();
                    load();
                })
                .catch(function (error) {
                    console.error('Error saving user:', error);
                    saveBtn.disabled = false;
                    showError('An error occurred. Please try again.');
                });
        });
    }

    // ==================================================
    // TABLE ACTIONS (EDIT / TOGGLE / DELETE)
    // ==================================================

    function findUser(id) {
        for (var i = 0; i < users.length; i++) {
            if (String(getId(users[i])) === String(id)) {
                return users[i];
            }
        }
        return null;
    }

    usersBody.addEventListener('click', function (event) {
        var button = event.target.closest('[data-action]');

        if (!button) {
            return;
        }

        var user = findUser(button.getAttribute('data-id'));
        var action = button.getAttribute('data-action');

        if (!user) {
            return;
        }

        if (action === 'edit') {
            openModal(user);
            return;
        }

        if (action === 'toggle') {
            var nextStatus = user.status === 'inactive' ? 'active' : 'inactive';

            if (!confirm((nextStatus === 'inactive' ? 'Deactivate ' : 'Activate ') + user.fullName + '?')) {
                return;
            }

            jsonRequest('/api/users/' + encodeURIComponent(getId(user)), 'PUT', { status: nextStatus })
                .then(function (data) {
                    if (!data) {
                        return;
                    }

                    if (!data.success) {
                        alert(data.message || 'Update failed.');
                        return;
                    }

                    load();
                })
                .catch(function (error) {
                    console.error('Error updating status:', error);
                    alert('An error occurred. Please try again.');
                });
            return;
        }

        if (action === 'delete') {
            if (!confirm('Delete ' + user.fullName + '? This cannot be undone.')) {
                return;
            }

            request('/api/users/' + encodeURIComponent(getId(user)), { method: 'DELETE' })
                .then(function (data) {
                    if (!data) {
                        return;
                    }

                    if (!data.success) {
                        alert(data.message || 'Delete failed.');
                        return;
                    }

                    load();
                })
                .catch(function (error) {
                    console.error('Error deleting user:', error);
                    alert('An error occurred. Please try again.');
                });
        }
    });

    // ==================================================
    // FILTERS
    // ==================================================

    if (searchInput) { searchInput.addEventListener('input', render); }
    if (roleFilter) { roleFilter.addEventListener('change', render); }
    if (statusFilter) { statusFilter.addEventListener('change', render); }

    // ==================================================
    // INIT
    // ==================================================

    load();
});