// public/js/inventory.js
// Inventory page: loads items from /api/inventory, filtering, add modal.
// Category <-> Item Name are linked both ways:
//   - picking a Category filters the Item Name list
//   - picking an Item Name auto-selects its Category

var API_URL = '/api/inventory';
var CURRENT_ITEMS = []; // keeps the last-loaded inventory, used to detect existing items

var ITEMS_BY_CATEGORY = {
    Needles: [
        '7RL', '9RL', '11RL',
        '5RS', '7RS', '9RS',
        '11CM', '13CM',
    ],
    Ink: [
        'Black', 'White', 'Gray', 'Red', 'Blue', 'Green',
        'Yellow', 'Purple', 'Pink'
    ],
    Machines: [
        'Pen Tattoo Machine',
    ],
    Accessories: [
        'Disposable Grip Tape', 'Tape',
        'Ink Cups', 'Stencil Paper', 'Stencil Gel',
    ],
    Sanitation: [
        'Plastic Gloves', 'Ointment', 'Foam Wash', 'Alcohol Spray',
        'Cling Wrap', 'Paper Towel', 'Baby Wipes',
    ],
    Other: []
};

// Categories where the item is fixed, so it is picked automatically.
var AUTO_SELECT_ITEM = {
    Gloves: 'Plastic Gloves',
    Ointment: 'Ointment'
};

// Every field name the minimum stock might be stored under on the server.
var MIN_STOCK_KEYS = [
    'reorderLevel', 'reorderPoint', 'reorderQuantity',
    'minimumStock', 'minStock', 'minimumStockLevel', 'minStockLevel',
    'minimumQuantity', 'minQuantity', 'minLevel', 'minimum', 'min',
    'lowStockThreshold', 'lowStockLevel', 'threshold', 'stockThreshold'
];

// In-page toast notification (replaces browser alert()).
// Injects its own container/styles once, so no HTML/CSS changes are needed.
function showNotification(message, type) {
    type = type || 'error'; // 'error' | 'success' | 'info'

    var container = document.getElementById('appNotifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'appNotifications';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }

    var colors = {
        error: { bg: '#fdecea', border: '#f5c2c0', text: '#b33c3c' },
        success: { bg: '#e9f7ef', border: '#b7e4c7', text: '#1e7a46' },
        info: { bg: '#eaf2fb', border: '#bcd6f5', text: '#2f5f9e' }
    };
    var palette = colors[type] || colors.info;

    var toast = document.createElement('div');
    toast.textContent = message;
    toast.style.background = palette.bg;
    toast.style.border = '1px solid ' + palette.border;
    toast.style.color = palette.text;
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    toast.style.fontSize = '14px';
    toast.style.maxWidth = '320px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';

    container.appendChild(toast);
    requestAnimationFrame(function () {
        toast.style.opacity = '1';
    });

    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () {
            toast.remove();
        }, 200);
    }, 4000);
}

// Inline error shown inside the Add Inventory modal.
function showModalError(message) {
    var form = document.getElementById('inventoryForm');
    var box = document.getElementById('inventoryFormError');

    if (!box) {
        box = document.createElement('div');
        box.id = 'inventoryFormError';
        box.style.background = '#fdecea';
        box.style.border = '1px solid #f5c2c0';
        box.style.color = '#b33c3c';
        box.style.padding = '10px 14px';
        box.style.borderRadius = '6px';
        box.style.fontSize = '14px';
        box.style.margin = '12px 0';

        // Place it right above the buttons row.
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn && submitBtn.parentNode) {
            submitBtn.parentNode.parentNode.insertBefore(box, submitBtn.parentNode);
        } else {
            form.appendChild(box);
        }
    }

    box.textContent = message;
    box.style.display = 'block';
}

function clearModalError() {
    var box = document.getElementById('inventoryFormError');
    if (box) {
        box.style.display = 'none';
        box.textContent = '';
    }
}

