// ─── CLOUDFLARE WORKER - PG MANAGEMENT SYSTEM ────────────────────────

// ─── CONFIGURATION ──────────────────────────────────────────────────────
const CONFIG = {
    totalRooms: 87,
    bedsPerRoom: 2,
    defaultRent: 5000,
    defaultElectricityRate: 8,

    blocks: {
        'A': {
            name: 'Block A',
            floors: {
                'Ground': { roomCount: 3, prefix: 'A00' },
                '1st': { roomCount: 6, prefix: 'A1' },
                '2nd': { roomCount: 6, prefix: 'A2' },
                '3rd': { roomCount: 6, prefix: 'A3' },
                '4th': { roomCount: 5, prefix: 'A4' },
                '5th': { roomCount: 3, prefix: 'A5' }
            }
        },
        'B': {
            name: 'Block B',
            floors: {
                'Ground': { roomCount: 3, prefix: 'B00' },
                '1st': { roomCount: 6, prefix: 'B1' },
                '2nd': { roomCount: 6, prefix: 'B2' },
                '3rd': { roomCount: 6, prefix: 'B3' },
                '4th': { roomCount: 5, prefix: 'B4' },
                '5th': { roomCount: 3, prefix: 'B5' }
            }
        },
        'C': {
            name: 'Block C',
            floors: {
                'Ground': { roomCount: 3, prefix: 'C00' },
                '1st': { roomCount: 6, prefix: 'C1' },
                '2nd': { roomCount: 6, prefix: 'C2' },
                '3rd': { roomCount: 6, prefix: 'C3' },
                '4th': { roomCount: 5, prefix: 'C4' },
                '5th': { roomCount: 3, prefix: 'C5' }
            }
        }
    }
};

// ─── IN-MEMORY STORAGE ──────────────────────────────────────────────────
let roomData = [];
let electricityHistory = [];
let initialized = false;

// ─── GENERATE ROOM NUMBERS ─────────────────────────────────────────────
function generateRoomNumbers() {
    const rooms = [];
    const floorOrder = ['Ground', '1st', '2nd', '3rd', '4th', '5th'];

    for (const block in CONFIG.blocks) {
        const blockData = CONFIG.blocks[block];
        const floorNames = Object.keys(blockData.floors).sort((a, b) => floorOrder.indexOf(a) - floorOrder.indexOf(b));

        for (const floor of floorNames) {
            const floorData = blockData.floors[floor];
            for (let i = 1; i <= floorData.roomCount; i++) {
                const roomNumber = floorData.prefix + (i < 10 ? '0' + i : i);
                rooms.push({
                    block: block,
                    floor: floor,
                    roomNumber: roomNumber,
                    displayName: block + '-' + roomNumber
                });
            }
        }
    }
    return rooms;
}

// ─── INITIALIZE DATA ────────────────────────────────────────────────────
function initializeData() {
    if (initialized && roomData.length > 0) return;

    const roomNumbers = generateRoomNumbers();
    roomData = [];

    for (const room of roomNumbers) {
        for (let bed = 0; bed < CONFIG.bedsPerRoom; bed++) {
            const bedId = String.fromCharCode(65 + bed);
            roomData.push([
                room.block,
                room.floor,
                room.roomNumber,
                room.roomNumber + '-' + bedId,
                'No',
                '',
                0,
                0,
                0,
                'Vacant'
            ]);
        }
    }
    initialized = true;
}

initializeData();

