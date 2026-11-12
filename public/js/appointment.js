// ======================================================
// APPOINTMENTS - loaded from MongoDB via /api/appointments
// Allowed appointment hours: 8:00 AM to 5:00 PM (Philippine Time)
// ======================================================

let appointments = [];
let rescheduleId = null;

const tableBody = document.getElementById('appointmentTable');
const totalBox = document.getElementById('totalAppointments');
const noAppointments = document.getElementById('noAppointments');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const rescheduleForm = document.getElementById('rescheduleForm');


// ======================================================
// HELPERS
// ======================================================

const PH_TIMEZONE = 'Asia/Manila';
const OPEN_TIME = '08:00';
const CLOSE_TIME = '17:00';

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

function showModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('show');
        el.style.display = 'flex';
    }
}

function hideModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('show');
        el.style.display = 'none';
    }
}

function isWithinBusinessHours(time) {
    return Boolean(time) && time >= OPEN_TIME && time <= CLOSE_TIME;
}

// Fills a <select> with time slots from 8:00 AM to 5:00 PM only
function populateTimeOptions(select, stepMinutes) {

    const step = stepMinutes || 30;
    const startMinutes = 8 * 60;
    const endMinutes = 17 * 60;

    let html = '';

    for (let m = startMinutes; m <= endMinutes; m += step) {

        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const value = hh + ':' + mm;

        html += '<option value="' + value + '">' + formatTime(value) + '</option>';
    }

    select.innerHTML = html;
}