// Locks (or unlocks) the fields and the Save button in the Add Inventory modal.
function setFormLocked(locked) {
    var form = document.getElementById('inventoryForm');
    var ids = ['itemQuantity', 'minimumStock', 'itemSupplier'];

    ids.forEach(function (id) {
        var input = document.getElementById(id);
        if (input) {
            input.disabled = locked;
            input.style.opacity = locked ? '0.5' : '';
            input.style.cursor = locked ? 'not-allowed' : '';
        }
    });

    var saveBtn = form.querySelector('button[type="submit"]');
    if (saveBtn) {
        saveBtn.disabled = locked;
        saveBtn.style.opacity = locked ? '0.5' : '';
        saveBtn.style.cursor = locked ? 'not-allowed' : '';
    }
}

// Shows "already on the list" inside the modal as soon as the chosen
// item exists in the inventory, and locks Quantity, Minimum Stock Level
// and Save. Unlocks everything otherwise.
// Returns true when the item already exists.
function checkExistingItem() {
    var name = getItemName();
    var existing = name ? findExistingItem(name) : null;

    if (existing) {
        showModalError(existing.name + ' is already on the list');
        setFormLocked(true);
        return true;
    }

    clearModalError();
    setFormLocked(false);
    return false;
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
}

// Minimum stock can come back under different field names depending on
// the database model. Try the known names first, then scan every field
// whose name looks like a minimum / reorder / threshold. Falls back to 0.
function getMinStock(item) {
    var i;

    for (i = 0; i < MIN_STOCK_KEYS.length; i++) {
        var value = item[MIN_STOCK_KEYS[i]];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    var keys = Object.keys(item);
    for (i = 0; i < keys.length; i++) {
        if (/min|reorder|threshold/i.test(keys[i])) {
            var found = item[keys[i]];
            if (found !== undefined && found !== null && found !== '' && typeof found !== 'object') {
                return found;
            }
        }
    }

    return 0;
}

function categoryOfItem(item) {
    for (var category in ITEMS_BY_CATEGORY) {
        if (ITEMS_BY_CATEGORY[category].indexOf(item) !== -1) {
            return category;
        }
    }
    return '';
}

function addOption(parent, value, label) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    parent.appendChild(option);
}

// Rebuilds the Item Name dropdown from the selected category.
function populateItemNames() {
    var categorySelect = document.getElementById('itemCategory');
    var itemSelect = document.getElementById('itemName');
    var itemOther = document.getElementById('itemNameOther');

    var category = categorySelect.value;
    var previous = itemSelect.value;

    if (category === 'Other') {
        itemSelect.style.display = 'none';
        itemSelect.required = false;
        itemSelect.innerHTML = '';
        itemOther.style.display = '';
        itemOther.required = true;
        return;
    }

    itemOther.style.display = 'none';
    itemOther.required = false;
    itemOther.value = '';

    itemSelect.style.display = '';
    itemSelect.required = true;
    itemSelect.innerHTML = '';
    addOption(itemSelect, '', 'Select Item Name');

    if (category) {
        ITEMS_BY_CATEGORY[category].forEach(function (item) {
            addOption(itemSelect, item, item);
        });
    } else {
        // No category chosen yet: show every item grouped, so picking an
        // item name is enough and the category follows.
        Object.keys(ITEMS_BY_CATEGORY).forEach(function (key) {
            if (!ITEMS_BY_CATEGORY[key].length) {
                return;
            }
            var group = document.createElement('optgroup');
            group.label = key;
            ITEMS_BY_CATEGORY[key].forEach(function (item) {
                addOption(group, item, item);
            });
            itemSelect.appendChild(group);
        });
    }

    if (previous && (!category || categoryOfItem(previous) === category)) {
        itemSelect.value = previous;
    }

    if (!itemSelect.value && AUTO_SELECT_ITEM[category]) {
        itemSelect.value = AUTO_SELECT_ITEM[category];
    }
}

