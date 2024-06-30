const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const OFFENSIVE_WORDS = require('./offensiveWords.js');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.json());
app.use(cookieParser());
app.use(compression());
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

const rooms = new Map();
const activeUsers = new Set();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map();
const birthdayCelebrated = new Map();

const MAX_CHAR_LENGTH = 20;

// Define allowed moderators
const allowedMods = ['user_je5t88db3']; // Add more user IDs as needed

// Function to generate a secure userId
function generateSecureUserId() {
  return crypto.randomBytes(16).toString('hex');
}

// Middleware to ensure user has a userId
app.use((req, res, next) => {
  if (!req.cookies.userId) {
    const userId = generateSecureUserId();
    res.cookie('userId', userId, { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
  }
  next();
});

app.use((req, res, next) => {
    const userId = req.cookies.userId;
    if (userId && isUserBanned(userId) && req.path !== '/why-was-i-removed.html' && req.path !== '/removed.html') {
        return res.redirect('/removed.html');
    }
    next();
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/join.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'join.html'));
});

app.get('/removed', (req, res) => {
    res.sendFile(path.join(__dirname, 'removed.html'));
});

app.get('/why-was-i-removed.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'why-was-i-removed.html'));
});

app.get('/offensive-words', (req, res) => {
    res.json(OFFENSIVE_WORDS);
});

