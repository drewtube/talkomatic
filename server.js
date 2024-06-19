const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const escapeHtml = require('escape-html');
const { User, Room, Message } = require('./models');
const OFFENSIVE_WORDS = require('./offensiveWords'); // Import the offensive words

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const bannedUsers = new Map(); // Store banned users and their ban expiration times

const MAX_CHAR_LENGTH = 20;

mongoose.connect('mongodb+srv://doadmin:U40N3196oq2cb7Ji@talkomatic-db-b7997980.mongo.ondigitalocean.com/admin?tls=true&authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/banned', (req, res) => {
  res.sendFile(path.join(__dirname, 'banned.html'));
});

app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'verify.html'));
});

io.on('connection', (socket) => {
  console.log(`User connected with socket id ${socket.id}`);

  socket.on('userConnected', async (data) => {
    const { userId } = data;
    console.log(`User connected: ${userId}`);

    if (isUserBanned(userId)) {
      console.log(`User banned: ${userId}`);
      socket.emit('userBanned', getBanExpiration(userId));
      return;
    }

    await User.findOneAndUpdate({ userId }, { socketId: socket.id }, { new: true, upsert: true });

    const rooms = await Room.find({ type: { $ne: 'secret' } });
    socket.emit('existingRooms', rooms);

    updateCounts();
  });

  socket.on('userDisconnected', async (data) => {
    const { userId } = data;
    console.log(`User disconnected: ${userId}`);

    await User.findOneAndUpdate({ userId }, { socketId: null });

    updateCounts();
  });

  socket.on('createRoom', async (roomData) => {
    const { username, location, userId, name, type, layout, privateRoomCode } = roomData;
    console.log(`Creating room: ${name}, type: ${type}`);

    // Validate inputs
    if (!username || !location || !userId || !name || !['public', 'private', 'secret'].includes(type) || !['horizontal', 'vertical'].includes(layout)) {
      socket.emit('error', 'Invalid input');
      return;
    }

    if (username.length > MAX_CHAR_LENGTH || location.length > MAX_CHAR_LENGTH || name.length > MAX_CHAR_LENGTH || (type === 'private' && (!privateRoomCode || privateRoomCode.length !== 6))) {
      socket.emit('error', 'Input exceeds maximum length or invalid private room code');
      return;
    }

    // Sanitize inputs
    const sanitizedUsername = escapeHtml(username);
    const sanitizedLocation = escapeHtml(location);
    const sanitizedUserId = escapeHtml(userId);
    const sanitizedName = escapeHtml(name);

    const user = await User.findOneAndUpdate({ userId: sanitizedUserId }, { username: sanitizedUsername, location: sanitizedLocation, socketId: socket.id }, { new: true, upsert: true });

    const room = new Room({
      name: sanitizedName,
      type,
      layout,
      users: [user._id],
      privateRoomCode: type === 'private' ? privateRoomCode : null,
    });

    await room.save();

    socket.join(room._id.toString());
    socket.emit('roomJoined', { success: true, roomId: room._id, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId, roomType: type });
    io.emit('roomCreated', room);

    updateCounts();
  });

  socket.on('joinRoom', async (data) => {
    const { roomId, username, location, userId, privateRoomCode } = data;
    console.log(`Joining room: ${roomId} by user: ${userId}`);

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

    const room = await Room.findById(roomId).populate('users');
    if (!room) {
      socket.emit('roomNotFound');
      return;
    }

    if (room.type === 'private' && room.privateRoomCode !== privateRoomCode) {
      socket.emit('redirectToVerify', { roomId, roomType: room.type });
      return;
    }

    if (room.users.length < 5) {
      const user = await User.findOneAndUpdate({ userId: sanitizedUserId }, { username: sanitizedUsername, location: sanitizedLocation, socketId: socket.id }, { new: true, upsert: true });
      room.users.push(user._id);
      await room.save();

      socket.join(roomId);
      socket.emit('roomJoined', { success: true, roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId, roomType: room.type });
      socket.to(roomId).emit('userJoined', { roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId });

      io.emit('roomUpdated', room);
      updateCounts();
    } else {
      socket.emit('roomFull');
    }
  });

  socket.on('verifyPrivateRoom', async (data) => {
    const { roomId, privateRoomCode, username, location, userId } = data;
    console.log(`Verifying private room: ${roomId} with code: ${privateRoomCode}`);

    // Sanitize inputs
    const sanitizedUsername = escapeHtml(username);
    const sanitizedLocation = escapeHtml(location);
    const sanitizedUserId = escapeHtml(userId);

    const room = await Room.findById(roomId).populate('users');
    if (room && room.type === 'private' && room.privateRoomCode === privateRoomCode) {
      const user = await User.findOneAndUpdate({ userId: sanitizedUserId }, { username: sanitizedUsername, location: sanitizedLocation, socketId: socket.id }, { new: true, upsert: true });
      room.users.push(user._id);
      await room.save();

      socket.join(roomId);
      socket.emit('roomJoined', { success: true, roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId, roomType: room.type });
      socket.to(roomId).emit('userJoined', { roomId, username: sanitizedUsername, location: sanitizedLocation, userId: sanitizedUserId });

      io.emit('roomUpdated', room);
      updateCounts();
    } else {
      socket.emit('roomJoined', { success: false, message: 'Incorrect private room code' });
      console.log('Incorrect private room code for room:', roomId);
    }
  });

  socket.on('typing', (data) => {
    const { roomId, userId, message } = data;

    // Sanitize message
    const sanitizedMessage = escapeHtml(message);
    console.log(`User ${userId} typing in room ${roomId}: ${sanitizedMessage}`);

    // Check for offensive words
    if (containsOffensiveWords(sanitizedMessage)) {
      console.log(`Offensive words detected in message from user ${userId}`);
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

  socket.on('disconnect', async (reason) => {
    console.log(`User with socket id ${socket.id} disconnected due to ${reason}`);

    const user = await User.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
    if (user) {
      await Room.updateMany({ users: user._id }, { $pull: { users: user._id } });

      io.emit('userDisconnected', { userId: user.userId });

      const rooms = await Room.find({ users: user._id });
      for (const room of rooms) {
        if (room.users.length === 0) {
          await Room.deleteOne({ _id: room._id });
          io.emit('roomRemoved', room._id);
        }
      }

      updateCounts();
    }
  });
});

async function updateCounts() {
  const roomsCount = await Room.countDocuments({ type: { $ne: 'secret' } });
  const usersCount = await User.countDocuments({ socketId: { $ne: null } });
  io.emit('updateCounts', { roomsCount, usersCount });
  console.log(`Update counts: roomsCount=${roomsCount}, usersCount=${usersCount}`);
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
  console.log(`Server running on port ${port}`);
});
