const socket = io();

// Get the room ID, username, userLocation, and userId from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const username = urlParams.get('username');
const userLocation = urlParams.get('location');
const userId = urlParams.get('userId');

// DOM elements
const chatRoom = document.getElementById('chatRoom');

// Join the room on page load
socket.emit('joinRoom', { roomId, username, location: userLocation, userId });

// Handle user joining the room
socket.on('initializeUsers', (users) => {
    chatRoom.innerHTML = ''; // Clear the chat room before adding users
    users.forEach((user, index) => {
        const userElement = createUserElement(user, index);
        chatRoom.appendChild(userElement);
    });
});

socket.on('userJoined', (user) => {
    const userElement = createUserElement(user);
    chatRoom.appendChild(userElement);
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

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.classList.add('row');
    userElement.dataset.userId = user.userId;

    const userInfo = document.createElement('div');
    userInfo.classList.add('sub-row');
    userInfo.innerHTML = `<span>${user.username}</span><span>/</span><span>${user.location}</span>`;

    const userTyping = document.createElement('textarea');
    userTyping.classList.add('sub-row');
    userTyping.disabled = user.userId !== userId;

    // Apply styles via JavaScript
    userTyping.style.width = '100%';
    userTyping.style.height = '80px';
    userTyping.style.resize = 'none';
    userTyping.style.backgroundColor = 'black';
    userTyping.style.color = 'white';
    userTyping.style.border = '1px solid white';
    userTyping.style.padding = '10px';
    userTyping.style.fontSize = '14px';
    userTyping.style.boxSizing = 'border-box';
    userTyping.style.fontFamily = '"Courier New", Courier, monospace';

    if (user.userId !== userId) {
        userTyping.style.userSelect = 'none';
    }

    if (user.userId === userId) {
        userTyping.addEventListener('input', () => {
            socket.emit('typing', { roomId, userId, message: userTyping.value });
        });
    }

    userElement.appendChild(userInfo);
    userElement.appendChild(userTyping);

    return userElement;
}
