// ─── GLOBAL STATE ──────────────────────────────────────────────────────
let currentData = [];
let filteredData = [];
let blockStats = {};

// ─── API BASE URL ──────────────────────────────────────────────────────
const API_BASE = window.location.origin;

// ─── TOAST NOTIFICATION ────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = type + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ─── LOAD DATA ─────────────────────────────────────────────────────────
async function loadData() {
    const grid = document.getElementById('roomGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading rooms...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/api/rooms`);
        if (!response.ok) throw new Error('Failed to load data');
        currentData = await response.json();
        renderRooms();
        updateStats();
        updateBlockStats();
    } catch (error) {
        showToast('Error loading data: ' + error.message, 'error');
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#718096;">Error loading data. Please refresh.</p>';
    }
}

// ─── RENDER ROOMS ──────────────────────────────────────────────────────
function renderRooms() {
    const grid = document.getElementById('roomGrid');
    const search = document.getElementById('searchRoom').value.toLowerCase();
    const filterBlock = document.getElementById('filterBlock').value;
    const filterFloor = document.getElementById('filterFloor').value;
    const filterStatus = document.getElementById('filterStatus').value;

    filteredData = currentData.filter(row => {
        const block = row[0];
        const floor = row[1];
        const roomNo = row[2].toString().toLowerCase();
        const occupied = row[4] === 'Yes';

        if (filterBlock !== 'all' && block !== filterBlock) return false;
        if (filterFloor !== 'all' && floor !== filterFloor) return false;
        if (filterStatus === 'occupied' && !occupied) return false;
        if (filterStatus === 'vacant' && occupied) return false;
        if (search && !roomNo.includes(search)) return false;
        return true;
    });

    if (filteredData.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#718096;">No rooms match the filter</p>';
        return;
    }

    let html = '';
    let currentRoom = null;
    let roomBeds = [];

    // Group beds by room
    for (const row of filteredData) {
        const roomNo = row[2];
        if (currentRoom !== roomNo) {
            if (currentRoom !== null) {
                html += renderRoomCard(currentRoom, roomBeds);
            }
            currentRoom = roomNo;
            roomBeds = [];
        }
        roomBeds.push(row);
    }
    if (currentRoom !== null) {
        html += renderRoomCard(currentRoom, roomBeds);
    }

    grid.innerHTML = html;
}

function renderRoomCard(roomNo, beds) {
    const occupiedBeds = beds.filter(b => b[4] === 'Yes');
    let totalRent = 0;
    for (const bed of occupiedBeds) {
        totalRent += (bed[6] || 0);
    }
    const electricityShare = beds[0][7] || 0;
    const block = beds[0][0];
    const floor = beds[0][1];
    let status = 'vacant';
    if (occupiedBeds.length === beds.length) status = 'full';
    else if (occupiedBeds.length > 0) status = 'partial';

    const colorMap = { 'A': '#1a237e', 'B': '#2d3748', 'C': '#553c9a' };
    const blockColor = colorMap[block] || '#1a237e';

    let html = `<div class="room-card" style="border-left-color: ${blockColor}">`;
    html += `<div class="room-number">🏠 ${roomNo}</div>`;
    html += `<div class="room-meta">${block} | ${floor} Floor</div>`;
    html += `<div class="rent-display">₹${totalRent.toFixed(0)}</div>`;

    for (const bed of beds) {
        const bedId = bed[3];
        const occupied = bed[4] === 'Yes';
        const occupantName = bed[5] || '';
        const rent = bed[6] || 0;
        const bedLabel = bedId.split('-')[1];

        html += `<div class="bed-info">`;
        html += `Bed ${bedLabel}: `;
        html += `<span class="bed-status ${occupied ? 'occupied' : 'vacant'}">`;
        html += occupied ? '👤 ' + occupantName : '🟢 Vacant';
        html += `</span> `;
        html += occupied ? '₹' + rent.toFixed(0) : '';
        html += `</div>`;
    }

    html += `<div style="font-size:12px;color:#718096;margin:4px 0;">`;
    html += `⚡ Share: ₹${electricityShare.toFixed(0)}`;
    html += `</div>`;

    html += `<div class="actions">`;
    for (const bed of beds) {
        const bedId = bed[3];
        const occupied = bed[4] === 'Yes';
        const bedLabel = bedId.split('-')[1];
        const btnClass = occupied ? 'btn-danger' : 'btn-success';
        const btnText = occupied ? 'Vacate' : 'Occupy';
        html += `<button class="btn ${btnClass} btn-sm" onclick="toggleBed('${roomNo}', '${bedId}')">`;
        html += `${btnText} Bed ${bedLabel}`;
        html += `</button>`;
    }
    html += `</div>`;
    html += `</div>`;

    return html;
}