// ─── GET STATISTICS ────────────────────────────────────────────────────
function getStats() {
    const totalBeds = roomData.length;
    let occupiedBeds = 0;
    let totalRent = 0;
    const occupiedRooms = new Set();
    const blockStats = {};

    for (const row of roomData) {
        const block = row[0];
        const roomNo = row[2];
        const occupied = row[4] === 'Yes';
        const rent = row[6] || 0;

        if (!blockStats[block]) {
            blockStats[block] = {
                totalRooms: 0,
                occupiedRooms: 0,
                occupiedBeds: 0,
                totalRent: 0
            };
        }

        if (occupied) {
            occupiedBeds++;
            totalRent += rent;
            occupiedRooms.add(roomNo);
            blockStats[block].occupiedBeds++;
            blockStats[block].totalRent += rent;
        }
    }

    // Count rooms per block
    const roomNumbers = generateRoomNumbers();
    for (const room of roomNumbers) {
        if (blockStats[room.block]) {
            blockStats[room.block].totalRooms++;
        }
    }

    // Count occupied rooms per block
    for (const block in blockStats) {
        let occupiedRoomsCount = 0;
        for (const row of roomData) {
            if (row[0] === block && row[4] === 'Yes') {
                occupiedRoomsCount++;
            }
        }
        blockStats[block].occupiedRooms = occupiedRoomsCount / CONFIG.bedsPerRoom;
    }

    return {
        totalRooms: CONFIG.totalRooms,
        totalBeds: totalBeds,
        occupiedBeds: occupiedBeds,
        vacantBeds: totalBeds - occupiedBeds,
        occupiedRooms: occupiedRooms.size,
        totalRent: totalRent,
        blockStats: blockStats
    };
}

// ─── CALCULATE ELECTRICITY ─────────────────────────────────────────────
function calculateElectricity(units, perUnitPrice, block) {
    let roomsInBlock = CONFIG.totalRooms;

    if (block) {
        const roomNumbers = generateRoomNumbers();
        roomsInBlock = 0;
        for (const room of roomNumbers) {
            if (room.block === block) roomsInBlock++;
        }
    }

    const totalBill = units * perUnitPrice;
    const perRoomShare = totalBill / roomsInBlock;
    const perBedShare = perRoomShare / CONFIG.bedsPerRoom;

    return { totalBill, perRoomShare, perBedShare, roomsInBlock };
}

// ─── APPLY ELECTRICITY BILL ────────────────────────────────────────────
function applyElectricityBill(units, perUnitPrice, block) {
    const result = calculateElectricity(units, perUnitPrice, block);

    for (const row of roomData) {
        const roomBlock = row[0];
        if (block && roomBlock !== block) continue;

        const occupied = row[4] === 'Yes';
        const rent = row[6] || 0;

        row[7] = result.perRoomShare;
        row[8] = occupied ? rent + result.perRoomShare : 0;

        if (occupied) {
            const bedRent = rent / CONFIG.bedsPerRoom + result.perBedShare;
            row[6] = bedRent * CONFIG.bedsPerRoom;
        }
    }

    electricityHistory.push({
        date: new Date().toISOString(),
        block: block || 'All',
        units: units,
        price: perUnitPrice,
        totalBill: result.totalBill,
        perRoomShare: result.perRoomShare,
        perBedShare: result.perBedShare
    });

    return {
        success: true,
        message: 'Electricity bill applied successfully for ' + (block || 'All') + '!',
        result: result
    };
}

// ─── TOGGLE BED ─────────────────────────────────────────────────────────
function toggleBed(roomNo, bedId, occupantName, rent) {
    let found = false;

    for (const row of roomData) {
        if (row[2] === roomNo && row[3] === bedId) {
            found = true;
            if (row[4] === 'Yes') {
                row[4] = 'No';
                row[5] = '';
                row[6] = 0;
                row[8] = 0;
                row[9] = 'Vacant';
            } else {
                row[4] = 'Yes';
                row[5] = occupantName;
                row[6] = rent || CONFIG.defaultRent;
                row[8] = (rent || CONFIG.defaultRent) + row[7];
                row[9] = 'Occupied';
            }
            break;
        }
    }

    if (!found) {
        return { success: false, message: 'Bed not found' };
    }

    // Update rent distribution
    const roomRows = roomData.filter(r => r[2] === roomNo);
    const occupiedBeds = roomRows.filter(r => r[4] === 'Yes');

    if (occupiedBeds.length > 0) {
        const totalRent = occupiedBeds[0][6];
        const perBedRent = totalRent / occupiedBeds.length;

        for (const row of roomRows) {
            if (row[4] === 'Yes') {
                row[6] = perBedRent;
                row[8] = perBedRent + row[7];
            }
        }
    }

    return { success: true, message: 'Bed updated successfully' };
}

