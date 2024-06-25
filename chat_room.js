const socket = io();

document.addEventListener('DOMContentLoaded', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    const roomType = urlParams.get('roomType');
    const roomName = urlParams.get('roomName');
    const username = urlParams.get('username');
    const userLocation = urlParams.get('location');
    const userId = urlParams.get('userId');
    const userColorName = getCookie('userColor') || decodeURIComponent(urlParams.get('txtclr')) || 'white';

    const chatRoom = document.getElementById('chatRoom');
    const joinSound = document.getElementById('joinSound');
    const inviteLinkButton = document.getElementById('copyButton');

    document.getElementById('roomId').textContent = roomId;
    document.getElementById('headerRoomId').textContent = roomId;
    document.getElementById('roomTypeText').textContent = roomType.charAt(0).toUpperCase() + roomType.slice(1);

    const inviteLink = `${window.location.origin}/join.html?roomId=${roomId}`;
    document.getElementById('inviteLink').value = inviteLink;

    let OFFENSIVE_WORDS = [];
    let birthdayCelebrated = false;

    const colorMap = {
        'white': '#FFFFFF',
        'orange': '#FF9800',
        'blue': '#00FFFF',
        'green': '#00FF00',
        'pink': '#FF00FF',
        'yellow': '#FFFF00'
    };

    fetch('/offensive-words')
        .then(response => response.json())
        .then(words => {
            OFFENSIVE_WORDS = words;
        })
        .catch(error => console.error('Error fetching offensive words:', error));

    if (getCookie('banned') === 'true') {
        const banExpiration = getCookie('banExpiration');
        if (banExpiration && Date.now() < parseInt(banExpiration)) {
            window.location.href = 'removed.html';
        } else {
            deleteCookie('banned');
            deleteCookie('banExpiration');
        }
    }

    socket.emit('joinRoom', { roomId, username, location: userLocation, userId, color: userColorName });

    socket.on('initializeUsers', (users) => {
        chatRoom.innerHTML = '';
        users.forEach(user => addUserToRoom(user));
        updateUserContainerSizes();
    });

    socket.on('userJoined', (user) => {
        addUserToRoom(user);
        joinSound.play();
        updateUserContainerSizes();
    });

    socket.on('userLeft', (user) => {
        const userElement = document.getElementById(`user-${user.userId}`);
        if (userElement) userElement.remove();
        updateUserContainerSizes();
    });

    socket.on('typing', (data) => {
        updateUserMessage(data.userId, data.message, data.color);
    });

    socket.on('message', (data) => {
        updateUserMessage(data.userId, data.message, data.color);
    });

    socket.on('userBanned', (banExpiration) => {
        const banDuration = Math.floor((banExpiration - Date.now()) / 1000);
        setCookie('banned', 'true', banDuration / 86400);
        setCookie('banExpiration', banExpiration.toString(), banDuration / 86400);
        window.location.href = 'removed.html';
    });

    socket.on('duplicateUser', (data) => {
        showLimitedToast('error', data.message);
        setTimeout(() => {
            window.location.href = data.redirectUrl;
        }, 3000);
    });

    socket.on('birthdayMessage', (username) => {
        toastr.success(`Happy Birthday ${username}!`);
    });

    document.getElementById('layoutButton').addEventListener('click', switchLayout);

    function addUserToRoom(user) {
        const userElement = document.createElement('div');
        userElement.id = `user-${user.userId}`;
        userElement.className = 'user-container';

        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.innerHTML = `<span>${escapeHtml(user.username)}</span><span>/</span><span>${escapeHtml(user.location)}</span>`;

        userInfo.style.backgroundColor = '#333';
        userInfo.style.color = 'white';
        userInfo.style.padding = '5px';
        userInfo.style.paddingLeft = '12px';
        userInfo.style.marginBottom = '5px';

        const textarea = document.createElement('textarea');
        textarea.className = 'user-textarea';
        textarea.readOnly = user.userId !== userId;
        textarea.maxLength = 1000;
        textarea.style.marginBottom = '5px';

        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.resize = 'none';
        textarea.style.backgroundColor = 'black';
        textarea.style.color = colorMap[user.color] || '#FFFFFF';
        textarea.style.padding = '10px';
        textarea.style.fontSize = '16px';
        textarea.style.boxSizing = 'border-box';
        textarea.style.fontFamily = '"Courier New", Courier, monospace';
        textarea.style.opacity = '1';
        textarea.style.pointerEvents = user.userId === userId ? 'auto' : 'none';

        if (user.userId === userId) {
            textarea.style.border = '1px solid white';
            textarea.addEventListener('input', handleInput);
        } else {
            textarea.style.border = 'none';
            textarea.style.userSelect = 'none';
        }

        userElement.appendChild(userInfo);
        userElement.appendChild(textarea);
        chatRoom.appendChild(userElement);
    }

    function handleInput(event) {
        const textarea = event.target;
        const message = textarea.value;

        if (textarea.value.length >= textarea.maxLength) {
            toastr.error(`Message is too long! Maximum length is ${textarea.maxLength} characters.`);
        } else if (containsOffensiveWord(message)) {
            toastr.error('Message contains offensive words.');
            socket.emit('message', { roomId, userId, message, color: userColorName });
            textarea.value = '';
        } else {
            socket.emit('typing', { roomId, userId, message, color: userColorName });
            resetInactivityTimeout();

            if (isBirthdayMessage(message)) {
                socket.emit('birthdayMessage', username);
                toastr.success(`Happy Birthday ${username}!`);
            }
        }
    }

    function updateUserMessage(userId, message, color) {
        const userElement = document.getElementById(`user-${userId}`);
        if (userElement) {
            const textarea = userElement.querySelector('.user-textarea');
            if (textarea) {
                textarea.value = message;
                textarea.style.color = colorMap[color] || '#FFFFFF';
            }
        }
    }

    function showLimitedToast(type, message) {
        toastr[type](message);
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    function containsOffensiveWord(text) {
        return OFFENSIVE_WORDS.some(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(text);
        });
    }

    function isBirthdayMessage(text) {
        const birthdayPhrases = [
            "today is my birthday", "it's my birthday", "it is my birthday",
            "today's my birthday", "my birthday is today", "i'm celebrating my birthday",
            "im celebrating my birthday", "today is my bday", "its my bday",
            "it's my bday", "my bday is today", "celebrating my bday",
            "my birthday party is today", "having my birthday party", "born on this day"
        ];
        return birthdayPhrases.some(phrase => text.toLowerCase().includes(phrase));
    }

    function changeColor(color) {
        socket.emit('changeColor', { userId, color });
        updateUserMessage(userId, '', color);
        setCookie('userColor', color, 30);
    }

    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    function deleteCookie(name) {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
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
                    window.location.href = 'index.html';
                }, 3000);
            }
        }, inactivityLimit);
    }

    document.addEventListener('keydown', resetInactivityTimeout);
    document.addEventListener('mousemove', resetInactivityTimeout);

    inviteLinkButton.addEventListener('click', () => {
        const inviteLinkInput = document.getElementById('inviteLink');
        inviteLinkInput.select();
        document.execCommand('copy');

        inviteLinkButton.classList.add('copied');
        inviteLinkButton.textContent = 'Copied';

        setTimeout(() => {
            inviteLinkButton.classList.remove('copied');
            inviteLinkButton.textContent = 'Copy Invite Link';
        }, 2000);
    });

    window.addEventListener('beforeunload', () => {
        socket.emit('leaveRoom', { roomId, userId });
    });

    resetInactivityTimeout();
});

function switchLayout() {
    const body = document.body;
    if (body.classList.contains('horizontal-layout')) {
        body.classList.remove('horizontal-layout');
        body.classList.add('vertical-layout');
    } else {
        body.classList.remove('vertical-layout');
        body.classList.add('horizontal-layout');
    }
    updateUserContainerSizes();
}

function updateUserContainerSizes() {
    const chatRoom = document.getElementById('chatRoom');
    const userContainers = chatRoom.querySelectorAll('.user-container');
    const numUsers = userContainers.length;
    const isHorizontal = document.body.classList.contains('horizontal-layout');

    userContainers.forEach(container => {
        if (isHorizontal) {
            container.style.width = '100%';
            container.style.height = `${100 / numUsers}%`;
            container.style.margin = '0'; // Remove any margin for horizontal layout
        } else {
            container.style.width = `${100 / numUsers}%`;
            container.style.height = '100%';
            container.style.margin = '0 5px'; // Add horizontal gap between user containers for vertical layout
        }
    });
}
