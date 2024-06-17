const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const rooms = {};

// Handle socket connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle room creation
  socket.on('createRoom', (roomData) => {
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      name: roomData.name,
      type: roomData.type,
      layout: roomData.layout,
      users: []
    };
    rooms[roomId] = room;
    io.emit('roomCreated', room);
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, username: roomData.username, location: roomData.location });
  });

  // Handle room joining
  socket.on('joinRoom', (data) => {
    const { roomId, username, location } = data;
    if (rooms[roomId]) {
      if (rooms[roomId].users.length < 5) {
        rooms[roomId].users.push({ username, location });
        socket.join(roomId);
        io.emit('roomUpdated', rooms[roomId]);
        socket.emit('roomJoined', { roomId, username, location });
      } else {
        socket.emit('roomFull');
      }
    }
  });

  // Handle messaging within a room
  socket.on('message', (data) => {
    const { roomId, message } = data;
    io.to(roomId).emit('message', { username: data.username, message });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    // Remove user from the room and update room details
    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex((user) => user.socketId === socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        io.emit('roomUpdated', room);
        if (room.users.length === 0) {
          delete rooms[roomId];
          io.emit('roomDeleted', roomId);
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