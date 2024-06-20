const io = require('socket.io-client');
const usernames = require('./username');
const locations = require('./location');
const roomNames = require('./roomname');
const conversations = require('./conversation');

const SERVER_URL = 'http://localhost:3000';
const MAX_ACTIVE_BOTS = 50;
const TYPING_DELAY = 100;
const BOT_CREATION_DELAY = 3000;
const JOIN_ROOM_PROBABILITY = 0.9; // 90% chance of being a joiner
const MIN_ROOM_STAY_DURATION = 30000; // Minimum duration in a room (30 seconds)
const MAX_ROOM_STAY_DURATION = 60000; // Maximum duration in a room (60 seconds)

const activeBots = new Set();
const rooms = new Map();

function generateRandomData() {
    return {
        username: usernames[Math.floor(Math.random() * usernames.length)],
        location: locations[Math.floor(Math.random() * locations.length)],
        userId: `bot_${Math.random().toString(36).substr(2, 9)}`,
        roomName: roomNames[Math.floor(Math.random() * roomNames.length)],
        message: conversations[Math.floor(Math.random() * conversations.length)]
    };
}

function createBot() {
    if (activeBots.size >= MAX_ACTIVE_BOTS) return;

    const botData = generateRandomData();
    const socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    const botRole = Math.random() < JOIN_ROOM_PROBABILITY ? 'joiner' : 'creator';
    botData.role = botRole;

    socket.on('connect', () => {
        console.log(`${botData.username} connected as a ${botRole}`);
        socket.emit('userConnected', { userId: botData.userId });
        setTimeout(() => {
            if (botRole === 'joiner') {
                console.log(`${botData.username} is set to join a room`);
                socket.emit('getExistingRooms');
            } else {
                console.log(`${botData.username} is set to create a room`);
                createRoom(socket, botData);
            }
        }, Math.random() * 2000 + 1000);
    });

    socket.on('existingRooms', (existingRooms) => {
        if (botRole !== 'joiner') return;

        console.log(`${botData.username} received existing rooms: ${JSON.stringify(existingRooms)}`);
        const availableRooms = existingRooms.filter(room => room.users.length < 5 && room.type === 'public'); // Filter out private rooms
        if (availableRooms.length > 0) {
            const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
            botData.roomId = randomRoom.id;
            socket.emit('joinRoom', {
                roomId: randomRoom.id,
                username: botData.username,
                location: botData.location,
                userId: botData.userId,
            });
            console.log(`${botData.username} joined room ${randomRoom.name}`);
        } else {
            console.log(`${botData.username} did not find an available room, creating a new one...`);
            createRoom(socket, botData);
        }
    });

    socket.on('roomCreated', (room, creatorSocketId) => {
        if (socket.id === creatorSocketId) {
            botData.roomId = room.id;
            rooms.set(room.id, room);
            console.log(`${botData.username} created and joined room ${room.name}`);
            startTyping(socket, botData);
            scheduleRoomLeaving(socket, botData);
        }
    });

    socket.on('roomJoined', (data) => {
        botData.roomId = data.roomId;
        if (!rooms.has(data.roomId)) {
            rooms.set(data.roomId, { id: data.roomId, users: [] });
        }
        console.log(`${botData.username} joined room ${data.roomId}`);
        startTyping(socket, botData);
        scheduleRoomLeaving(socket, botData);
    });

    socket.on('userLeft', (data) => {
        if (data.userId === botData.userId) {
            botData.roomId = null;
            console.log(`${botData.username} left room ${data.roomId}`);
            destroyBot(socket, botData);
        }
    });

    socket.on('disconnect', () => {
        console.log(`${botData.username} disconnected`);
        activeBots.delete(socket);
        maintainBotCount();
    });

    activeBots.add(socket);
    console.log(`Active bots: ${activeBots.size}`);

    function startTyping(socket, botData) {
        if (!botData.roomId) return;

        let isTyping = false;
        let typingTimeout;
        let messageTimeout;
        let deleteTimeout;

        console.log(`${botData.username} started typing in room ${botData.roomId}`);

        function sendRandomMessage() {
            if (isTyping) return;
            isTyping = true;

            const message = generateRandomData().message;
            let index = 0;

            clearTimeout(typingTimeout);
            clearTimeout(messageTimeout);
            clearTimeout(deleteTimeout);

            function typeNextChar() {
                if (index < message.length) {
                    socket.emit('typing', { roomId: botData.roomId, userId: botData.userId, message: message.slice(0, index + 1) });
                    index++;
                    const typingDelay = Math.random() * 200 + 50; // Random typing delay between 50 and 250 ms
                    typingTimeout = setTimeout(typeNextChar, typingDelay);
                } else {
                    messageTimeout = setTimeout(() => {
                        socket.emit('message', { roomId: botData.roomId, userId: botData.userId, message });
                        console.log(`${botData.username} sent message in room ${botData.roomId}: ${message}`);
                        deleteMessage();
                    }, 1000); // Short delay before deleting the message
                }
            }

            function deleteMessage() {
                deleteTimeout = setTimeout(() => {
                    socket.emit('deleteMessage', { roomId: botData.roomId, userId: botData.userId });
                    console.log(`${botData.username} deleted message in room ${botData.roomId}`);
                    isTyping = false;
                    scheduleNextMessage();
                }, 2000); // Delay before typing the next message
            }

            typeNextChar();
        }

        function scheduleNextMessage() {
            const delay = Math.random() * 5000 + 2000; // Random delay between 2 and 7 seconds
            setTimeout(sendRandomMessage, delay);
        }

        sendRandomMessage();
    }

    function leaveRoom(socket, botData) {
        if (botData.roomId) {
            socket.emit('leaveRoom', { roomId: botData.roomId, userId: botData.userId });
            console.log(`${botData.username} left room ${botData.roomId}`);
            botData.roomId = null;
            destroyBot(socket, botData);
        }
    }

    function scheduleRoomLeaving(socket, botData) {
        const roomStayDuration = MIN_ROOM_STAY_DURATION + Math.random() * (MAX_ROOM_STAY_DURATION - MIN_ROOM_STAY_DURATION);
        setTimeout(() => leaveRoom(socket, botData), roomStayDuration);
    }
}

function createRoom(socket, botData) {
    socket.emit('createRoom', {
        username: botData.username,
        location: botData.location,
        userId: botData.userId,
        name: botData.roomName,
        type: 'public'
    });
    console.log(`${botData.username} creating room ${botData.roomName}`);
}

function destroyBot(socket, botData) {
    console.log(`Destroying bot: ${botData.username}`);
    activeBots.delete(socket);
    socket.disconnect();
}

function maintainBotCount() {
    console.log(`Maintaining bot count. Current active bots: ${activeBots.size}`);
    const botsToCreate = MAX_ACTIVE_BOTS - activeBots.size;
    if (botsToCreate > 0) {
        for (let i = 0; i < botsToCreate; i++) {
            setTimeout(createBot, BOT_CREATION_DELAY * i);
        }
    }
}

// Start the simulation
maintainBotCount();