app.post('/verify-mod-code', (req, res) => {
    const { initialCode, modCode } = req.body;
    const userId = req.cookies.userId;
    const correctInitialCode = '786215';
    const correctModCode = 'your_secure_mod_code_here'; // Set this to your actual mod code

    if (initialCode === correctInitialCode && modCode === correctModCode && allowedMods.includes(userId)) {
        res.cookie('isModerator', 'true', { 
            httpOnly: true, 
            secure: true, 
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// New offensive word detection system
function tokenize(text) {
    return text.toLowerCase().split(/\s+/).map(word => word.replace(/[^\w]/g, ''));
}

function isOffensiveWord(word, offensiveWord) {
    if (word === offensiveWord) return true;
    
    const obfuscatedWord = word.replace(/[0@]/g, 'o')
                               .replace(/[1!]/g, 'i')
                               .replace(/[3]/g, 'e')
                               .replace(/[4]/g, 'a')
                               .replace(/[5]/g, 's')
                               .replace(/[$]/g, 's')
                               .replace(/[7]/g, 't');
    
    return obfuscatedWord === offensiveWord;
}

function containsOffensiveContent(text) {
    const tokens = tokenize(text);
    return OFFENSIVE_WORDS.some(offensiveWord => 
        tokens.some(token => isOffensiveWord(token, offensiveWord))
    );
}

io.on('connection', (socket) => {
    socket.on('userConnected', (data) => {
        const userId = socket.request.cookies.userId;
        const isModerator = socket.request.cookies.isModerator === 'true';
        
        if (isUserBanned(userId)) {
            socket.emit('userBanned', getBanExpiration(userId));
            return;
        }

        socket.userId = userId;
        socket.modMode = isModerator;
        activeUsers.add(userId);
        updateCounts();
        sendRandomRooms(socket);
    });

    socket.on('searchRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.type !== 'secret') {
            socket.emit('searchResult', room);
        } else {
            socket.emit('searchResult', null);
        }
    });

    socket.on('getExistingRooms', () => {
        sendRandomRooms(socket);
    });

    socket.on('userDisconnected', (data) => {
        const userId = socket.request.cookies.userId;
        activeUsers.delete(userId);
        updateCounts();
    });

    socket.on('createRoom', (roomData) => {
        const { username, location, name, type, color } = roomData;
        const userId = socket.request.cookies.userId;
    
        if (!username || !location || !userId || !name || !['public', 'private', 'secret'].includes(type)) {
            socket.emit('error', 'Invalid input');
            return;
        }
    
        if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || name.length > MAX_CHAR_LENGTH) {
            socket.emit('error', 'Input exceeds maximum length');
            return;
        }
    
        if (containsOffensiveContent(username) || containsOffensiveContent(location) || containsOffensiveContent(name)) {
            socket.emit('offensiveWordError', 'Input contains offensive words');
            return;
        }

        const roomId = generateRoomId();
        const room = {
            id: roomId,
            name: name,
            type: type,
            users: [{ username, location, userId, socketId: socket.id, color, modMode: socket.modMode }],
            birthdayMessagesSent: new Set(),
            votes: {}
        };
        rooms.set(roomId, room);

        if (room.type !== 'secret') {
            socket.broadcast.emit('roomCreated', room);
        }

        io.emit('roomUpdated', room);

        socket.join(roomId);
        socket.emit('roomJoined', { 
            roomId, 
            username, 
            location, 
            userId, 
            roomType: type, 
            roomName: name,
            color, 
            modMode: socket.modMode
        });
        socket.emit('initializeUsers', room.users);
    
        updateCounts();
    });

    socket.on('joinRoom', (data) => {
        const { roomId, username, location, color, avatar } = data;
        const userId = socket.request.cookies.userId;
    
        if (!roomId || !username || !location || !userId) {
            socket.emit('error', 'Invalid input');
            return;
        }
    
        if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || roomId.length > MAX_CHAR_LENGTH) {
            socket.emit('error', 'Input exceeds maximum length');
            return;
        }
    
        if (containsOffensiveContent(username) || containsOffensiveContent(location)) {
            socket.emit('offensiveWordError', 'Input contains offensive words');
            return;
        }

        const room = rooms.get(roomId);
        if (room) {
            const existingUser = room.users.find(user => user.userId === userId);
            if (existingUser) {
                socket.emit('duplicateUser', { message: 'You are already in this room.', redirectUrl: 'index.html' });
                return;
            }

            if (roomDeletionTimeouts.has(roomId)) {
                clearTimeout(roomDeletionTimeouts.get(roomId));
                roomDeletionTimeouts.delete(roomId);
            }

            if (room.users.length < 5) {
                room.users.push({ username, location, userId, socketId: socket.id, color, modMode: socket.modMode, avatar });
                socket.join(roomId);
                io.emit('roomUpdated', room);
                socket.emit('roomJoined', { roomId, username, location, userId, roomType: room.type, roomName: room.name, color, modMode: socket.modMode, avatar });
                socket.emit('initializeUsers', room.users);
                socket.to(roomId).emit('userJoined', { roomId, username, location, userId, color, modMode: socket.modMode, avatar });

                const voteCounts = {};
                for (const [key, value] of Object.entries(room.votes)) {
                    voteCounts[key] = value.size;
                }
                socket.emit('updateAllThumbsDownCounts', voteCounts);

                updateCounts();
            } else {
                socket.emit('roomFull');
            }
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('leaveRoom', (data) => {
        const { roomId } = data;
        const userId = socket.request.cookies.userId;

        const room = rooms.get(roomId);
        if (room) {
            const userIndex = room.users.findIndex((user) => user.userId === userId);
            if (userIndex !== -1) {
                const user = room.users.splice(userIndex, 1)[0];
                socket.leave(roomId);
                io.emit('roomUpdated', room);
                socket.to(roomId).emit('userLeft', { roomId, userId: user.userId });

                const roomBirthdayKey = `${roomId}-${userId}`;
                birthdayCelebrated.delete(roomBirthdayKey);

                delete room.votes[userId];

                for (const voters of Object.values(room.votes)) {
                    voters.delete(userId);
                }

                for (const [targetUserId, voters] of Object.entries(room.votes)) {
                    io.to(roomId).emit('updateThumbsDownCount', { userId: targetUserId, count: voters.size });
                }

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

    socket.on('typing', (data) => {
        const { roomId, message, color } = data;
        const userId = socket.request.cookies.userId;
        socket.to(roomId).emit('typing', { userId, message, color });
    });

    socket.on('message', (data) => {
        const { roomId, message, color } = data;
        const userId = socket.request.cookies.userId;

        if (containsOffensiveContent(message)) {
            const banDuration = 30 * 1000;
            const banExpiration = Date.now() + banDuration;
            bannedUsers.set(userId, banExpiration);

            socket.emit('userBanned', banExpiration);

            const room = rooms.get(roomId);
            if (room) {
                const userIndex = room.users.findIndex((user) => user.userId === userId);
                if (userIndex !== -1) {
                    room.users.splice(userIndex, 1);
                    socket.leave(roomId);
                    io.emit('roomUpdated', room);
                    socket.to(roomId).emit('userLeft', { roomId, userId });
                }
            }

            socket.disconnect();
            return;
        } else {
            const room = rooms.get(roomId);

            if (isBirthdayMessage(message) && !room.birthdayMessagesSent.has(userId)) {
                room.birthdayMessagesSent.add(userId);
                io.in(roomId).emit('birthdayMessage', { username: room.users.find(u => u.userId === userId).username });
            } else {
                io.to(roomId).emit('message', { userId, message, color });
            }
        }
    });

    socket.on('birthdayMessage', (data) => {
        const { roomId, username } = data;
        const userId = socket.request.cookies.userId;
        const roomBirthdayKey = `${roomId}-${userId}`;
        if (!birthdayCelebrated.has(roomBirthdayKey)) {
            io.to(roomId).emit('birthdayMessage', { username });
            birthdayCelebrated.set(roomBirthdayKey, true);
        }
    });

    socket.on('thumbsDown', (data) => {
        const { roomId, targetUserId } = data;
        const userId = socket.request.cookies.userId;
        const room = rooms.get(roomId);
        if (!room) return;
    
        const votingUser = room.users.find(user => user.userId === userId);
        if (!votingUser || votingUser.userId === targetUserId) {
            return;
        }
    
        if (room.users.length < 3) {
            socket.emit('votingDisabled', { message: 'Voting is disabled when there are fewer than 3 users in the room.' });
            return;
        }
    
        const targetUser = room.users.find(user => user.userId === targetUserId);
        if (targetUser && targetUser.modMode) {
            socket.emit('votingDisabled', { message: 'You cannot vote to remove a moderator.' });
            return;
        }
    
        if (!room.votes[targetUserId]) {
            room.votes[targetUserId] = new Set();
        }
    
        const hasVoted = room.votes[targetUserId].has(userId);
        if (hasVoted) {
            room.votes[targetUserId].delete(userId);
        } else {
            for (const [voteUserId, voters] of Object.entries(room.votes)) {
                if (voters.has(userId)) {
                    voters.delete(userId);
                    io.to(roomId).emit('updateThumbsDownCount', { userId: voteUserId, count: voters.size });
                }
            }