// ─── UPDATE STATS ──────────────────────────────────────────────────────
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (!response.ok) throw new Error('Failed to load stats');
        const stats = await response.json();

        document.getElementById('statTotalRooms').textContent = stats.totalRooms;
        document.getElementById('statOccupiedRooms').textContent = stats.occupiedRooms;
        document.getElementById('statOccupiedBeds').textContent = stats.occupiedBeds;
        document.getElementById('statVacantBeds').textContent = stats.vacantBeds;
        document.getElementById('statTotalRent').textContent = '₹' + stats.totalRent;

        blockStats = stats.blockStats || {};
        updateBlockStats();
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ─── UPDATE BLOCK STATS ───────────────────────────────────────────────
function updateBlockStats() {
    const container = document.getElementById('blockStats');
    const colorMap = { 'A': '#1a237e', 'B': '#2d3748', 'C': '#553c9a' };
    let html = '';

    for (const block in blockStats) {
        const stats = blockStats[block];
        const color = colorMap[block] || '#1a237e';
        html += `<div class="block-card" style="border-left-color: ${color}">`;
        html += `<div>`;
        html += `<div class="block-name">Block ${block}</div>`;
        html += `<div style="font-size:12px;color:#718096;">${stats.totalRooms} rooms</div>`;
        html += `</div>`;
        html += `<div class="block-stats-mini">`;
        html += `<div>Occupied: <span class="num">${Math.round(stats.occupiedRooms)}/${stats.totalRooms}</span></div>`;
        html += `<div>Beds: <span class="num">${stats.occupiedBeds}/${stats.totalRooms * 2}</span></div>`;
        html += `<div style="color:#1a237e;font-weight:700;">₹${stats.totalRent}</div>`;
        html += `</div>`;
        html += `</div>`;
    }

    container.innerHTML = html;
}

// ─── TOGGLE BED ────────────────────────────────────────────────────────
async function toggleBed(roomNo, bedId) {
    let bed = null;
    for (const row of currentData) {
        if (row[2] === roomNo && row[3] === bedId) {
            bed = row;
            break;
        }
    }

    if (!bed) return;

    if (bed[4] === 'Yes') {
        if (!confirm('Vacate bed ' + bedId + '?')) return;
        await updateBed(roomNo, bedId, '', 0);
    } else {
        showOccupancyModal(roomNo, bedId);
    }
}

