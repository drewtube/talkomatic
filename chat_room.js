const socket = io();

// Get the room ID, username, and userLocation from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const username = urlParams.get('username');
const userLocation = urlParams.get('location');

// DOM elements
const chatRoom = document.getElementById('chatRoom');

// Join the room on page load
socket.emit('joinRoom', { roomId, username, location: userLocation });

// Handle chat room events and messaging
socket.on('message', (data) => {
  updateUserTyping(data.username, data.message);
});

// Handle user typing
socket.on('typing', (data) => {
  updateUserTyping(data.username, data.message);
});

// Handle user joining the room
socket.on('userJoined', (user) => {
  addUserToChatRoom(user.username, user.location);
});

// Handle user leaving the room
socket.on('userLeft', (user) => {
  removeUserFromChatRoom(user.username);
  updateUserPositions();
});

// Add user to chat room
function addUserToChatRoom(username, location) {
  const userElement = document.createElement('div');
  userElement.id = `user-${username}`;
  userElement.classList.add('border-t', 'border-white', 'pt-2', 'grid', 'grid-rows-2');

  const userInfo = document.createElement('div');
  userInfo.textContent = `${username} / ${location}`;
  userInfo.classList.add('mb-2');

  const userTyping = document.createElement('div');
  userTyping.classList.add('bg-white', 'text-black', 'p-2');
  userTyping.contentEditable = true;
  userTyping.dataset.username = username;
  userTyping.addEventListener('input', () => {
    socket.emit('typing', { roomId, username, message: userTyping.textContent });
  });

  userElement.appendChild(userInfo);
  userElement.appendChild(userTyping);
  chatRoom.appendChild(userElement);

  updateUserPositions();
}

// Update user typing in chat room
function updateUserTyping(username, message) {
  const userElement = document.querySelector(`#user-${username} div[data-username="${username}"]`);
  if (userElement) {
    userElement.textContent = message;
  }
}

// Remove user from chat room
function removeUserFromChatRoom(username) {
  const userElement = document.getElementById(`user-${username}`);
  if (userElement) {
    userElement.remove();
  }
}

// Update user positions
function updateUserPositions() {
  const users = Array.from(chatRoom.children);
  users.forEach((user, index) => {
    user.style.order = index;
  });
}

// Initialize existing users on page load
socket.on('initializeUsers', (users) => {
  users.forEach(user => addUserToChatRoom(user.username, user.location));
});
