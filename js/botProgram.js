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
        lastQuestion: null,
        role: null,
        roomId: null
    };
}

function generateConversationMessage(botData) {
    const topic = conversations[Math.floor(Math.random() * conversations.length)];
    const question = topic.questions[Math.floor(Math.random() * topic.questions.length)];
    const followUp = topic.followUps.find(followUp => followUp.question === botData.lastQuestion);
    if (followUp) {
        return { topic: topic.topic, text: followUp.response };
    }
    return { topic: topic.topic, text: question };
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
        socket.emit('userConnected', { userId: botData.userId });
        setTimeout(() => {
            if (botRole === 'joiner') {
                socket.emit('getExistingRooms');
            } else {
                createRoom(socket, botData);
            }
        }, Math.random() * 2000 + 1000);
    });

    socket.on('existingRooms', (existingRooms) => {
        if (botRole !== 'joiner') return;

        const availableRooms = existingRooms.filter(room => room.users.length < 5 && room.type === 'public');
        if (availableRooms.length > 0) {
            const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
            botData.roomId = randomRoom.id;
            socket.emit('joinRoom', {
                roomId: randomRoom.id,
                username: botData.username,
                location: botData.location,
                userId: botData.userId,
            });
        } else {
            createRoom(socket, botData);
        }
    });

    socket.on('roomCreated', (room, creatorSocketId) => {
        if (socket.id === creatorSocketId) {
            botData.roomId = room.id;
            rooms.set(room.id, room);
            startTyping(socket, botData);
            scheduleRoomLeaving(socket, botData);
        }
    });

    socket.on('roomJoined', (data) => {
        botData.roomId = data.roomId;
        if (!rooms.has(data.roomId)) {
            rooms.set(data.roomId, { id: data.roomId, users: [] });
        }
        startTyping(socket, botData);
        scheduleRoomLeaving(socket, botData);
    });

    socket.on('message', (messageData) => {
        if (messageData.userId !== botData.userId && messageData.roomId === botData.roomId) {
            // Another bot sent a message in the same room
            handleIncomingMessage(socket, botData, messageData);
        }
    });

    socket.on('userLeft', (data) => {
        if (data.userId === botData.userId) {
            botData.roomId = null;
            destroyBot(socket, botData);
        }
    });

    socket.on('disconnect', () => {
        activeBots.delete(socket);
        maintainBotCount();
    });

    activeBots.add(socket);

    function startTyping(socket, botData) {
        if (!botData.roomId) return;

        let isTyping = false;
        let typingTimeout;
        let messageTimeout;
        let deleteTimeout;

        function sendRandomMessage() {
            if (isTyping) return;
            isTyping = true;

            const messageData = generateConversationMessage(botData);
            botData.lastQuestion = messageData.text;
            let index = 0;

            clearTimeout(typingTimeout);
            clearTimeout(messageTimeout);
            clearTimeout(deleteTimeout);

            function typeNextChar() {
                if (index < messageData.text.length) {
                    socket.emit('typing', { roomId: botData.roomId, userId: botData.userId, message: messageData.text.slice(0, index + 1) });
                    index++;
                    const typingDelay = Math.random() * 200 + 50;
                    typingTimeout = setTimeout(typeNextChar, typingDelay);
                } else {
                    messageTimeout = setTimeout(() => {
                        socket.emit('message', { roomId: botData.roomId, userId: botData.userId, message: messageData.text });
                        deleteMessage();
                    }, 1000);
                }
            }

            function deleteMessage() {
                deleteTimeout = setTimeout(() => {
                    socket.emit('deleteMessage', { roomId: botData.roomId, userId: botData.userId });
                    isTyping = false;
                    scheduleNextMessage();
                }, 2000);
            }

            typeNextChar();
        }

        function scheduleNextMessage() {
            const delay = Math.random() * 5000 + 2000;
            setTimeout(sendRandomMessage, delay);
        }

        sendRandomMessage();
    }

    function handleIncomingMessage(socket, botData, messageData) {
        // Respond to the message
        botData.lastQuestion = messageData.message;
        startTyping(socket, botData);
    }

    function leaveRoom(socket, botData) {
        if (botData.roomId) {
            socket.emit('leaveRoom', { roomId: botData.roomId, userId: botData.userId });
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
}

function destroyBot(socket, botData) {
    activeBots.delete(socket);
    socket.disconnect();
}

function maintainBotCount() {
    const botsToCreate = MAX_ACTIVE_BOTS - activeBots.size;
    if (botsToCreate > 0) {
        for (let i = 0; i < botsToCreate; i++) {
            setTimeout(createBot, BOT_CREATION_DELAY * i);
        }
    }
}

// Start the simulation
maintainBotCount();