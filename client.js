document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // Set input values from cookies if available
  document.getElementById('name').value = getCookie('username') || '';
  document.getElementById('location').value = getCookie('location') || '';

  // Generate or get the user ID from the cookie
  let userId = getCookie('userId');
  if (!userId) {
    userId = Math.floor(Math.random() * 900000000) + 100000000; // Generate a 9-digit number
    setCookie('userId', userId, 30); // Store the user ID in a cookie for 30 days
  }

  // DOM elements
  const createRoomBtn = document.getElementById('createRoomBtn');
  const roomList = document.getElementById('roomList');

  // Function to set a cookie
  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
  }

  // Function to get a cookie by name
  function getCookie(name) {
    let cookieArray = document.cookie.split(';');
    for(let i = 0; i < cookieArray.length; i++) {
      let cookiePair = cookieArray[i].split('=');
      if(name == cookiePair[0].trim()) {
        return decodeURIComponent(cookiePair[1]);
      }
    }
    return null;
  }

  // Function to update username and location
  window.updateUsername = function() {
    const oldUsername = getCookie('username');
    const oldLocation = getCookie('location');
    const username = document.getElementById('name').value.trim();
    const location = document.getElementById('location').value.trim();
    let updateMessage = [];

    if (username !== oldUsername) {
      setCookie('username', username, 30);
      updateMessage.push('username');
    }
    if (location !== oldLocation) {
      setCookie('location', location, 30);
      updateMessage.push('location');
    }

    if (updateMessage.length > 0) {
      toastr.success(updateMessage.join(' and ') + ' updated.');
    } else {
      toastr.info('No changes were made.');
    }
  };

  // Function to sign out
  window.signOut = function() {
    document.cookie = 'username=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'location=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'userId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.getElementById('name').value = '';
    document.getElementById('location').value = '';
    toastr.success('Username, location, and user ID have been removed.');
  };

  // Event listener for creating a room
  createRoomBtn.addEventListener('click', () => {
    const username = document.getElementById('name').value.trim();
    const location = document.getElementById('location').value.trim();
    const roomName = document.getElementById('roomName').value.trim();
    const roomType = document.querySelector('input[name="roomType"]:checked').value;
    const layoutType = document.querySelector('input[name="layoutType"]:checked').value;

    if (!username) {
      toastr.error('Please enter your username.');
      console.log('Room creation failed - missing username');
      return;
    }

    if (!location) {
      toastr.error('Please enter your location.');
      console.log('Room creation failed - missing location');
      return;
    }

    if (!roomName) {
      toastr.error('Please enter a room name.');
      console.log('Room creation failed - missing room name');
      return;
    }

    const roomData = {
      username: username,
      location: location,
      userId: userId,
      name: roomName,
      type: roomType,
      layout: layoutType
    };

    socket.emit('createRoom', roomData);
    console.log('Room creation request sent:', roomData);
  });

  // Event listener for joining a room
  roomList.addEventListener('click', (event) => {
    if (event.target.classList.contains('enter-chat-button')) {
      const username = document.getElementById('name').value.trim();
      const location = document.getElementById('location').value.trim();

      if (!username) {
        toastr.error('Please enter your username.');
        console.log('Room joining failed - missing username');
        return;
      }

      if (!location) {
        toastr.error('Please enter your location.');
        console.log('Room joining failed - missing location');
        return;
      }

      const roomId = event.target.dataset.roomId;
      socket.emit('joinRoom', { roomId, username, location, userId });
      console.log('Room joining request sent:', { roomId, username, location, userId });
    }
  });

  // Handle room creation
  socket.on('roomCreated', (room) => {
    const roomElement = createRoomElement(room);
    roomList.appendChild(roomElement);
    console.log('Room created:', room);
  });

  // Handle existing rooms
  socket.on('existingRooms', (rooms) => {
    roomList.innerHTML = ''; // Clear the room list before appending new rooms
    rooms.forEach(room => {
      const roomElement = createRoomElement(room);
      roomList.appendChild(roomElement);
    });
    console.log('Existing rooms received:', rooms);
  });

  // Handle room joining
  socket.on('roomJoined', (data) => {
    window.location.href = `chat_room.html?roomId=${data.roomId}&username=${data.username}&location=${data.location}&userId=${data.userId}`;
    console.log('Joined room:', data.roomId);
  });

  // Handle room updates
  socket.on('roomUpdated', (room) => {
    const existingRoomElement = document.getElementById(`room-${room.id}`);
    if (existingRoomElement) {
      existingRoomElement.replaceWith(createRoomElement(room));
      console.log('Room updated:', room);
    } else {
      const roomElement = createRoomElement(room);
      roomList.appendChild(roomElement);
      console.log('Room added:', room);
    }
  });

  // Handle user joining a room
  socket.on('userJoined', (data) => {
    const { roomId, username, location, userId } = data;
    const existingRoomElement = document.getElementById(`room-${roomId}`);
    if (existingRoomElement) {
      const userInfoElement = existingRoomElement.querySelector('.user-info');
      const userCount = userInfoElement.children.length + 1;
      const userDetailElement = document.createElement('div');
      userDetailElement.classList.add('user-detail');
      userDetailElement.dataset.userId = userId;
      userDetailElement.innerHTML = `
        <img src="icons/chatbubble.png" alt="Chat" class="details-icon"> ${userCount}. ${username} / ${location}
      `;
      userInfoElement.appendChild(userDetailElement);

      const roomHeaderElement = existingRoomElement.querySelector('.room-header');
      roomHeaderElement.textContent = `${existingRoomElement.dataset.roomName} (${userCount}/5)`;

      const enterChatButton = existingRoomElement.querySelector('.enter-chat-button');
      if (userCount === 5) {
        enterChatButton.disabled = true;
        enterChatButton.textContent = 'Room Full';
      }
      console.log('User joined room:', data);
    } else {
      console.log('Room not found for user joining:', roomId);
    }
  });

  // Handle user leaving a room
  socket.on('userLeft', (data) => {
    const { roomId, userId } = data;
    const existingRoomElement = document.getElementById(`room-${roomId}`);
    if (existingRoomElement) {
      const userInfoElement = existingRoomElement.querySelector('.user-info');
      const userDetailElements = userInfoElement.querySelectorAll('.user-detail');
      userDetailElements.forEach((userDetailElement, index) => {
        if (userDetailElement.dataset.userId === userId) {
          userDetailElement.remove();
        } else {
          userDetailElement.querySelector('.details-icon').textContent = `${index + 1}.`;
        }
      });

      const roomHeaderElement = existingRoomElement.querySelector('.room-header');
      const userCount = userInfoElement.children.length;
      roomHeaderElement.textContent = `${existingRoomElement.dataset.roomName} (${userCount}/5)`;

      const enterChatButton = existingRoomElement.querySelector('.enter-chat-button');
      if (userCount < 5) {
        enterChatButton.disabled = false;
        enterChatButton.innerHTML = `Enter <img src="icons/chatbubble.png" alt="Chat" class="button-icon">`;
      }
      console.log('User left room:', data);
    } else {
      console.log('Room not found for user leaving:', roomId);
    }
  });

  // Create room element
  function createRoomElement(room) {
    const roomElement = document.createElement('div');
    roomElement.id = `room-${room.id}`;
    roomElement.dataset.roomName = room.name;
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
            <div class="user-detail" data-user-id="${user.userId}"><img src="icons/chatbubble.png" alt="Chat" class="details-icon"> ${index + 1}. ${user.username} / ${user.location}</div>
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
});
