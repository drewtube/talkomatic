const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const roomId = sanitizeHtmlClient(urlParams.get('roomId'));
const roomType = sanitizeHtmlClient(urlParams.get('roomType'));
const roomName = sanitizeHtmlClient(urlParams.get('roomName'));
const username = sanitizeHtmlClient(urlParams.get('username'));
const userLocation = sanitizeHtmlClient(urlParams.get('location'));
const userId = sanitizeHtmlClient(urlParams.get('userId'));

socket.emit('userConnected', { userId });

const chatRoom = document.getElementById('chatRoom');
const joinSound = document.getElementById('joinSound'); // Get the audio element

socket.emit('joinRoom', { roomId, username, location: userLocation, userId });

socket.on('initializeUsers', (users) => {
    chatRoom.innerHTML = '';
    users.forEach((user, index) => {
        const userElement = createUserElement(user, index);
        chatRoom.appendChild(userElement);
    });
});

socket.on('userJoined', (user) => {
    const userElement = createUserElement(user);
    chatRoom.appendChild(userElement);
    joinSound.play(); // Play the sound when a user joins
});

socket.on('userLeft', (user) => {
    const userElement = document.querySelector(`[data-user-id="${user.userId}"]`);
    if (userElement) {
        userElement.remove();
    }
});

socket.on('typing', (data) => {
    const userElement = document.querySelector(`[data-user-id="${data.userId}"]`);
    if (userElement) {
        const textareaElement = userElement.querySelector('textarea');
        textareaElement.value = data.message;
    }
});

socket.on('userBanned', (banExpiration) => {
    const banDuration = Math.floor((banExpiration - Date.now()) / 1000);
    setCookie('banned', 'true', banDuration / 86400);
    window.location.href = 'banned.html';
});

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.classList.add('row');
    if (chatRoom.classList.contains('vertical-layout')) {
        userElement.classList.add('column');
    }
    userElement.dataset.userId = user.userId;

    const userInfo = document.createElement('div');
    userInfo.classList.add('sub-row');
    userInfo.innerHTML = `<span>${sanitizeHtmlClient(user.username)}</span><span>/</span><span>${sanitizeHtmlClient(user.location)}</span>`;
    
    userInfo.style.backgroundColor = '#333';
    userInfo.style.color = 'white';
    userInfo.style.padding = '5px';
    userInfo.style.paddingLeft = '12px';
    userInfo.style.marginBottom = '10px';

    const userTyping = document.createElement('textarea');
    userTyping.classList.add('sub-row');
    userTyping.disabled = user.userId !== userId;

    userTyping.style.width = '100%';
    userTyping.style.height = '100%';
    userTyping.style.resize = 'none';
    userTyping.style.backgroundColor = 'black';
    userTyping.style.color = '#FFA500';
    userTyping.style.padding = '10px';
    userTyping.style.fontSize = '16px';
    userTyping.style.boxSizing = 'border-box';
    userTyping.style.fontFamily = '"Courier New", Courier, monospace';
    userTyping.style.webkitTextFillColor = '#FFA500';
    userTyping.style.opacity = '1';

    if (user.userId === userId) {
        userTyping.style.border = '1px solid white';
        userTyping.addEventListener('input', () => {
            socket.emit('typing', { roomId, userId, message: sanitizeHtmlClient(userTyping.value) });
        });
    } else {
        userTyping.style.border = 'none';
        userTyping.style.userSelect = 'none';
    }
    
    userElement.appendChild(userInfo);
    userElement.appendChild(userTyping);

    return userElement;
}

window.addEventListener('beforeunload', () => {
    socket.emit('userDisconnected', { userId });
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

function sanitizeHtmlClient(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

window.addEventListener('DOMContentLoaded', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    const roomType = urlParams.get('roomType');
    const roomName = urlParams.get('roomName');
    document.getElementById('roomId').textContent = roomId;
    document.getElementById('headerRoomId').textContent = roomId;
    document.getElementById('roomTypeText').textContent = roomType.charAt(0).toUpperCase() + roomType.slice(1);
    document.getElementById('roomName').textContent = roomName;
});

const layoutButton = document.getElementById('layoutButton');

layoutButton.addEventListener('click', () => {
    if (chatRoom.classList.contains('vertical-layout')) {
        chatRoom.classList.remove('vertical-layout');
        layoutButton.textContent = 'Switch Layout';
    } else {
        chatRoom.classList.add('vertical-layout');
        layoutButton.textContent = 'Switch Layout';
    }
});
