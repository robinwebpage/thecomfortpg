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
                '2nd': { roomCount: 6,
