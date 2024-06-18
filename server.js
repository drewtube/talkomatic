const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const rooms = {};

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle socket connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Send existing rooms to newly connected client
  socket.emit('existingRooms', Object.values(rooms));
  console.log('Sent existing rooms to client:', socket.id);

  // Handle room creation
  socket.on('createRoom', (roomData) => {
    const { username, location, userId, name, type, layout } = roomData;

    if (!username || !location || !userId || !name || !type || !layout) {
      socket.emit('error', 'All fields are required.');
      console.log('Room creation failed - missing fields:', socket.id);
      return;
    }

    const roomId = generateRoomId();
    const room = {
      id: roomId,
      name: name,
      type: type,
      layout: layout,
      users: [{ username, location, userId, socketId: socket.id }]
    };
    rooms[roomId] = room;
    io.emit('roomCreated', room);
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, username, location, userId });
    socket.emit('initializeUsers', room.users);
    console.log('Room created:', roomId, 'by user:', socket.id);
  });

  // Handle room joining
  socket.on('joinRoom', (data) => {
    const { roomId, username, location, userId } = data;
    console.log('User', socket.id, 'is joining room:', roomId);
    if (rooms[roomId]) {
      if (rooms[roomId].users.length < 5) {
        rooms[roomId].users.push({ username, location, userId, socketId: socket.id });
        socket.join(roomId);
        io.emit('roomUpdated', rooms[roomId]);
        socket.emit('roomJoined', { roomId, username, location, userId });
        socket.emit('initializeUsers', rooms[roomId].users);
        socket.to(roomId).emit('userJoined', { roomId, username, location, userId });
        console.log('User', socket.id, 'joined room:', roomId);
      } else {
        socket.emit('roomFull');
        console.log('Room', roomId, 'is full. User', socket.id, 'cannot join.');
      }
    } else {
      console.log('Room', roomId, 'does not exist. User', socket.id, 'cannot join.');
    }
  });

  // Handle typing within a room
  socket.on('typing', (data) => {
    const { roomId, userId, message } = data;
    socket.to(roomId).emit('typing', { userId, message });
    console.log('User', userId, 'is typing in room:', roomId);
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex((user) => user.socketId === socket.id);
      if (userIndex !== -1) {
        const user = room.users.splice(userIndex, 1)[0];
        io.emit('roomUpdated', room);
        socket.to(roomId).emit('userLeft', { roomId, userId: user.userId });
        console.log('User', user.userId, 'left room:', roomId);
      }
    });
  });
});

// Generate a unique room ID
function generateRoomId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
