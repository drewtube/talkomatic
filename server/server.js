const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const OFFENSIVE_WORDS = require('../js/offensiveWords.js');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.json());

const rooms = new Map();
const activeUsers = new Set();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map();
const birthdayCelebrated = new Map();

const MAX_CHAR_LENGTH = 20;

// Define allowed moderators
const allowedMods = ['user_j369j5gkz','user_crzuhudgz','user_cc7r68nu0','GPT4All','user_pl43x2vca','user_1csrwjjd7','user_030skg48h','user_f379qlasz','user_nict8jm8e','user_7zl2kndsl']; // Add more user IDs as needed

app.use(express.static(path.join(__dirname, '../')));
app.use(cookieParser());
app.use(compression());
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

app.use((req, res, next) => {
    const userId = req.cookies.userId;
    if (userId && isUserBanned(userId) && req.path !== '/html/why-was-i-removed.html' && req.path !== '/html/removed.html') {
        return res.redirect('/html/removed.html');
    }
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/join.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/join.html'));
});

app.get('/removed', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/removed.html'));
});

app.get('/why-was-i-removed.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/why-was-i-removed.html'));
});

app.get('/offensive-words', (req, res) => {
    res.json(OFFENSIVE_WORDS);
});

app.post('/verify-mod-code', (req, res) => {
    const { code, userId } = req.body;
    const correctCode = '786215'; // Your actual mod code

    if (code === correctCode && allowedMods.includes(userId)) {
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
        const { userId } = data;
        if (isUserBanned(userId)) {
            socket.emit('userBanned', getBanExpiration(userId));
            return;
        }

        socket.userId = userId;
        socket.modMode = allowedMods.includes(userId);
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
        const { userId } = data;
        activeUsers.delete(userId);
        updateCounts();
    });

    socket.on('createRoom', (roomData) => {
        const { username, location, userId, name, type, color } = roomData;
    
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
            users: [{ username, location, userId, socketId: socket.id, color, modMode: allowedMods.includes(userId) }],
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
            modMode: allowedMods.includes(userId)
        });
        socket.emit('initializeUsers', room.users);
    
        updateCounts();
    });

    socket.on('joinRoom', (data) => {
        const { roomId, username, location, userId, color, avatar } = data;
    
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
                socket.emit('duplicateUser', { message: 'You are already in this room.', redirectUrl: '../index.html' });
                return;
            }

            if (roomDeletionTimeouts.has(roomId)) {
                clearTimeout(roomDeletionTimeouts.get(roomId));
                roomDeletionTimeouts.delete(roomId);
            }

            if (room.users.length < 5) {
                const modMode = allowedMods.includes(userId);
                room.users.push({ username, location, userId, socketId: socket.id, color, modMode, avatar });
                socket.join(roomId);
                io.emit('roomUpdated', room);
                socket.emit('roomJoined', { roomId, username, location, userId, roomType: room.type, roomName: room.name, color, modMode, avatar });
                socket.emit('initializeUsers', room.users);
                socket.to(roomId).emit('userJoined', { roomId, username, location, userId, color, modMode, avatar });

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
        const { roomId, userId } = data;

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
        const { roomId, userId, message, color } = data;
        socket.to(roomId).emit('typing', { userId, message, color });
    });

    socket.on('message', (data) => {
        const { roomId, userId, message, color } = data;
        const room = rooms.get(roomId);
    
        if (isBirthdayMessage(message) && !room.birthdayMessagesSent.has(userId)) {
            room.birthdayMessagesSent.add(userId);
            io.in(roomId).emit('birthdayMessage', { username: room.users.find(u => u.userId === userId).username });
        } else {
            io.to(roomId).emit('message', { userId, message, color });
        }
    });

    socket.on('birthdayMessage', (data) => {
        const { roomId, username } = data;
        const roomBirthdayKey = `${roomId}-${socket.userId}`;
        if (!birthdayCelebrated.has(roomBirthdayKey)) {
            io.to(roomId).emit('birthdayMessage', { username });
            birthdayCelebrated.set(roomBirthdayKey, true);
        }
    });

    socket.on('thumbsDown', (data) => {
        const { roomId, targetUserId } = data;
        const room = rooms.get(roomId);
        if (!room) return;
    
        const votingUser = room.users.find(user => user.socketId === socket.id);
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
    
        const hasVoted = room.votes[targetUserId].has(votingUser.userId);
        if (hasVoted) {
            room.votes[targetUserId].delete(votingUser.userId);
        } else {
            for (const [userId, voters] of Object.entries(room.votes)) {
                if (voters.has(votingUser.userId)) {
                    voters.delete(votingUser.userId);
                    io.to(roomId).emit('updateThumbsDownCount', { userId, count: voters.size });
                }
            }
            room.votes[targetUserId].add(votingUser.userId);
        }
    
        const thumbsDownCount = room.votes[targetUserId].size;
        io.to(roomId).emit('updateThumbsDownCount', { userId: targetUserId, count: thumbsDownCount });
    
        const majorityCount = Math.ceil(room.users.length / 2);
        if (thumbsDownCount >= majorityCount) {
            const userToRemove = room.users.find(user => user.userId === targetUserId);
            if (userToRemove) {
                io.to(roomId).emit('userVotedOut', { username: userToRemove.username });
    
                setTimeout(() => {
                    room.users = room.users.filter(user => user.userId !== targetUserId);
    
                    delete room.votes[targetUserId];
    
                    for (const voters of Object.values(room.votes)) {
                        voters.delete(targetUserId);
                    }
    
                    io.to(roomId).emit('userLeft', { roomId, userId: targetUserId });
                    i .to(userToRemove.socketId).emit('removedFromRoom');
    
                    for (const [userId, voters] of Object.entries(room.votes)) {
                        io.to(roomId).emit('updateThumbsDownCount', { userId, count: voters.size });
                    }
    
                    updateCounts();
                }, 3000);
            }
        }
    });

    socket.on('removeUser', (data) => {
        const { roomId, targetUserId, banDuration } = data;
        const room = rooms.get(roomId);
        if (!room) return;
    
        const removingUser = room.users.find(user => user.socketId === socket.id);
        if (!removingUser || !removingUser.modMode || removingUser.userId === targetUserId) {
            return;
        }
    
        const userToRemove = room.users.find(user => user.userId === targetUserId);
        if (userToRemove) {
            const banExpiration = Date.now() + banDuration;
            bannedUsers.set(targetUserId, banExpiration);
            
            io.to(userToRemove.socketId).emit('userBanned', banExpiration);
    
            io.to(roomId).emit('userRemovedByModerator', { username: userToRemove.username });
    
            room.users = room.users.filter(user => user.userId !== targetUserId);
            
            delete room.votes[targetUserId];
    
            for (const voters of Object.values(room.votes)) {
                voters.delete(targetUserId);
            }
    
            io.to(roomId).emit('userLeft', { roomId, userId: targetUserId });
            io.to(userToRemove.socketId).emit('removedFromRoom');
    
            for (const [userId, voters] of Object.entries(room.votes)) {
                io.to(roomId).emit('updateThumbsDownCount', { userId, count: voters.size });
            }
    
            updateCounts();
        }
    });
    
    
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

                delete room.votes[user.userId];

                for (const voters of Object.values(room.votes)) {
                    voters.delete(user.userId);
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
        });

        for (const [key, value] of birthdayCelebrated.entries()) {
            if (key.endsWith(`-${socket.userId}`)) {
                birthdayCelebrated.delete(key);
            }
        }
    });
});

