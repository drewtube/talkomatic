const socket = io();

// Get the room ID, username, and location from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const username = urlParams.get('username');
const location = urlParams.get('location');

// DOM elements
const chatRoom = document.getElementById('chatRoom');
const messageInput = document.getElementById('messageInput');

// Join the room on page load
socket.emit('joinRoom', { roomId, username, location });

// Handle chat room events and messaging
socket.on('message', (data) => {
  displayMessage(data.username, data.message);
});

// Send a message
function sendMessage() {
  const message = messageInput.value;
  socket.emit('message', { roomId, username, message });
  messageInput.value = '';
}

// Display a message in the chat room
function displayMessage(username, message) {
  const messageElement = document.createElement('div');
  messageElement.textContent = `${username}: ${message}`;
  chatRoom.appendChild(messageElement);
}

// Handle user typing
messageInput.addEventListener('input', () => {
  socket.emit('typing', { roomId, username });
});

// Handle user joining the room
socket.on('userJoined', (user) => {
  const userElement = document.createElement('div');
  userElement.textContent = `${user.username} / ${user.location}`;
  chatRoom.appendChild(userElement);
});

// Handle user leaving the room
socket.on('userLeft', (user) => {
  const userElement = document.querySelector(`div[data-user="${user.username}"]`);
  if (userElement) {
    userElement.remove();
  }
});