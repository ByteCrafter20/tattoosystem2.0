// public/js/inventory.js
// Inventory page: loads items from /api/inventory, filtering, add modal.
// Category <-> Item Name are linked both ways:
//   - picking a Category filters the Item Name list
//   - picking an Item Name auto-selects its Category

var API_URL = '/api/inventory';
var CURRENT_ITEMS = []; // keeps the last-loaded inventory, used to block duplicate names

var ITEMS_BY_CATEGORY = {
    Needles: [
        '1RL', '3RL', '5RL', '7RL', '9RL', '11RL', '14RL',
        '5RS', '7RS', '9RS',
        '5M1', '7M1', '9M1', '11M1', '13M1', '15M1',
        '7CM', '9CM', '11CM', '13CM', '15CM'
    ],
    Ink: [
        'Black', 'White', 'Gray', 'Red', 'Blue', 'Green',
        'Yellow', 'Purple', 'Pink'
    ],
    Machines: [
        'Rotary Machine', 'Coil Machine', 'Pen Machine',
        'Power Supply', 'Foot Pedal', 'Clip Cord'
    ],
    Accessories: [
        'Disposable Grip', 'Cartridge Tube',
        'Ink Cups', 'Rubber Bands', 'Stencil Paper', 'Stencil Gel'
    ],
    Sanitation: [
        'Plastic Gloves', 'Ointment','Foam Wash', 'Alcohol',
        'Cling Wrap', 'Tissue','Baby Wipes'
    ],
    Other: []
};

// Categories where the item is fixed, so it is picked automatically.
var AUTO_SELECT_ITEM = {
    Gloves: 'Plastic Gloves',
    Ointment: 'Ointment'
};

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

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
}

// Minimum stock can come back under different field names depending on
// the database model. Use whichever one exists; fall back to 0.
function getMinStock(item) {
    var keys = ['reorderLevel', 'minimumStock', 'minStock', 'minimumQuantity', 'lowStockThreshold'];
    for (var i = 0; i < keys.length; i++) {
        var value = item[keys[i]];
        if (value !== undefined && value !== null && value !== '') {
            return value;
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
        CURRENT_ITEMS = items; // keep a copy for duplicate checks in saveItem()

        if (!items.length) {
            tbody.innerHTML =
                '<tr>' +
                    '<td colspan="7" style="text-align: center; padding: 40px; color: #666;">' +
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
                    '<td>₱' + Number(item.price || 0).toFixed(2) + '</td>' +
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
                '<td colspan="7" style="text-align: center; padding: 40px; color: #b33c3c;">' +
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
    populateItemNames();
    document.getElementById('inventoryModal').classList.add('active');
}

function closeInventoryModal() {
    document.getElementById('inventoryModal').classList.remove('active');
}

// Save new item
async function saveItem(event) {
    event.preventDefault();

    var priceInput = document.getElementById('itemPrice');
    var supplierInput = document.getElementById('itemSupplier');
    var price = priceInput ? parseFloat(priceInput.value) : 0;
    var minStock = parseInt(document.getElementById('minimumStock').value, 10);

    var data = {
        name: getItemName(),
        category: document.getElementById('itemCategory').value,
        quantity: parseInt(document.getElementById('itemQuantity').value, 10),
        price: isNaN(price) ? 0 : price,
        // Sent under every common name so the server saves it
        // whichever field its model uses.
        reorderLevel: minStock,
        minimumStock: minStock,
        minStock: minStock,
        supplier: supplierInput ? supplierInput.value.trim() : ''
    };

    if (!data.name || !data.category || isNaN(data.quantity) || isNaN(minStock)) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    // Block duplicates: same item name (case-insensitive) already in inventory.
    var existing = findExistingItem(data.name);
    if (existing) {
        showNotification(existing.name + ' is already in the Inventory', 'error');
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
            showNotification(error.error || 'Error saving item', 'error');
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showNotification('Error saving item', 'error');
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

    // Logo (Totats Skin Art Tattoo) = pindutin para pumunta sa Dashboard
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

    populateItemNames();
    loadInventory();
});