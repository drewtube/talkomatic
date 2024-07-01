const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const roomType = urlParams.get('roomType');
const roomName = urlParams.get('roomName');
const username = urlParams.get('username');
const userLocation = urlParams.get('location');
const userId = urlParams.get('userId');
const userColorName = getCookie('userColor') || decodeURIComponent(urlParams.get('txtclr')) || 'white';
const userColor = getColorHex(userColorName);


let OFFENSIVE_WORDS = [];
let birthdayCelebrated = false;

// At the top of chat_room.js, add this color mapping function
function getColorHex(colorName) {
    const colorMap = {
        'white': '#FFFFFF',
        'orange': '#FF9800',
        'blue': '#00FFFF',
        'green': '#00FF00',
        'pink': '#FF00FF',
        'yellow': '#FFFF00'
    };
    return colorMap[colorName] || '#FFFFFF'; // Default to white if color not found
}



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

socket.emit('joinRoom', { roomId, username, location: userLocation, userId, color: userColorName });

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
    showLimitedToast('error', data.message);
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
            showLimitedToast('error', 'You were removed from the room for being inactive for 2 minutes.');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        }
    }, inactivityLimit);
}

document.addEventListener('keydown', resetInactivityTimeout);
document.addEventListener('mousemove', resetInactivityTimeout);

resetInactivityTimeout();

let activeToasts = [];

function showLimitedToast(type, message) {
    // Remove any existing toasts with the same message
    const existingToast = activeToasts.find(toast => toast && toast.options && toast.options.message === message);
    if (existingToast) {
        toastr.remove(existingToast);
        activeToasts = activeToasts.filter(toast => toast !== existingToast);
    }
    
    // If we're at the max number of toasts, remove the oldest one
    if (activeToasts.length >= toastr.options.maxOpened) {
        const oldestToast = activeToasts.shift();
        if (oldestToast) {
            toastr.remove(oldestToast);
        }
    }
    
    // Show the new toast
    const newToast = toastr[type](message);
    
    // Add the new toast to our array
    activeToasts.push(newToast);
    
    // Remove the toast from our array when it's hidden
    newToast.on('hidden.bs.toast', function() {
        const index = activeToasts.indexOf(newToast);
        if (index > -1) {
            activeToasts.splice(index, 1);
        }
    });
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
        "today is my birthday",
        "it's my birthday",
        "it is my birthday",
        "today's my birthday",
        "my birthday is today",
        "i'm celebrating my birthday",
        "im celebrating my birthday",
        "today is my bday",
        "its my bday",
        "it's my bday",
        "my bday is today",
        "celebrating my bday",
        "my birthday party is today",
        "having my birthday party",
        "born on this day"
    ];
    return birthdayPhrases.some(phrase => text.toLowerCase().includes(phrase));
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
    userTyping.style.color = user.userId === userId ? userColor : (getColorHex(user.color) || '#FFA500');
    userTyping.style.webkitTextFillColor = user.userId === userId ? userColor : (getColorHex(user.color) || '#FFA500');
    userTyping.style.padding = '10px';
    userTyping.style.fontSize = '16px';
    userTyping.style.boxSizing = 'border-box';
    userTyping.style.fontFamily = '"Courier New", Courier, monospace';
    userTyping.style.opacity = '1';

    if (user.userId === userId) {
        userTyping.style.border = '1px solid white';
        userTyping.addEventListener('input', () => {
            if (userTyping.value.length >= userTyping.maxLength) {
                showLimitedToast('error', `Message is too long! Maximum length is ${userTyping.maxLength} characters.`);
            } else {
                if (containsOffensiveWord(userTyping.value)) {
                    showLimitedToast('error', 'Message contains offensive words.');
                    socket.emit('message', { roomId, userId, message: userTyping.value, color: userColor });
                    userTyping.value = '';
                } else {
                    socket.emit('typing', { roomId, userId, message: userTyping.value, color: userColor });
                    resetInactivityTimeout();

                    if (isBirthdayMessage(userTyping.value)) {
                        socket.emit('message', { roomId, userId, message: userTyping.value, color: userColor });
                    }
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

socket.on('typing', (data) => {
    const userElement = document.querySelector(`[data-user-id="${data.userId}"]`);
    if (userElement) {
        const textareaElement = userElement.querySelector('textarea');
        textareaElement.value = data.message;
        if (data.userId !== userId) {
            const colorHex = getColorHex(data.color);
            textareaElement.style.color = colorHex || '#FFA500';
            textareaElement.style.webkitTextFillColor = colorHex || '#FFA500';
        }
    }
});


socket.on('message', (data) => {
    const { userId: messageUserId, message, color } = data;
    const userElement = document.querySelector(`[data-user-id="${messageUserId}"]`);
    if (userElement) {
        const textareaElement = userElement.querySelector('textarea');
        textareaElement.value = message;
        if (messageUserId !== userId) {
            const colorHex = getColorHex(color);
            textareaElement.style.color = colorHex || '#FFA500';
            textareaElement.style.webkitTextFillColor = colorHex || '#FFA500';
        }
    }
});

function changeColor(color) {
    socket.emit('changeColor', { userId, color });
    const userElement = document.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        const textareaElement = userElement.querySelector('textarea');
        textareaElement.style.color = color;
        textareaElement.style.webkitTextFillColor = color;
    }
    setCookie('userColor', color, 30); // Store the selected color in a cookie
}

window.addEventListener('beforeunload', () => {
    socket.emit('userDisconnected', { userId });
});

function updateUserColor(newColor) {
    userColor = getColorHex(newColor);
    setCookie('userColor', newColor, 30);
    const userElement = document.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        const textareaElement = userElement.querySelector('textarea');
        textareaElement.style.color = userColor;
        textareaElement.style.webkitTextFillColor = userColor;
    }
    socket.emit('changeColor', { roomId, userId, color: newColor });
}

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