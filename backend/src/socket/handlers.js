const jwt = require('jsonwebtoken');

function setupSocketHandlers(io) {
    // Authentication middleware for socket
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        // Allow anonymous connections for website
        if (!token) {
            socket.user = null;
            return next();
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            // Allow connection but without authenticated user
            socket.user = null;
            next();
        }
    });

    io.on('connection', (socket) => {
        console.log(`[socket] client connected: ${socket.id}`);

        const joinRoleRooms = (role) => {
            if (!role) return;
            socket.join(role); // legacy alias
            socket.join(`role:${role}`);
            console.log(`[socket] ${socket.id} joined role rooms for ${role}`);
        };

        // Join branch room (for POS)
        socket.on('join:branch', (branchId) => {
            if (!branchId) return;
            socket.join(`branch:${branchId}`);
            console.log(`[socket] ${socket.id} joined branch ${branchId}`);
        });

        // Join KDS rooms
        socket.on('join:kds', (branchId) => {
            socket.join('kds'); // legacy alias room
            socket.join(`kds:${branchId || 'all'}`);
            socket.join('kds:all');
            console.log(`[socket] ${socket.id} joined KDS rooms`);
        });

        // Join role-based room for targeted notifications
        socket.on('join:role', (role) => {
            joinRoleRooms(role);
        });

        // Legacy cashier room support
        socket.on('join:cashier', () => {
            socket.join('cashier'); // legacy alias room
            joinRoleRooms('cashier');
            console.log(`[socket] ${socket.id} joined cashier rooms`);
        });

        // Auto-join role room if authenticated
        if (socket.user?.role) {
            joinRoleRooms(socket.user.role);
        }

        // Auto-join user branch room when available in token
        const tokenBranchId = socket.user?.branchId || socket.user?.branch_id || null;
        if (tokenBranchId) {
            socket.join(`branch:${tokenBranchId}`);
            console.log(`[socket] ${socket.id} auto-joined branch ${tokenBranchId}`);
        }

        // Join order room (for customer tracking)
        socket.on('join:order', (orderId) => {
            if (!orderId) return;
            socket.join(`order:${orderId}`);
            console.log(`[socket] ${socket.id} tracking order ${orderId}`);
        });

        // Leave order room
        socket.on('leave:order', (orderId) => {
            if (!orderId) return;
            socket.leave(`order:${orderId}`);
        });

        // Handle order status update from POS/KDS
        socket.on('order:status', async (data) => {
            const { orderId, status } = data || {};
            if (!orderId || !status) return;

            // Broadcast to all clients
            io.emit('order:updated', { orderId, status });

            // Also emit to specific order room (for customer tracking)
            io.to(`order:${orderId}`).emit('order:status:changed', { orderId, status });
        });

        // Ping for connection health
        socket.on('ping', () => {
            socket.emit('pong');
        });

        socket.on('disconnect', () => {
            console.log(`[socket] client disconnected: ${socket.id}`);
        });
    });

    // Helper function to emit to specific branch
    io.emitToBranch = (branchId, event, data) => {
        io.to(`branch:${branchId}`).emit(event, data);
    };

    // Helper function to emit to KDS
    io.emitToKDS = (branchId, event, data) => {
        io.to(`kds:${branchId || 'all'}`).emit(event, data);
        io.to('kds:all').emit(event, data);
        io.to('kds').emit(event, data); // legacy alias
    };

    return io;
}

module.exports = setupSocketHandlers;
