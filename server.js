const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const OFFENSIVE_WORDS = require('./offensiveWords'); // Import the offensive words

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const rooms = new Map();
const activeUsers = new Set();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map(); // Store banned users and their ban expiration times

const MAX_CHAR_LENGTH = 20;

// Middleware setup
app.use(express.static(path.join(__dirname)));
app.use(cookieParser());
app.use(compression());
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
}));

// Middleware to check if a user is banned
app.use((req, res, next) => {
    const userId = req.cookies.userId; // Assumes userId is stored in cookies
    if (userId && isUserBanned(userId) && req.path !== '/why-was-i-removed.html' && req.path !== '/removed.html') {
        return res.redirect('/removed.html');
    }
    next();
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/removed', (req, res) => {
    res.sendFile(path.join(__dirname, 'removed.html'));
});

app.get('/why-was-i-removed.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'why-was-i-removed.html'));
});

// Socket.IO setup
io.on('connection', (socket) => {
    // Handle user connection
    socket.on('userConnected', (data) => {
        const { userId } = data;
        if (isUserBanned(userId)) {
            socket.emit('userBanned', getBanExpiration(userId));
            return;
        }

        socket.userId = userId;
        activeUsers.add(userId);
        updateCounts();
        // Send the existing rooms to the newly connected client
        sendRandomRooms(socket);
    });

    // Handle room search
    socket.on('searchRoom', (roomId) => {
        const room = rooms.get(roomId);
        socket.emit('searchResult', room || null);
    });

    // Handle request to get existing rooms
    socket.on('getExistingRooms', () => {
        sendRandomRooms(socket);
    });

    // Handle user disconnection
    socket.on('userDisconnected', (data) => {
        const { userId } = data;
        activeUsers.delete(userId);
        updateCounts();
    });

    // Handle room creation
    socket.on('createRoom', (roomData) => {
        const { username, location, userId, name, type } = roomData;

        // Validate inputs
        if (!username || !location || !userId || !name || !['public', 'private'].includes(type)) {
            socket.emit('error', 'Invalid input');
            return;
        }

        if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || name.length > MAX_CHAR_LENGTH) {
            socket.emit('error', 'Input exceeds maximum length');
            return;
        }

        // Check for offensive words
        if (containsOffensiveWords(username)) {
            socket.emit('offensiveWord', 'username');
            return;
        }
        if (containsOffensiveWords(location)) {
            socket.emit('offensiveWord', 'location');
            return;
        }
        if (containsOffensiveWords(name)) {
            socket.emit('offensiveWord', 'room name');
            return;
        }

        const roomId = generateRoomId();
        const room = {
            id: roomId,
            name: name,
            type: type,
            users: [{ username: username, location: location, userId: userId, socketId: socket.id }]
        };
        rooms.set(roomId, room);

        // Emit 'roomCreated' only to other clients
        socket.broadcast.emit('roomCreated', room);
        
        // Emit 'roomUpdated' to all clients, including the creator
        io.emit('roomUpdated', room);

        socket.join(roomId);
        socket.emit('roomJoined', { 
            roomId, 
            username, 
            location, 
            userId, 
            roomType: type, 
            roomName: name 
        });
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
    
        // Check for offensive words
        if (containsOffensiveWords(username)) {
            socket.emit('offensiveWord', 'username');
            return;
        }
        if (containsOffensiveWords(location)) {
            socket.emit('offensiveWord', 'location');
            return;
        }
    
        const room = rooms.get(roomId);
        if (room) {
            // Check if the user is already in the room
            const existingUser = room.users.find(user => user.userId === userId);
            if (existingUser) {
                socket.emit('duplicateUser', { message: 'You are already in this room.', redirectUrl: 'index.html' });
                return;
            }
    
            // Clear any existing deletion timeout for the room
            if (roomDeletionTimeouts.has(roomId)) {
                clearTimeout(roomDeletionTimeouts.get(roomId));
                roomDeletionTimeouts.delete(roomId);
            }
    
            if (room.users.length < 5) {
                room.users.push({ username, location, userId, socketId: socket.id });
            } else {
                socket.emit('roomFull');
                return;
            }
    
            socket.join(roomId);
            io.emit('roomUpdated', room);
            socket.emit('roomJoined', { roomId, username, location, userId, roomType: room.type, roomName: room.name });
            socket.emit('initializeUsers', room.users);
            socket.to(roomId).emit('userJoined', { roomId, username, location, userId });
    
            updateCounts();
        } else {
            socket.emit('roomNotFound');
        }
    });
    // Handle room leaving
    socket.on('leaveRoom', (data) => {
        const { roomId, userId } = data;

        const room = rooms.get(roomId);
        if (room) {
            const userIndex = room.users.findIndex((user) => user.userId === userId);
            if (userIndex !== -1) {
                const user = room.users.splice(userIndex, 1)[0];
                socket.leave(roomId);
                io.emit('roomUpdated', room);
                socket.to(roomId).emit('userLeft', { roomId, userId: user.userId });

                if (room.users.length === 0) {
                    roomDeletionTimeouts.set(roomId, setTimeout(() => {
                        rooms.delete(roomId);
                        io.emit('roomRemoved', roomId);
                        roomDeletionTimeouts.delete(roomId);
                    }, 10000));
                }

                updateCounts();
            }
        }
    });

    // Handle typing event
    socket.on('typing', (data) => {
        const { roomId, userId, message } = data;

        // Check for offensive words
        if (containsOffensiveWords(message)) {
            const banExpiration = Date.now() + 30 * 1000; // 30 seconds from now
            bannedUsers.set(userId, banExpiration);
            socket.emit('userBanned', banExpiration);
            setTimeout(() => {
                socket.disconnect(); // Disconnect the user from the server
            }, 100); // Slight delay to allow the event to be processed
            return;
        }

        socket.to(roomId).emit('typing', { userId, message });
    });

    // Handle sending messages
    socket.on('message', (data) => {
        const { roomId, userId, message } = data;

        // Check for offensive words
        if (containsOffensiveWords(message)) {
            const banExpiration = Date.now() + 30 * 1000; // 30 seconds from now
            bannedUsers.set(userId, banExpiration);
            socket.emit('userBanned', banExpiration);
            setTimeout(() => {
                socket.disconnect(); // Disconnect the user from the server
            }, 100); // Slight delay to allow the event to be processed
            return;
        }

        socket.to(roomId).emit('message', { userId, message });
    });

    // Handle socket disconnection
    socket.on('disconnect', () => {
        if (socket.userId) {
            activeUsers.delete(socket.userId);
        }
        rooms.forEach((room, roomId) => {
            const userIndex = room.users.findIndex((user) => user.socketId === socket.id);
            if (userIndex !== -1) {
                const user = room.users.splice(userIndex, 1)[0];
                io.emit('roomUpdated', room);
                socket.to(roomId).emit('userLeft', { roomId, userId: user.userId });

                // Start the deletion timeout if there are no users left in the room
                if (room.users.length === 0) {
                    roomDeletionTimeouts.set(roomId, setTimeout(() => {
                        rooms.delete(roomId);
                        io.emit('roomRemoved', roomId);
                        roomDeletionTimeouts.delete(roomId);
                    }, 10000)); // 10 seconds delay
                }

                updateCounts();
            }
        });
    });
});

function sendRandomRooms(socket) {
    const publicRooms = Array.from(rooms.values()).filter(room => room.type === 'public');
    const randomRooms = publicRooms.sort(() => 0.5 - Math.random()); // Shuffle rooms
    socket.emit('existingRooms', randomRooms);
}

function updateCounts() {
    const roomsCount = rooms.size;
    const usersCount = Array.from(rooms.values()).reduce((acc, room) => acc + room.users.length, 0);
    io.emit('updateCounts', { roomsCount, usersCount });
}

function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function containsOffensiveWords(message) {
    const lowerCaseMessage = message.toLowerCase();
    return OFFENSIVE_WORDS.some(word => lowerCaseMessage.includes(word));
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
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
