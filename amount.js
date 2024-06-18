document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const roomsCountElement = document.getElementById('roomsCount');
  const usersCountElement = document.getElementById('usersCount');

  socket.on('updateCounts', ({ roomsCount, usersCount }) => {
      roomsCountElement.textContent = `${roomsCount} room(s) available to join`;
      usersCountElement.textContent = `${usersCount} people currently online`;
  });
});
