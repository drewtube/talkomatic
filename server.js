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
  console.log('A user connected');

  // Send existing rooms to newly connected client
  socket.emit('existingRooms', Object.values(rooms));

  // Handle room creation
  socket.on('createRoom', (roomData) => {
    const { username, location, name, type, layout } = roomData;

    if (!username || !location || !name || !type || !layout) {
      socket.emit('error', 'All fields are required.');
      return;
    }

    const roomId = generateRoomId();
    const room = {
      id: roomId,
      name: name,
      type: type,
      layout: layout,
      users: [{ username, location, socketId: socket.id }]
    };
    rooms[roomId] = room;
    io.emit('roomCreated', room);
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, username, location });
    socket.emit('initializeUsers', room.users);
  });

 // Handle room joining
socket.on('joinRoom', (data) => {
  const { roomId, username, location } = data;
  if (rooms[roomId]) {
    if (rooms[roomId].users.length < 5) {
      rooms[roomId].users.push({ username, location, socketId: socket.id });
      socket.join(roomId);
      io.to(roomId).emit('roomUpdated', rooms[roomId]);
      socket.emit('roomJoined', { roomId, username, location });
      socket.emit('initializeUsers', rooms[roomId].users);
      socket.to(roomId).emit('userJoined', { username, location });
    } else {
      socket.emit('roomFull');
    }
  }
});

  // Handle typing within a room
  socket.on('typing', (data) => {
    const { roomId, username, message } = data;
    socket.to(roomId).emit('typing', { username, message });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex((user) => user.socketId === socket.id);
      if (userIndex !== -1) {
        const user = room.users.splice(userIndex, 1)[0];
        io.emit('roomUpdated', room);
        if (room.users.length === 0) {
          delete rooms[roomId];
          io.emit('roomDeleted', roomId);
        } else {
          io.to(roomId).emit('userLeft', user);
        }
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
