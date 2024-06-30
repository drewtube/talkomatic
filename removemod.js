// removemod.js

const io = require('socket.io-client');
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000'; // Change this to your server's URL
const ADMIN_SECRET = '786215'; // Set this to a secure secret

async function removeModAccess() {
    try {
        // Clear mod cookies on the server
        const response = await axios.post(`${SERVER_URL}/admin/clear-all-mod-cookies`, {
            adminSecret: ADMIN_SECRET
        });

        if (response.data.success) {
            console.log('All mod cookies cleared on the server.');

            // Connect to the Socket.IO server
            const socket = io(SERVER_URL);

            socket.on('connect', () => {
                console.log('Connected to the server.');

                // Emit an event to clear mod access for all connected clients
                socket.emit('adminClearModAccess', { adminSecret: ADMIN_SECRET });

                socket.on('modAccessCleared', () => {
                    console.log('Mod access cleared for all connected clients.');
                    socket.disconnect();
                    process.exit(0);
                });
            });

            socket.on('connect_error', (error) => {
                console.error('Failed to connect to the server:', error);
                process.exit(1);
            });
        } else {
            console.error('Failed to clear mod cookies on the server.');
            process.exit(1);
        }
    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

removeModAccess();