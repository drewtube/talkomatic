document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const roomsCountElement = document.getElementById('roomsCount');
  const usersCountElement = document.getElementById('usersCount');

  socket.on('updateCounts', ({ roomsCount, usersCount }) => {
      roomsCountElement.textContent = `${roomsCount.toLocaleString()} room(s) available`;
      usersCountElement.textContent = `${usersCount.toLocaleString()} user(s) online`;
  });
});
