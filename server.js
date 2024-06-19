const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const validator = require('validator');
const escapeHtml = require('escape-html');
const OFFENSIVE_WORDS = require('./offensiveWords'); // Import the offensive words

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const rooms = {};
const activeUsers = new Set();
const roomDeletionTimeouts = {};
const bannedUsers = new Map(); // Store banned users and their ban expiration times

const MAX_CHAR_LENGTH = 20;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/banned', (req, res) => {
    res.sendFile(path.join(__dirname, 'banned.html'));
});

io.on('connection', (socket) => {
    socket.on('userConnected', (data) => {
        const { userId } = data;
        if (isUserBanned(userId)) {
            socket.emit('userBanned', getBanExpiration(userId));
            return;
        }

        activeUsers.add(userId);
        updateCounts();
        // Send the existing rooms to the newly connected client
        socket.emit('existingRooms', Object.values(rooms));
    });

    socket.on('userDisconnected', (data) => {
        const { userId } = data;
        activeUsers.delete(userId);
        updateCounts();
    });

    socket.on('createRoom', (roomData) => {
        const { username, location, userId, name, type, layout } = roomData;

        // Validate inputs
        if (!username || !location || !userId || !name || !['public', 'private', 'secret'].includes(type) || !['horizontal', 'vertical'].includes(layout)) {
            socket.emit('error', 'Invalid input');
            return;
        }

        if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || name.length > MAX_CHAR_LENGTH) {
            socket.emit('error', 'Input exceeds maximum length');
            return;
        }

        // Sanitize inputs
        const sanitizedUsername = escapeHtml(username);
        const sanitizedLocation = escapeHtml(location);
        const sanitizedUserId = escapeHtml(userId);
        const sanitizedName = escapeHtml(name);

        const roomId = generateRoomId();
        const room = {
            id: roomId,
            name: sanitizedName,
            type: type,
            layout: layout,
            users: [{ username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId, socketId: socket.id }]
        };
        rooms[roomId] = room;
        io.emit('roomCreated', room);
        socket.join(roomId);
        socket.emit('roomJoined', { roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId });
        socket.emit('initializeUsers', room.users);

        updateCounts();
    });

    socket.on('joinRoom', (data) => {
        const { roomId, username, location, userId } = data;

        // Validate inputs
        if (!roomId || !username || !location || !userId) {
            socket.emit('error', 'Invalid input');
            return;
        }

        if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || roomId.length > MAX_CHAR_LENGTH) {
            socket.emit('error', 'Input exceeds maximum length');
            return;
        }

        // Sanitize inputs
        const sanitizedUsername = escapeHtml(username);
        const sanitizedLocation = escapeHtml(location);
        const sanitizedUserId = escapeHtml(userId);

        if (rooms[roomId]) {
            // Clear any existing deletion timeout for the room
            if (roomDeletionTimeouts[roomId]) {
                clearTimeout(roomDeletionTimeouts[roomId]);
                delete roomDeletionTimeouts[roomId];
            }

            if (rooms[roomId].users.length < 5) {
                rooms[roomId].users.push({ username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId, socketId: socket.id });
                socket.join(roomId);
                io.emit('roomUpdated', rooms[roomId]);
                socket.emit('roomJoined', { roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId });
                socket.emit('initializeUsers', rooms[roomId].users);
                socket.to(roomId).emit('userJoined', { roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId });

                updateCounts();
            } else {
                socket.emit('roomFull');
            }
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('typing', (data) => {
        const { roomId, userId, message } = data;

        // Sanitize message
        const sanitizedMessage = escapeHtml(message);

        // Check for offensive words
        if (containsOffensiveWords(sanitizedMessage)) {
            const banExpiration = Date.now() + 30 * 60 * 1000; // 30 minutes from now
            bannedUsers.set(userId, banExpiration);
            socket.emit('userBanned', banExpiration);
            setTimeout(() => {
                socket.disconnect(); // Disconnect the user from the server
            }, 100); // Slight delay to allow the event to be processed
            return;
        }

        socket.to(roomId).emit('typing', { userId, message: sanitizedMessage });
    });

    socket.on('disconnect', () => {
        Object.keys(rooms).forEach((roomId) => {
            const room = rooms[roomId];
            const userIndex = room.users.findIndex((user) => user.socketId === socket.id);
            if (userIndex !== -1) {
                const user = room.users.splice(userIndex, 1)[0];
                io.emit('roomUpdated', room);
                socket.to(roomId).emit('userLeft', { roomId, userId: user.userId });

                // Start the deletion timeout if there are no users left in the room
                if (room.users.length === 0) {
                    roomDeletionTimeouts[roomId] = setTimeout(() => {
                        delete rooms[roomId];
                        io.emit('roomRemoved', roomId);
                        delete roomDeletionTimeouts[roomId];
                    }, 10000); // 10 seconds delay
                }
            }
        });

        updateCounts();
    });
});

function updateCounts() {
    const roomsCount = Object.keys(rooms).length;
    const usersCount = activeUsers.size;
    io.emit('updateCounts', { roomsCount, usersCount });
}

function generateRoomId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function containsOffensiveWords(message) {
    const lowerCaseMessage = message.toLowerCase();
    return OFFENSIVE_WORDS.some(word => lowerCaseMessage.includes(word));
}

function banUser(userId) {
    const banExpiration = Date.now() + 30 * 60 * 1000; // 30 minutes from now
    bannedUsers.set(userId, banExpiration);
}

function isUserBanned(userId) {
    if (!bannedUsers.has(userId)) return false;
    const banExpiration = bannedUsers.get(userId);
    if (Date.now() > banExpiration) {
        bannedUsers.delete(userId); // Remove ban if expired
        return false;
    }
    return true;
}

function getBanExpiration(userId) {
    return bannedUsers.get(userId);
}

const port = process.env.PORT || 3000;
server.listen(port);
