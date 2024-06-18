document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const roomsCountElement = document.getElementById('roomsCount');
  const usersCountElement = document.getElementById('usersCount');

  // Handle room and user count update
  socket.on('roomAndUserCount', (counts) => {
    roomsCountElement.textContent = `${counts.roomsCount} rooms available to join`;
    usersCountElement.textContent = `${Math.floor(counts.usersCount / 2)} people currently online`;
  });

  // Request initial counts when connecting
  socket.emit('requestRoomAndUserCount');
});