function getItemName() {
    var category = document.getElementById('itemCategory').value;
    return category === 'Other'
        ? document.getElementById('itemNameOther').value.trim()
        : document.getElementById('itemName').value;
}

// Returns the existing item with the same name (case-insensitive), or null.
function findExistingItem(name) {
    var target = name.trim().toLowerCase();
    for (var i = 0; i < CURRENT_ITEMS.length; i++) {
        if (CURRENT_ITEMS[i].name.trim().toLowerCase() === target) {
            return CURRENT_ITEMS[i];
        }
    }
    return null;
}

// Load inventory items
async function loadInventory() {
    var tbody = document.getElementById('inventoryTable');

    try {
        var response = await fetch(API_URL);
        var items = await response.json();
        CURRENT_ITEMS = items; // keep a copy for existing-item checks

        // Debug: shows exactly which fields the server sends back.
        // If the minimum stock field is missing here, the server is not saving it.
        if (items.length) {
            console.log('Inventory item fields from server:', items[0]);
        }

        if (!items.length) {
            tbody.innerHTML =
                '<tr>' +
                    '<td colspan="6" style="text-align: center; padding: 40px; color: #666;">' +
                        'No items in inventory. Click "Add Inventory" to add one.' +
                    '</td>' +
                '</tr>';
            updateStats(items);
            return;
        }

        tbody.innerHTML = items.map(function (item) {
            var statusClass = String(item.status).toLowerCase().split(' ').join('-');
            return '<tr' +
                    ' data-name="' + escapeHtml(item.name) + '"' +
                    ' data-category="' + escapeHtml(item.category) + '"' +
                    ' data-status="' + escapeHtml(item.status) + '">' +
                    '<td><strong>' + escapeHtml(item.name) + '</strong></td>' +
                    '<td>' + escapeHtml(item.category) + '</td>' +
                    '<td>' + item.quantity + '</td>' +
                    '<td>' + escapeHtml(getMinStock(item)) + '</td>' +
                    '<td><span class="stock-status ' + statusClass + '">' + escapeHtml(item.status) + '</span></td>' +
                    '<td>' +
                        '<button class="action-btn add-qty-btn" title="Add stock" ' +
                            'data-id="' + escapeHtml(item._id) + '" data-change="1">+</button>' +
                        '<button class="action-btn remove-qty-btn" title="Remove stock" ' +
                            (item.quantity <= 0 ? 'disabled ' : '') +
                            'data-id="' + escapeHtml(item._id) + '" data-change="-1">&minus;</button>' +
                    '</td>' +
                '</tr>';
        }).join('');

        updateStats(items);
        filterTable();

    } catch (error) {
        console.error('Error loading inventory:', error);
        tbody.innerHTML =
            '<tr>' +
                '<td colspan="6" style="text-align: center; padding: 40px; color: #b33c3c;">' +
                    'Error loading inventory' +
                '</td>' +
            '</tr>';
    }
}

// Update statistics
function updateStats(items) {
    var inStock = 0;
    var lowStock = 0;
    var outOfStock = 0;

    items.forEach(function (item) {
        if (item.status === 'In Stock') {
            inStock++;
        } else if (item.status === 'Low Stock') {
            lowStock++;
        } else if (item.status === 'Out of Stock') {
            outOfStock++;
        }
    });

    document.getElementById('totalItems').textContent = items.length;
    document.getElementById('availableItems').textContent = inStock;
    document.getElementById('lowStockItems').textContent = lowStock;
    document.getElementById('outOfStockItems').textContent = outOfStock;
}

function openInventoryModal() {
    document.getElementById('inventoryForm').reset();
    clearModalError();
    populateItemNames();
    checkExistingItem();
    document.getElementById('inventoryModal').classList.add('active');
}

function closeInventoryModal() {
    document.getElementById('inventoryModal').classList.remove('active');
}