// Current date and time in the Philippines, regardless of the device's timezone
function getPhilippineNow() {

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PH_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const get = function (type) {
        return parts.find(function (p) { return p.type === type; }).value;
    };

    const hour = get('hour') === '24' ? '00' : get('hour');

    return {
        date: get('year') + '-' + get('month') + '-' + get('day'),
        time: hour + ':' + get('minute')
    };
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(value) {

    if (!value) {
        return '';
    }

    const parts = value.split('-');
    const date = new Date(parts[0], Number(parts[1]) - 1, parts[2]);

    if (isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(value) {

    if (!value) {
        return '';
    }

    const parts = value.split(':');
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour >= 12 ? 'PM' : 'AM';

    hour = hour % 12;

    if (hour === 0) {
        hour = 12;
    }

    return hour + ':' + minute + ' ' + suffix;
}

function showMessage(title, text, isError) {

    setText('messageIcon', isError ? '!' : '✓');
    setText('messageTitle', title);
    setText('messageText', text);
    showModal('messageModal');
}

function closeMessage() {
    hideModal('messageModal');
}


// ======================================================
// LOAD FROM DATABASE
// ======================================================

async function loadAppointments() {

    if (!tableBody) {
        return;
    }

    try {

        const response = await fetch('/api/appointments');
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load appointments');
        }

        appointments = data.appointments;

        renderAppointments();

    } catch (error) {

        console.error('Load appointments error:', error);

        tableBody.innerHTML = '';

        if (noAppointments) {
            noAppointments.textContent = 'Could not load appointments from the server.';
            noAppointments.style.display = 'block';
        }
    }
}


// ======================================================
// RENDER
// ======================================================

function getFiltered() {

    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const status = statusFilter ? statusFilter.value : 'all';
    const date = dateFilter ? dateFilter.value : '';

    return appointments.filter(function (item) {

        if (search && item.client.toLowerCase().indexOf(search) === -1) {
            return false;
        }

        if (status !== 'all' && item.status !== status) {
            return false;
        }

        if (date && item.date !== date) {
            return false;
        }

        return true;
    });
}

function renderAppointments() {

    if (!tableBody) {
        return;
    }

    const rows = getFiltered();

    if (totalBox) {
        totalBox.textContent = rows.length;
    }

    if (rows.length === 0) {
        tableBody.innerHTML = '';

        if (noAppointments) {
            noAppointments.textContent = 'No appointments found.';
            noAppointments.style.display = 'block';
        }
        return;
    }

    if (noAppointments) {
        noAppointments.style.display = 'none';
    }

    tableBody.innerHTML = rows.map(function (item) {

        const statusClass = item.status.toLowerCase();

        let actions = '';

        if (item.status === 'Pending') {
            actions += '<button class="confirm-btn" onclick="confirmAppointment(this)">Confirm</button>';
        }

        if (item.status !== 'Cancelled') {
            actions += '<button class="reschedule-btn" onclick="openReschedule(this)">Reschedule</button>';
            actions += '<button class="cancel-btn" onclick="cancelAppointment(this)">Cancel</button>';
        }

        return '' +
            '<tr data-id="' + item._id + '"' +
            ' data-client="' + escapeHtml(item.client) + '"' +
            ' data-artist="' + escapeHtml(item.artist) + '"' +
            ' data-date="' + escapeHtml(item.date) + '"' +
            ' data-time="' + escapeHtml(item.time) + '"' +
            ' data-status="' + escapeHtml(item.status) + '">' +
                '<td><strong>' + escapeHtml(item.client) + '</strong></td>' +
                '<td>' + escapeHtml(item.contact) + '</td>' +
                '<td>' + escapeHtml(item.artist) + '</td>' +
                '<td>' + formatDate(item.date) + '</td>' +
                '<td>' + formatTime(item.time) + '</td>' +
                '<td>' + escapeHtml(item.service) + '</td>' +
                '<td><span class="status ' + statusClass + '">' + escapeHtml(item.status) + '</span></td>' +
                '<td class="actions">' + actions + '</td>' +
            '</tr>';

    }).join('');
}


// ======================================================
// ACTIONS
// ======================================================

function rowId(button) {
    return button.closest('tr').dataset.id;
}

async function updateStatus(id, status) {

    const response = await fetch('/api/appointments/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Update failed');
    }

    return data.appointment;
}

async function confirmAppointment(button) {

    try {
        await updateStatus(rowId(button), 'Confirmed');
        await loadAppointments();
        showMessage('Appointment Confirmed', 'The appointment has been confirmed.', false);
    } catch (error) {
        showMessage('Update Failed', error.message, true);
    }
}

async function cancelAppointment(button) {

    if (!confirm('Cancel this appointment?')) {
        return;
    }

    try {
        await updateStatus(rowId(button), 'Cancelled');
        await loadAppointments();
        showMessage('Appointment Cancelled', 'The appointment has been cancelled.', false);
    } catch (error) {
        showMessage('Update Failed', error.message, true);
    }
}


// ======================================================
// RESCHEDULE MODAL
// ======================================================

function openReschedule(button) {

    const row = button.closest('tr');

    rescheduleId = row.dataset.id;

    setText('modalClient', row.dataset.client);
    setText('modalArtist', row.dataset.artist);

    const newDate = document.getElementById('newDate');
    const newTime = document.getElementById('newTime');

    if (newDate) {
        newDate.min = getPhilippineNow().date;
        newDate.value = row.dataset.date;
    }

    if (newTime) {

        if (newTime.tagName === 'SELECT') {
            populateTimeOptions(newTime, 30);
        } else {
            newTime.min = OPEN_TIME;
            newTime.max = CLOSE_TIME;
        }

        // Always start at 8:00 AM when the modal opens
        newTime.value = OPEN_TIME;
    }

    setText('conflictMessage', '');

    showModal('rescheduleModal');
}

function closeReschedule() {

    rescheduleId = null;

    hideModal('rescheduleModal');
}

if (rescheduleForm) {

    rescheduleForm.addEventListener('submit', async function (e) {

        e.preventDefault();

        const conflictMessage = document.getElementById('conflictMessage');

        function setConflict(text) {
            if (conflictMessage) {
                conflictMessage.textContent = text;
            }
        }

        setConflict('');

        const newDateValue = document.getElementById('newDate').value;
        const newTimeValue = document.getElementById('newTime').value;
        const now = getPhilippineNow();

        if (!isWithinBusinessHours(newTimeValue)) {
            setConflict('Appointments are only available from 8:00 AM to 5:00 PM (Philippine Time).');
            return;
        }

        if (newDateValue < now.date || (newDateValue === now.date && newTimeValue <= now.time)) {
            setConflict('Please choose a date and time that has not passed yet (Philippine Time).');
            return;
        }

        try {

            const response = await fetch('/api/clientappointment/' + rescheduleId + '/reschedule', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: newDateValue,
                    time: newTimeValue
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                setConflict(data.message || 'Reschedule failed.');
                return;
            }

            closeReschedule();
            await loadAppointments();
            showMessage('Appointment Updated', 'The appointment has been rescheduled.', false);

        } catch (error) {
            setConflict('Something went wrong. Please try again.');
        }
    });
}


// ======================================================
// FILTERS + INITIAL LOAD
// ======================================================

if (searchInput) {
    searchInput.addEventListener('input', renderAppointments);
}

if (statusFilter) {
    statusFilter.addEventListener('change', renderAppointments);
}

if (dateFilter) {
    dateFilter.addEventListener('change', renderAppointments);
}

loadAppointments();