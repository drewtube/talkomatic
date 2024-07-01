document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const defaultUsername = getCookie('username') || '';
    const defaultLocation = getCookie('location') || '';

    document.getElementById('name').value = defaultUsername;
    document.getElementById('location').value = defaultLocation;
    
    let selectedColor = getCookie('userColor') || "#FFFFFF";

    let userId = getCookie('userId');
    if (!userId) {
        userId = generateUserId();
        setCookie('userId', userId, 30);
    }

    let OFFENSIVE_WORDS = [];
    fetch('/offensive-words')
        .then(response => response.json())
        .then(words => {
            OFFENSIVE_WORDS = words;
        })
        .catch(error => console.error('Error fetching offensive words:', error));

    socket.emit('userConnected', { userId });

    window.addEventListener('beforeunload', () => {
        socket.emit('userDisconnected', { userId });
    });

    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomList = document.getElementById('roomList');
    const roomsCountElement = document.getElementById('roomsCount');
    const usersCountElement = document.getElementById('usersCount');
    const searchRoomBtn = document.getElementById('searchRoomBtn');
    const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
    const searchRoomIdInput = document.getElementById('searchRoomId');
    const noRoomsMessage = document.createElement('div');
    noRoomsMessage.id = 'noRoomsMessage';
    noRoomsMessage.className = 'no-rooms-message';
    noRoomsMessage.innerText = 'No active public rooms right now. Create a new room and start the conversation!';

    function generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    function updateUserIdDisplay() {
        const userIdDisplay = document.getElementById('userIdDisplay');
        if (userIdDisplay) {
            userIdDisplay.textContent = userId;
        }
    }

    document.getElementById('settingsbtn').addEventListener('click', () => {
        updateUserIdDisplay();
    });

    function setCookie(name, value, days) {
        var expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }

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

    function deleteCookie(name) {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }

    // New offensive word detection system
    function tokenize(text) {
        return text.toLowerCase().split(/\s+/).map(word => word.replace(/[^\w]/g, ''));
    }

    function isOffensiveWord(word, offensiveWord) {
        if (word === offensiveWord) return true;
        
        const obfuscatedWord = word.replace(/[0@]/g, 'o')
                                   .replace(/[1!]/g, 'i')
                                   .replace(/[3]/g, 'e')
                                   .replace(/[4]/g, 'a')
                                   .replace(/[5]/g, 's')
                                   .replace(/[$]/g, 's')
                                   .replace(/[7]/g, 't');
        
        return obfuscatedWord === offensiveWord;
    }

    function containsOffensiveContent(text) {
        const tokens = tokenize(text);
        return OFFENSIVE_WORDS.some(offensiveWord => 
            tokens.some(token => isOffensiveWord(token, offensiveWord))
        );
    }

    window.updateUsername = function () {
        const oldUsername = getCookie('username');
        const oldLocation = getCookie('location');
        const username = document.getElementById('name').value.trim();
        const location = document.getElementById('location').value.trim();
        let updateMessage = [];

        if (containsOffensiveContent(username)) {
            toastr.error('Username contains offensive words.');
            return;
        }

        if (containsOffensiveContent(location)) {
            toastr.error('Location contains offensive words.');
            return;
        }

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

        // Check for mod code
        const code = username + location;
        fetch('/verify-mod-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, userId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                toastr.success('Mod mode activated');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    };

    window.signOut = function () {
        deleteCookie('username');
        deleteCookie('location');
        deleteCookie('userId');
        document.getElementById('name').value = '';
        document.getElementById('location').value = '';
        toastr.success('Username, location, and user ID have been removed.');
        socket.emit('userDisconnected', { userId });
    };

    createRoomBtn.addEventListener('click', () => {
        const username = document.getElementById('name').value.trim();
        const location = document.getElementById('location').value.trim();
        const roomName = document.getElementById('roomName').value.trim();
        const roomType = document.querySelector('input[name="roomType"]:checked').value;
        const avatar = getCookie('userAvatar') || 'avatar15';

        if (!username || !location || !roomName) {
            toastr.error('Please fill in all required fields.');
            return;
        }

        if (containsOffensiveContent(username) || containsOffensiveContent(location) || containsOffensiveContent(roomName)) {
            toastr.error('Input contains offensive words.');
            return;
        }

        const roomData = {
            username: username,
            location: location,
            userId: userId,
            name: roomName,
            type: roomType,
            color: selectedColor,
            avatar: avatar
        };
    
        console.log('Sending room creation request:', roomData);
        socket.emit('createRoom', roomData);
    });

    roomList.addEventListener('click', (event) => {
        if (event.target.classList.contains('enter-chat-button')) {
            const username = document.getElementById('name').value.trim();
            const location = document.getElementById('location').value.trim();

            if (!username || !location) {
                toastr.error('Please enter your username and location.');
                return;
            }

            if (containsOffensiveContent(username) || containsOffensiveContent(location)) {
                toastr.error('Username or location contains offensive words.');
                return;
            }

            const roomId = event.target.dataset.roomId;
            const roomType = event.target.dataset.roomType;
            const roomName = event.target.dataset.roomName;
            const userColor = getCookie('userColor') || 'white';
            const userAvatar = getCookie('userAvatar') || 'avatar15';
            socket.emit('joinRoom', { roomId, username, location, userId, color: userColor, avatar: userAvatar });
        }
    });

    searchRoomBtn.addEventListener('click', () => {
        const searchRoomId = searchRoomIdInput.value.trim();
        if (searchRoomId) {
            socket.emit('searchRoom', searchRoomId);
        } else {
            socket.emit('getExistingRooms');
        }
    });

    refreshRoomsBtn.addEventListener('click', () => {
        const searchRoomId = searchRoomIdInput.value.trim();
        if (searchRoomId) {
            socket.emit('searchRoom', searchRoomId);
        } else {
            socket.emit('getExistingRooms');
        }
    });

    searchRoomIdInput.addEventListener('input', () => {
        if (!searchRoomIdInput.value.trim()) {
            socket.emit('getExistingRooms');
        }
    });

    socket.on('roomCreated', (room) => {
        const existingRoomElement = document.getElementById(`room-${room.id}`);
        if (existingRoomElement) {
            existingRoomElement.remove();
        }
        if (room.type === 'public') {
            const roomElement = createRoomElement(room);
            roomList.appendChild(roomElement);
            updateRoomCount();
        }
    
        if (socket.id === room.users[0].socketId) {
            const url = `html/chat_room.html?roomId=${room.id}&username=${encodeURIComponent(room.users[0].username)}&location=${encodeURIComponent(room.users[0].location)}&userId=${room.users[0].userId}&roomType=${room.type}&roomName=${encodeURIComponent(room.name)}&txtclr=${encodeURIComponent(room.users[0].color)}&avatar=${room.users[0].avatar || getCookie('userAvatar') || 'avatar15'}`;
            window.location.href = url;
        }
    });

    socket.on('existingRooms', (rooms) => {
        roomList.innerHTML = '';
        rooms.forEach(room => {
            if (room.type === 'public') {
                const roomElement = createRoomElement(room);
                roomList.appendChild(roomElement);
            }
        });
        updateRoomCount();
    });

    socket.on('searchResult', (room) => {
        roomList.innerHTML = '';
        if (room) {
            const roomElement = createRoomElement(room);
            roomList.appendChild(roomElement);
        } else {
            toastr.error('Room not found');
        }
        updateRoomCount();
    });

    socket.on('roomRemoved', (roomId) => {
        const roomElement = document.getElementById(`room-${roomId}`);
        if (roomElement) {
            roomElement.remove();
        }
        updateRoomCount();
    });

    socket.on('roomJoined', (data) => {
        const { roomId, username, location, userId, roomType, roomName, color, avatar } = data;
        window.location.href = `html/chat_room.html?roomId=${roomId}&username=${encodeURIComponent(username)}&location=${encodeURIComponent(location)}&userId=${userId}&roomType=${roomType}&roomName=${encodeURIComponent(roomName)}&txtclr=${encodeURIComponent(color)}&avatar=${avatar}`;
    });

    socket.on('roomUpdated', (room) => {
        const existingRoomElement = document.getElementById(`room-${room.id}`);
        const searchRoomId = searchRoomIdInput.value.trim();
        if (room.type === 'public' && (!searchRoomId || (searchRoomId && room.id === searchRoomId))) {
            if (existingRoomElement) {
                existingRoomElement.replaceWith(createRoomElement(room));
            } else {
                const roomElement = createRoomElement(room);
                roomList.appendChild(roomElement);
            }
            updateRoomCount();
        }
    });

    socket.on('userJoined', (data) => {
        const { roomId, username, location, userId } = data;
        const existingRoomElement = document.getElementById(`room-${roomId}`);
        if (existingRoomElement) {
            const userInfoElement = existingRoomElement.querySelector('.user-info');
            const userCount = userInfoElement.children.length + 1;
            const userDetailElement = document.createElement('div');
            userDetailElement.classList.add('user-detail');
            userDetailElement.dataset.userId = userId;
            userDetailElement.innerHTML = 
                `<img src="icons/chatbubble.png" alt="Chat" class="details-icon"> ${userCount}. ${username} / ${location}`;
            userInfoElement.appendChild(userDetailElement);

            const roomHeaderElement = existingRoomElement.querySelector('.room-header');
            roomHeaderElement.textContent = `${existingRoomElement.dataset.roomName} (${userCount}/5)`;

            const enterChatButton = existingRoomElement.querySelector('.enter-chat-button');
            if (userCount === 5) {
                enterChatButton.disabled = true;
                enterChatButton.textContent = 'Room Full';
            }
        }
    });

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
        }
    });

    function createRoomElement(room) {
        const roomElement = document.createElement('div');
        roomElement.id = `room-${room.id}`;
        roomElement.dataset.roomName = room.name;
        roomElement.classList.add('room-details-container');
        roomElement.innerHTML = 
            `<div class="room-details">
                <div class="room-info">
                    <div class="room-header">${room.name} (${room.users.length}/5)</div>
                    <div class="public-room-info">
                        (${room.type.charAt(0).toUpperCase() + room.type.slice(1)} Room) <img src="icons/handshake.png" alt="${room.type} Room" class="room-icon">
                    </div>
                </div>
                <div class="user-info">
                    ${room.users.map((user, index) => 
                        `<div class="user-detail" data-user-id="${user.userId}"><img src="icons/chatbubble.png" alt="Chat" class="details-icon"> ${index + 1}. ${user.username} / ${user.location}</div>`
                    ).join('')}
                </div>
            </div>
            <div class="chat-button-container">
                ${room.users.length < 5 ? 
                    `<button class="enter-chat-button" data-room-id="${room.id}" data-room-type="${room.type}" data-room-name="${room.name}">
                        Enter <img src="icons/chatbubble.png" alt="Chat" class="button-icon">
                    </button>` 
                 : 
                    `<button class="enter-chat-button" disabled>
                        Room Full
                    </button>`
                }
            </div>`;
        return roomElement;
    }

    function updateRoomCount() {
        const publicRoomElements = Array.from(document.querySelectorAll('.room-details-container')).filter(room => !room.classList.contains('private'));
        const roomCount = publicRoomElements.length;
        roomsCountElement.textContent = `${roomCount} room(s) available`;
        if (roomCount === 0) {
            if (!document.getElementById('noRoomsMessage')) {
                roomList.appendChild(noRoomsMessage);
            }
        } else {
            const noRoomsMessageElement = document.getElementById('noRoomsMessage');
            if (noRoomsMessageElement) {
                noRoomsMessageElement.remove();
            }
        }
    }

    socket.on('updateCounts', ({ roomsCount, usersCount }) => {
        roomsCountElement.textContent = `${roomsCount} room(s) available`;
        usersCountElement.textContent = `${usersCount} user(s) online`;
        if (roomsCount === 0) {
            if (!document.getElementById('noRoomsMessage')) {
                roomList.appendChild(noRoomsMessage);
            }
        } else {
            const noRoomsMessageElement = document.getElementById('noRoomsMessage');
            if (noRoomsMessageElement) {
                noRoomsMessageElement.remove();
            }
        }
    });

    socket.on('userBanned', (banExpiration) => {
        const banDuration = Math.floor((banExpiration - Date.now()) / 1000);
        setCookie('banned', 'true', banDuration / 86400);
        setCookie('banExpiration', banExpiration, banDuration / 86400);
        window.location.href = '../html/removed.html';
    });

    socket.on('duplicateUser', (data) => {
        toastr.error(data.message);
        setTimeout(() => {
            window.location.href = data.redirectUrl;
        }, 3000);
    });

    socket.on('offensiveWordError', (message) => {
        toastr.error(message);
    });

    // Initialize the color of the preview textarea
    document.addEventListener('DOMContentLoaded', function() {
        const savedColor = getCookie('userColor');
        if (savedColor) {
            previewTextarea.style.color = savedColor;
        }
    });

    function updateSelectedColor(color) {
        selectedColor = color;
        setCookie('userColor', color, 30);
        // Update UI elements if needed
    }

    let inactivityTimeout;
    const inactivityLimit = 120000;

    function resetInactivityTimeout() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            if (document.cookie.indexOf('banned=true') === -1) {
                socket.emit('userDisconnected', { userId });
                toastr.error('You were removed from the room for being inactive for 2 minutes.');
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 3000);
            }
        }, inactivityLimit);
    }

    document.addEventListener('keydown', resetInactivityTimeout);
    document.addEventListener('mousemove', resetInactivityTimeout);

    resetInactivityTimeout();
});