// ─── RESET DATA ─────────────────────────────────────────────────────────
function resetAllData() {
    for (const row of roomData) {
        row[4] = 'No';
        row[5] = '';
        row[6] = 0;
        row[7] = 0;
        row[8] = 0;
        row[9] = 'Vacant';
    }
    electricityHistory = [];
    return { success: true, message: 'All data reset successfully' };
}

// ─── HTML TEMPLATE ──────────────────────────────────────────────────────
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PG Management - 3 Blocks</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f0f4f8;
            color: #1a202c;
            padding: 20px;
        }

        .app-container {
            max-width: 1400px;
            margin: 0 auto;
        }

        /* Toast */
        #toast {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            z-index: 9999;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            max-width: 400px;
        }

        #toast.show {
            transform: translateX(0);
        }

        #toast.success {
            background: #48bb78;
        }

        #toast.error {
            background: #fc8181;
        }

        #toast.info {
            background: #4299e1;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #1a237e 0%, #0d1445 100%);
            color: white;
            padding: 25px 30px;
            border-radius: 16px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }

        .header h1 {
            font-size: 28px;
            font-weight: 800;
        }

        .header h1 span {
            color: #ffd700;
        }

        .header .stats-grid {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }

        .header .stat-item {
            text-align: center;
        }

        .header .stat-item .number {
            font-size: 20px;
            font-weight: 700;
            color: #ffd700;
        }

        .header .stat-item .label {
            font-size: 11px;
            opacity: 0.8;
        }

        /* Block Stats */
        .block-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 25px;
        }

        .block-card {
            background: white;
            border-radius: 12px;
            padding: 15px 20px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            border-left: 5px solid #1a237e;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .block-card .block-name {
            font-weight: 700;
            font-size: 18px;
        }

        .block-card .block-stats-mini {
            text-align: right;
            font-size: 13px;
            color: #4a5568;
        }

        .block-card .block-stats-mini .num {
            font-weight: 700;
            color: #1a237e;
        }

        /* Calculator */
        .calculator {
            background: white;
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
            border: 1px solid #e2e8f0;
        }

        .calculator h2 {
            font-size: 22px;
            margin-bottom: 15px;
            color: #1a237e;
        }

        .calc-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 15px;
            align-items: end;
        }

        .calc-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .calc-group label {
            font-weight: 600;
            font-size: 14px;
            color: #4a5568;
        }

        .calc-group input,
        .calc-group select {
            padding: 10px 14px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 15px;
            background: #f7fafc;
            width: 100%;
            transition: border-color 0.3s;
        }

        .calc-group input:focus,
        .calc-group select:focus {
            outline: none;
            border-color: #1a237e;
        }

        .calc-result {
            background: #f7fafc;
            border-radius: 10px;
            padding: 15px 20px;
            margin-top: 15px;
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            align-items: center;
        }

        .calc-result .item {
            display: flex;
            flex-direction: column;
        }

        .calc-result .item .value {
            font-size: 22px;
            font-weight: 700;
            color: #1a237e;
        }

        .calc-result .item .value.green {
            color: #38a169;
        }

        .calc-result .item .value.gold {
            color: #d69e2e;
        }

        .calc-result .item .label {
            font-size: 13px;
            color: #718096;
        }

        /* Buttons */
        .btn {
            padding: 10px 24px;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-primary {
            background: #1a237e;
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background: #0d1445;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(26, 35, 126, 0.3);
        }

        .btn-success {
            background: #48bb78;
            color: white;
        }

        .btn-success:hover:not(:disabled) {
            background: #38a169;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);
        }

        .btn-danger {
            background: #fc8181;
            color: white;
        }

        .btn-danger:hover:not(:disabled) {
            background: #f56565;
            transform: translateY(-2px);
        }

        .btn-warning {
            background: #f6ad55;
            color: white;
        }

        .btn-warning:hover:not(:disabled) {
            background: #ed8936;
            transform: translateY(-2px);
        }

        .btn-sm {
            padding: 5px 12px;
            font-size: 11px;
        }

        /* Filters */
        .filters {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 20px;
            align-items: center;
            background: white;
            padding: 15px 20px;
            border-radius: 12px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }

        .filters input,
        .filters select {
            padding: 8px 14px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 14px;
            background: #f7fafc;
        }

        .filters input:focus,
        .filters select:focus {
            outline: none;
            border-color: #1a237e;
        }

        /* Room Grid */
        .room-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .room-card {
            background: white;
            border-radius: 12px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            transition: transform 0.3s, box-shadow 0.3s;
            border-left: 5px solid #1a237e;
        }

        .room-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .room-card .room-number {
            font-size: 18px;
            font-weight: 700;
            color: #1a1a2e;
        }

        .room-card .room-meta {
            font-size: 12px;
            color: #718096;
            margin-bottom: 4px;
        }

        .room-card .bed-info {
            font-size: 13px;
            color: #4a5568;
            margin: 4px 0;
            padding: 4px 8px;
            background: #f7fafc;
            border-radius: 6px;
        }

        .room-card .rent-display {
            font-size: 16px;
            font-weight: 700;
            color: #1a237e;
            margin: 8px 0;
        }

        .room-card .actions {
            margin-top: 10px;
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .room-card .bed-status {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
        }

        .bed-status.occupied {
            background: #fef3c7;
            color: #d69e2e;
        }

        .bed-status.vacant {
            background: #c6f6d5;
            color: #276749;
        }

        /* Loading */
        .loading {
            text-align: center;
            padding: 40px;
            color: #718096;
        }

        .spinner {
            border: 4px solid #f3f4f6;
            border-top: 4px solid #1a237e;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }

        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }

        /* Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(4px);
        }

        .modal-overlay.active {
            display: flex;
        }

        .modal {
            background: white;
            border-radius: 16px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from {
                transform: translateY(-30px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .modal h3 {
            font-size: 24px;
            margin-bottom: 20px;
            color: #1a237e;
        }

        .modal .form-group {
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .modal .form-group label {
            font-weight: 600;
            color: #4a5568;
            font-size: 14px;
        }

        .modal .form-group input {
            padding: 10px 14px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 15px;
            transition: border-color 0.3s;
        }

        .modal .form-group input:focus {
            outline: none;
            border-color: #1a237e;
        }

        .modal .actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        @media (max-width: 768px) {
            .header {
                flex-direction: column;
                text-align: center;
            }

            .header .stats-grid {
                justify-content: center;
            }

            .room-grid {
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            }

            .calc-grid {
                grid-template-columns: 1fr;
            }

            .filters {
                flex-direction: column;
                align-items: stretch;
            }

            .block-stats {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Toast Notification -->
        <div id="toast"></div>

        <!-- Header -->
        <div class="header">
            <h1>🏠 PG <span>Management</span></h1>
            <div class="stats-grid" id="statsGrid">
                <div class="stat-item">
                    <div class="number" id="statTotalRooms">87</div>
                    <div class="label">Total Rooms</div>
                </div>
                <div class="stat-item">
                    <div class="number" id="statOccupiedRooms">0</div>
                    <div class="label">Occupied Rooms</div>
                </div>
                <div class="stat-item">
                    <div class="number" id="statOccupiedBeds">0</div>
                    <div class="label">Occupied Beds</div>
                </div>
                <div class="stat-item">
                    <div class="number" id="statVacantBeds">174</div>
                    <div class="label">Vacant Beds</div>
                </div>
                <div class="stat-item">
                    <div class="number" id="statTotalRent">₹0</div>
                    <div class="label">Total Rent</div>
                </div>
            </div>
        </div>

        <!-- Block Stats -->
        <div class="block-stats" id="blockStats"></div>

        <!-- Calculator -->
        <div class="calculator">
            <h2>⚡ Electricity Bill Calculator</h2>
            <div class="calc-grid">
                <div class="calc-group">
                    <label>Select Block</label>
                    <select id="blockSelect">
                        <option value="All">All Blocks</option>
                        <option value="A">Block A</option>
                        <option value="B">Block B</option>
                        <option value="C">Block C</option>
                    </select>
                </div>
                <div class="calc-group">
                    <label>Total Units Consumed</label>
                    <input type="number" id="totalUnits" placeholder="Enter units..." />
                </div>
                <div class="calc-group">
                    <label>Per Unit Price (₹)</label>
                    <input type="number" id="perUnitPrice" value="8" step="0.01" />
                </div>
                <div class="calc-group">
                    <button class="btn btn-primary" onclick="calculateBill()">Calculate Bill</button>
                </div>
                <div class="calc-group">
                    <button class="btn btn-success" onclick="applyBill()">Apply to Rooms</button>
                </div>
            </div>
            <div class="calc-result">
                <div class="item">
                    <span class="value" id="totalBillDisplay">₹0</span>
                    <span class="label">Total Electricity Bill</span>
                </div>
                <div class="item">
                    <span class="value gold" id="perRoomDisplay">₹0</span>
                    <span class="label">Per Room Share</span>
                </div>
                <div class="item">
                    <span class="value green" id="perBedDisplay">₹0</span>
                    <span class="label">Per Bed Share</span>
                </div>
            </div>
        </div>

        <!-- Filters -->
        <div class="filters">
            <select id="filterBlock" onchange="filterRooms()">
                <option value="all">All Blocks</option>
                <option value="A">Block A</option>
                <option value="B">Block B</option>
                <option value="C">Block C</option>
            </select>
            <select id="filterFloor" onchange="filterRooms()">
                <option value="all">All Floors</option>
                <option value="Ground">Ground</option>
                <option value="1st">1st</option>
                <option value="2nd">2nd</option>
                <option value="3rd">3rd</option>
                <option value="4th">4th</option>
                <option value="5th">5th</option>
            </select>
            <select id="filterStatus" onchange="filterRooms()">
                <option value="all">All Rooms</option>
                <option value="occupied">Occupied</option>
                <option value="vacant">Vacant</option>
            </select>
            <input type="text" id="searchRoom" placeholder="🔍 Search room..." onkeyup="filterRooms()" />
            <button class="btn btn-warning" onclick="resetData()">🔄 Reset All Data</button>
            <button class="btn btn-primary" onclick="refreshData()">🔄 Refresh</button>
        </div>

        <!-- Room Grid -->
        <div id="roomGrid" class="room-grid">
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading rooms...</p>
            </div>
        </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal">
        <div class="modal">
            <h3 id="modalTitle">Room Details</h3>
            <div id="modalBody"></div>
            <div class="actions">
                <button class="btn btn-danger" onclick="closeModal()">Close</button>
            </div>
        </div>
    </div>

    <script>
        // ─── GLOBAL STATE ──────────────────────────────────────────────────────
        let currentData = [];
        let filteredData = [];
        let blockStats = {};

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
                const response = await fetch('/api/rooms');
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

            let html = '<div class="room-card" style="border-left-color: ' + blockColor + '">';
            html += '<div class="room-number">🏠 ' + roomNo + '</div>';
            html += '<div class="room-meta">' + block + ' | ' + floor + ' Floor</div>';
            html += '<div class="rent-display">₹' + totalRent.toFixed(0) + '</div>';

            for (const bed of beds) {
                const bedId = bed[3];
                const occupied = bed[4] === 'Yes';
                const occupantName = bed[5] || '';
                const rent = bed[6] || 0;
                const bedLabel = bedId.split('-')[1];

                html += '<div class="bed-info">';
                html += 'Bed ' + bedLabel + ': ';
                html += '<span class="bed-status ' + (occupied ? 'occupied' : 'vacant') + '">';
                html += occupied ? '👤 ' + occupantName : '🟢 Vacant';
                html += '</span> ';
                html += occupied ? '₹' + rent.toFixed(0) : '';
                html += '</div>';
            }

            html += '<div style="font-size:12px;color:#718096;margin:4px 0;">';
            html += '⚡ Share: ₹' + electricityShare.toFixed(0);
            html += '</div>';

            html += '<div class="actions">';
            for (const bed of beds) {
                const bedId = bed[3];
                const occupied = bed[4] === 'Yes';
                const bedLabel = bedId.split('-')[1];
                const btnClass = occupied ? 'btn-danger' : 'btn-success';
                const btnText = occupied ? 'Vacate' : 'Occupy';
                html += '<button class="btn ' + btnClass + ' btn-sm" onclick="toggleBed(\'' + roomNo + '\', \'' + bedId + '\')">';
                html += btnText + ' Bed ' + bedLabel;
                html += '</button>';
            }
            html += '</div>';
            html += '</div>';

            return html;
        }

        // ─── UPDATE STATS ──────────────────────────────────────────────────────
        async function updateStats() {
            try {
                const response = await fetch('/api/stats');
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
                html += '<div class="block-card" style="border-left-color: ' + color + '">';
                html += '<div>';
                html += '<div class="block-name">Block ' + block + '</div>';
                html += '<div style="font-size:12px;color:#718096;">' + stats.totalRooms + ' rooms</div>';
                html += '</div>';
                html += '<div class="block-stats-mini">';
                html += '<div>Occupied: <span class="num">' + Math.round(stats.occupiedRooms) + '/' + stats.totalRooms + '</span></div>';
                html += '<div>Beds: <span class="num">' + stats.occupiedBeds + '/' + (stats.totalRooms * 2) + '</span></div>';
                html += '<div style="color:#1a237e;font-weight:700;">₹' + stats.totalRent + '</div>';
                html += '</div>';
                html += '</div>';
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
                const response = await fetch('/api/toggle-bed', {
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
                const response = await fetch('/api/calculate-bill', {
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
                const response = await fetch('/api/apply-bill', {
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
                const response = await fetch('/api/reset', {
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
    </script>
</body>
</html>`;

// ─── MAIN HANDLER ──────────────────────────────────────────────────────
export default {
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // ─── API ENDPOINTS ──────────────────────────────────────────────

        // Get all room data
        if (path === '/api/rooms' && request.method === 'GET') {
            return new Response(JSON.stringify(roomData), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get statistics
        if (path === '/api/stats' && request.method === 'GET') {
            const stats = getStats();
            return new Response(JSON.stringify(stats), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Calculate electricity bill
        if (path === '/api/calculate-bill' && request.method === 'POST') {
            try {
                const { units, price, block } = await request.json();
                const result = calculateElectricity(units, price, block);
                return new Response(JSON.stringify(result), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Apply electricity bill
        if (path === '/api/apply-bill' && request.method === 'POST') {
            try {
                const { units, price, block } = await request.json();
                const result = applyElectricityBill(units, price, block);
                return new Response(JSON.stringify(result), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Toggle bed occupancy
        if (path === '/api/toggle-bed' && request.method === 'POST') {
            try {
                const { roomNo, bedId, occupantName, rent } = await request.json();
                const result = toggleBed(roomNo, bedId, occupantName, rent);
                return new Response(JSON.stringify(result), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Reset all data
        if (path === '/api/reset' && request.method === 'POST') {
            const result = resetAllData();
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ─── SERVE HTML ──────────────────────────────────────────────────
        // Serve the HTML for all other routes
        return new Response(HTML_TEMPLATE, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
};
