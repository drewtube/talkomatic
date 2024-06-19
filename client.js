document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Set input values from cookies if available
    document.getElementById('name').value = getCookie('username') || '';
    document.getElementById('location').value = getCookie('location') || '';

    // Generate or get the user ID from the cookie
    let userId = getCookie('userId');
    if (!userId) {
        userId = generateUserId();
        setCookie('userId', userId, 30); // Store the user ID in a cookie for 30 days
    }

    // Notify the server about the new user
    socket.emit('userConnected', { userId });

    // Handle user disconnection
    window.addEventListener('beforeunload', () => {
        socket.emit('userDisconnected', { userId });
    });

    // Handle user banned event
    socket.on('userBanned', (banExpiration) => {
        const banDuration = Math.floor((banExpiration - Date.now()) / 1000);
        setCookie('banned', 'true', banDuration / 86400); // Set banned cookie for the remaining ban duration in days
        setCookie('banExpiration', banExpiration, banDuration / 86400); // Store the ban expiration time
        window.location.href = 'banned.html';
    });

    // Check if the user is banned
    if (getCookie('banned') === 'true') {
        const banExpiration = getCookie('banExpiration');
        const remainingTime = Math.floor((banExpiration - Date.now()) / 1000);
        if (remainingTime > 0) {
            window.location.href = 'banned.html';
        } else {
            deleteCookie('banned');
            deleteCookie('banExpiration');
        }
    }

    // DOM elements
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomList = document.getElementById('roomList');
    const roomsCountElement = document.getElementById('roomsCount');
    const usersCountElement = document.getElementById('usersCount');
    const privateRoomCodeContainer = document.getElementById('privateRoomCodeContainer');

    // Function to generate a unique user ID
    function generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

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
        for (let i = 0; i < cookieArray.length; i++) {
            let cookiePair = cookieArray[i].split('=');
            if (name == cookiePair[0].trim()) {
                return decodeURIComponent(cookiePair[1]);
            }
        }
        return null;
    }

    // Function to delete a cookie
    function deleteCookie(name) {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }

    // Function to update username and location
    window.updateUsername = function () {
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
    window.signOut = function () {
        deleteCookie('username');
        deleteCookie('location');
        deleteCookie('userId');
        document.getElementById('name').value = '';
        document.getElementById('location').value = '';
        toastr.success('Username, location, and user ID have been removed.');
        socket.emit('userDisconnected', { userId });
    };

    // Show or hide the private room code input based on the selected room type
    document.querySelectorAll('input[name="roomType"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            if (event.target.value === 'private') {
                privateRoomCodeContainer.classList.remove('hidden');
            } else {
                privateRoomCodeContainer.classList.add('hidden');
            }
        });
    });

    // Event listener for creating a room
    createRoomBtn.addEventListener('click', () => {
        const username = document.getElementById('name').value.trim();
        const location = document.getElementById('location').value.trim();
        const roomName = document.getElementById('roomName').value.trim();
        const roomType = document.querySelector('input[name="roomType"]:checked').value;
        const layoutType = document.querySelector('input[name="layoutType"]:checked').value;
        const privateRoomCode = document.getElementById('privateRoomCode').value.trim();

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

        if (roomType === 'private' && (!privateRoomCode || privateRoomCode.length !== 6)) {
            toastr.error('Please enter a valid 6-digit code for the private room.');
            return;
        }

        const roomData = {
            username: username,
            location: location,
            userId: userId,
            name: roomName,
            type: roomType,
            layout: layoutType,
            privateRoomCode: roomType === 'private' ? privateRoomCode : null
        };

        console.log('Sending room creation request:', roomData);
        socket.emit('createRoom', roomData);
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
            const roomType = event.target.dataset.roomType;

            if (roomType === 'private') {
                window.location.href = `verify.html?roomId=${roomId}&username=${username}&location=${location}&userId=${userId}&roomType=${roomType}`;
            } else {
                socket.emit('joinRoom', { roomId, username, location, userId });
            }
            console.log('Room joining request sent:', { roomId, username, location, userId });
        }
    });

    // Handle room creation
    socket.on('roomCreated', (room) => {
        const roomElement = createRoomElement(room);
        roomList.appendChild(roomElement);
        console.log('Room created:', room);
        updateRoomCount();
    });

    // Handle existing rooms
    socket.on('existingRooms', (rooms) => {
        roomList.innerHTML = ''; // Clear the room list before appending new rooms
        rooms.forEach(room => {
            const roomElement = createRoomElement(room);
            roomList.appendChild(roomElement);
        });
        console.log('Existing rooms received:', rooms);
        updateRoomCount();
    });

    // Handle room removal
    socket.on('roomRemoved', (roomId) => {
        const roomElement = document.getElementById(`room-${roomId}`);
        if (roomElement) {
            roomElement.remove();
            console.log('Room removed:', roomId);
        }
        updateRoomCount();
    });

    // Handle room joining
    socket.on('roomJoined', (data) => {
        if (data.success) {
            window.location.href = `chat_room.html?roomId=${data.roomId}&username=${data.username}&location=${data.location}&userId=${data.userId}&roomType=${data.roomType}`;
        } else {
            toastr.error(data.message);
        }
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
        updateRoomCount();
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
        roomElement.dataset.roomType = room.type;
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
                    <button class="enter-chat-button" data-room-id="${room.id}" data-room-type="${room.type}">
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

    // Update room count
    function updateRoomCount() {
        const roomCount = document.querySelectorAll('.room-details-container').length;
        roomsCountElement.textContent = `${roomCount} room(s) available`;
    }

    // Update user count
    socket.on('updateCounts', ({ roomsCount, usersCount }) => {
        roomsCountElement.textContent = `${roomsCount} room(s) available`;
        usersCountElement.textContent = `${usersCount} user(s) online`;
    });
});