// ─── UPDATE BED ────────────────────────────────────────────────────────
async function updateBed(roomNo, bedId, occupantName, rent) {
    try {
        const response = await fetch(`${API_BASE}/api/toggle-bed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomNo, bedId, occupantName, rent })
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message, 'success');
            loadData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// ─── SHOW OCCUPANCY MODAL ─────────────────────────────────────────────
function showOccupancyModal(roomNo, bedId) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    title.textContent = 'Room ' + roomNo + ' - Bed ' + bedId;
    body.innerHTML = `
        <div class="form-group">
            <label>👤 Occupant Name</label>
            <input type="text" id="occupantName" placeholder="Enter name..." />
        </div>
        <div class="form-group">
            <label>💰 Rent Amount (₹)</label>
            <input type="number" id="rentAmount" value="5000" step="100" />
        </div>
        <button class="btn btn-success" onclick="confirmOccupancy('${roomNo}', '${bedId}')">✅ Confirm Occupancy</button>
    `;

    modal.classList.add('active');
    setTimeout(() => {
        document.getElementById('occupantName').focus();
    }, 100);
}

// ─── CONFIRM OCCUPANCY ────────────────────────────────────────────────
function confirmOccupancy(roomNo, bedId) {
    const name = document.getElementById('occupantName').value.trim();
    const rent = parseFloat(document.getElementById('rentAmount').value);

    if (!name) {
        showToast('Please enter occupant name', 'error');
        return;
    }
    if (!rent || rent <= 0) {
        showToast('Please enter valid rent', 'error');
        return;
    }

    updateBed(roomNo, bedId, name, rent);
    closeModal();
}

// ─── CALCULATE BILL ────────────────────────────────────────────────────
async function calculateBill() {
    const units = parseFloat(document.getElementById('totalUnits').value);
    const price = parseFloat(document.getElementById('perUnitPrice').value);
    const block = document.getElementById('blockSelect').value;

    if (!units || units <= 0) {
        showToast('Please enter valid units', 'error');
        return;
    }
    if (!price || price <= 0) {
        showToast('Please enter valid per unit price', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/calculate-bill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units, price, block: block === 'All' ? null : block })
        });
        const result = await response.json();
        document.getElementById('totalBillDisplay').textContent = '₹' + result.totalBill.toFixed(2);
        document.getElementById('perRoomDisplay').textContent = '₹' + result.perRoomShare.toFixed(2);
        document.getElementById('perBedDisplay').textContent = '₹' + result.perBedShare.toFixed(2);
        showToast('Bill calculated for ' + (block || 'All') + '!', 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// ─── APPLY BILL ────────────────────────────────────────────────────────
async function applyBill() {
    const units = parseFloat(document.getElementById('totalUnits').value);
    const price = parseFloat(document.getElementById('perUnitPrice').value);
    const block = document.getElementById('blockSelect').value;

    if (!units || units <= 0) {
        showToast('Please calculate the bill first', 'error');
        return;
    }

    if (!confirm('Apply electricity bill to ' + (block === 'All' ? 'ALL rooms' : 'Block ' + block) + '?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/apply-bill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units, price, block: block === 'All' ? null : block })
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message, 'success');
            loadData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// ─── RESET DATA ────────────────────────────────────────────────────────
async function resetData() {
    if (!confirm('⚠️ This will reset all room data. Are you sure?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/reset`, {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message, 'success');
            document.getElementById('totalUnits').value = '';
            document.getElementById('totalBillDisplay').textContent = '₹0';
            document.getElementById('perRoomDisplay').textContent = '₹0';
            document.getElementById('perBedDisplay').textContent = '₹0';
            loadData();
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// ─── FILTER ROOMS ──────────────────────────────────────────────────────
function filterRooms() {
    renderRooms();
}

// ─── REFRESH DATA ──────────────────────────────────────────────────────
function refreshData() {
    showToast('Refreshing data...', 'info');
    loadData();
}

// ─── MODAL ─────────────────────────────────────────────────────────────
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ─── AUTO CALCULATE ────────────────────────────────────────────────────
document.getElementById('totalUnits').addEventListener('input', function() {
    if (this.value) calculateBill();
});
document.getElementById('perUnitPrice').addEventListener('input', function() {
    if (document.getElementById('totalUnits').value) calculateBill();
});
document.getElementById('blockSelect').addEventListener('change', function() {
    if (document.getElementById('totalUnits').value) calculateBill();
});

// ─── INIT ──────────────────────────────────────────────────────────────
window.onload = function() {
    loadData();
};