function sendRandomRooms(socket) {
    const publicRooms = Array.from(rooms.values()).filter(room => room.type === 'public');
    const randomRooms = publicRooms.sort(() => 0.5 - Math.random());
    socket.emit('existingRooms', randomRooms);
}

function updateCounts() {
    const publicRoomsCount = Array.from(rooms.values()).filter(room => room.type === 'public').length;
    const usersCount = Array.from(rooms.values()).reduce((acc, room) => acc + room.users.length, 0);
    io.emit('updateCounts', { roomsCount: publicRoomsCount, usersCount });
}

function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function isUserBanned(userId) {
    if (!bannedUsers.has(userId)) return false;
    const banExpiration = bannedUsers.get(userId);
    if (Date.now() > banExpiration) {
        bannedUsers.delete(userId);
        return false;
    }
    return true;
}

function getBanExpiration(userId) {
    return bannedUsers.get(userId);
}

function isBirthdayMessage(message) {
    const birthdayPhrases = [
        "today is my birthday", "it's my birthday", "it is my birthday",
        "today's my birthday", "my birthday is today", "i'm celebrating my birthday",
        "im celebrating my birthday", "today is my bday", "its my bday",
        "it's my bday", "my bday is today", "celebrating my bday",
        "my birthday party is today", "having my birthday party", "born on this day"
    ];
    return birthdayPhrases.some(phrase => message.toLowerCase().includes(phrase));
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});