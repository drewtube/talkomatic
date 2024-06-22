const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const roomType = urlParams.get('roomType');
const roomName = urlParams.get('roomName');
const username = urlParams.get('username');
const userLocation = urlParams.get('location');
const userId = urlParams.get('userId');

let OFFENSIVE_WORDS = [];

// Fetch offensive words list from server
fetch('/offensive-words')
    .then(response => response.json())
    .then(words => {
        OFFENSIVE_WORDS = words;
    })
    .catch(error => console.error('Error fetching offensive words:', error));

// Check if user is banned before connecting
if (getCookie('banned') === 'true') {
    const banExpiration = getCookie('banExpiration');
    if (banExpiration && Date.now() < parseInt(banExpiration)) {
        window.location.href = 'removed.html';
    } else {
        deleteCookie('banned');
        deleteCookie('banExpiration');
    }
}

socket.emit('userConnected', { userId });

const chatRoom = document.getElementById('chatRoom');
const joinSound = document.getElementById('joinSound');

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
    setCookie('banExpiration', banExpiration.toString(), banDuration / 86400);
    window.location.href = 'removed.html';
});

socket.on('duplicateUser', (data) => {
    toastr.error(data.message);
    setTimeout(() => {
        window.location.href = data.redirectUrl;
    }, 3000);
});

// Inactivity timeout
let inactivityTimeout;
const inactivityLimit = 120000; // 2 minutes

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

resetInactivityTimeout();

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
    return OFFENSIVE_WORDS.some(word => text.toLowerCase().includes(word.toLowerCase()));
}

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.classList.add('row');
    if (chatRoom.classList.contains('vertical-layout')) {
        userElement.classList.add('column');
    }
    userElement.dataset.userId = user.userId;

    const userInfo = document.createElement('div');
    userInfo.classList.add('sub-row');
    userInfo.innerHTML = `<span>${escapeHtml(user.username)}</span><span>/</span><span>${escapeHtml(user.location)}</span>`;
    
    userInfo.style.backgroundColor = '#333';
    userInfo.style.color = 'white';
    userInfo.style.padding = '5px';
    userInfo.style.paddingLeft = '12px';
    userInfo.style.marginBottom = '10px';

    const userTyping = document.createElement('textarea');
    userTyping.classList.add('sub-row');
    userTyping.disabled = user.userId !== userId;
    userTyping.maxLength = 1000;

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
            if (userTyping.value.length >= userTyping.maxLength) {
                toastr.error(`Message is too long! Maximum length is ${userTyping.maxLength} characters.`);
            } else {
                if (containsOffensiveWord(userTyping.value)) {
                    toastr.error('Message contains offensive words.');
                    socket.emit('message', { roomId, userId, message: userTyping.value });
                    userTyping.value = '';
                } else {
                    socket.emit('typing', { roomId, userId, message: userTyping.value });
                    resetInactivityTimeout();
                }
            }
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

function getCookie(name) {
    let cookieArray = document.cookie.split(';');
    for (let i = 0; i < cookieArray.length; i++) {
        let cookiePair = cookieArray[i].split('=');
        if (name == cookiePair[0].trim()) {
            return decodeURIComponent(cookiePair[1]);
        }    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
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