const socket = io();

// DOM elements
const createRoomBtn = document.getElementById('createRoomBtn');
const roomList = document.getElementById('roomList');

// Event listener for creating a room
createRoomBtn.addEventListener('click', () => {
  const roomName = document.getElementById('roomName').value;
  const roomType = document.querySelector('input[name="roomType"]:checked').value;
  const layoutType = document.querySelector('input[name="layoutType"]:checked').value;

  const roomData = {
    name: roomName,
    type: roomType,    
    layout: layoutType
  };

  socket.emit('createRoom', roomData);
});

// Event listener for joining a room
roomList.addEventListener('click', (event) => {
  if (event.target.classList.contains('enter-chat-button')) {
    const roomId = event.target.dataset.roomId;
    const username = document.getElementById('name').value;
    const location = document.getElementById('location').value;
    socket.emit('joinRoom', { roomId, username, location });
  }
});

// Handle room creation
socket.on('roomCreated', (room) => {
  const roomElement = createRoomElement(room);
  roomList.appendChild(roomElement);
});

// Handle room joining
socket.on('roomJoined', (data) => {
  window.location.href = `chat_room.html?roomId=${data.roomId}&username=${data.username}&location=${data.location}`;
});

// Handle room updates
socket.on('roomUpdated', (room) => {
  const existingRoomElement = document.getElementById(`room-${room.id}`);
  if (existingRoomElement) {
    existingRoomElement.replaceWith(createRoomElement(room));
  }
});

// Handle room deletion
socket.on('roomDeleted', (roomId) => {
  const existingRoomElement = document.getElementById(`room-${roomId}`);
  if (existingRoomElement) {
    existingRoomElement.remove();
  }
});

// Create room element
function createRoomElement(room) {
  const roomElement = document.createElement('div');
  roomElement.id = `room-${room.id}`;
  roomElement.classList.add('room-details-container');
  roomElement.innerHTML = `
    <div class="room-details">
      <div class="room-info">
        <div class="room-header">${room.name} (${room.users.length}/5)</div>
        <div class="public-room-info">
          (${room.type} Room) <img src="icons/handshake.png" alt="${room.type} Room" class="room-icon">
        </div>
      </div>
      <div class="user-info">
        ${room.users.map((user, index) => `
          <div class="user-detail"><img src="icons/chatbubble.png" alt="Chat" class="details-icon"> ${index + 1}. ${user.username} / ${user.location}</div>
        `).join('')}
      </div>
    </div>
    <div class="chat-button-container">
      ${room.users.length < 5 ? `
        <button class="enter-chat-button" data-room-id="${room.id}">
          Enter <img src="icons/chatbubble.png" alt="Chat" class="button-icon">
        </button>
      ` : `
        <button class="enter-chat-button" disabled>
          Room Full
        </button>
      `}
    </div>
  `;
  return roomElement;
}