// Save new item
async function saveItem(event) {
    event.preventDefault();

    // Safety net: never save when the item already exists.
    if (checkExistingItem()) {
        return;
    }

    var supplierInput = document.getElementById('itemSupplier');
    var minStock = parseInt(document.getElementById('minimumStock').value, 10);

    var data = {
        name: getItemName(),
        category: document.getElementById('itemCategory').value,
        quantity: parseInt(document.getElementById('itemQuantity').value, 10),
        supplier: supplierInput ? supplierInput.value.trim() : ''
    };

    // Sent under every common name so the server saves it
    // whichever field its model uses.
    MIN_STOCK_KEYS.forEach(function (key) {
        data[key] = minStock;
    });

    if (!data.name || !data.category || isNaN(data.quantity) || isNaN(minStock)) {
        showModalError('Please fill in all fields');
        return;
    }

    try {
        var response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeInventoryModal();
            loadInventory();
            showNotification('Item added', 'success');
        } else {
            var error = await response.json();
            showModalError(error.error || 'Error saving item');
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showModalError('Error saving item');
    }
}

// The + and - buttons
async function updateQuantity(id, change) {
    try {
        var response = await fetch(API_URL + '/' + id + '/quantity', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ change: change })
        });

        if (response.ok) {
            loadInventory();
        } else {
            var error = await response.json();
            showNotification(error.error || 'Could not update quantity', 'error');
        }
    } catch (error) {
        console.error('Error updating quantity:', error);
        showNotification('Error updating quantity', 'error');
    }
}

// Filter table
function filterTable() {
    var search = document.getElementById('searchInventory').value.toLowerCase();
    var category = document.getElementById('categoryFilter').value;
    var status = document.getElementById('stockFilter').value;
    var rows = document.querySelectorAll('#inventoryTable tr');

    Array.prototype.forEach.call(rows, function (row) {
        if (!row.getAttribute('data-name')) {
            return;
        }

        var name = row.getAttribute('data-name').toLowerCase();
        var show = true;

        if (search && name.indexOf(search) === -1) {
            show = false;
        }
        if (category !== 'all' && row.getAttribute('data-category') !== category) {
            show = false;
        }
        if (status !== 'all' && row.getAttribute('data-status') !== status) {
            show = false;
        }

        row.style.display = show ? '' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', function () {

    var categorySelect = document.getElementById('itemCategory');
    var itemSelect = document.getElementById('itemName');
    var modal = document.getElementById('inventoryModal');

    document.getElementById('openInventoryModalBtn').addEventListener('click', openInventoryModal);
    document.getElementById('closeInventoryModalBtn').addEventListener('click', closeInventoryModal);
    document.getElementById('cancelInventoryBtn').addEventListener('click', closeInventoryModal);
    document.getElementById('refreshInventoryBtn').addEventListener('click', loadInventory);
    document.getElementById('inventoryForm').addEventListener('submit', saveItem);

    document.getElementById('searchInventory').addEventListener('keyup', filterTable);
    document.getElementById('categoryFilter').addEventListener('change', filterTable);
    document.getElementById('stockFilter').addEventListener('change', filterTable);

    categorySelect.addEventListener('change', populateItemNames);

    itemSelect.addEventListener('change', function () {
        var category = categoryOfItem(itemSelect.value);
        if (category && categorySelect.value !== category) {
            categorySelect.value = category;
            populateItemNames();
        }
    });

    // Check automatically whenever the chosen item changes.
    // (Registered after the handlers above so the dropdowns are already updated.)
    categorySelect.addEventListener('change', checkExistingItem);
    itemSelect.addEventListener('change', checkExistingItem);
    document.getElementById('itemNameOther').addEventListener('input', checkExistingItem);

    document.getElementById('inventoryTable').addEventListener('click', function (event) {
        var button = event.target.closest('.action-btn');
        if (button && !button.disabled) {
            updateQuantity(button.getAttribute('data-id'), parseInt(button.getAttribute('data-change'), 10));
        }
    });

    modal.addEventListener('click', function (event) {
        if (event.target === modal) {
            closeInventoryModal();
        }
    });

    populateItemNames();
    loadInventory();
});