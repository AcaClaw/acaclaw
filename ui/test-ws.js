const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:2090/');
ws.on('open', () => console.log('Connected!'));
ws.on('message', (data) => console.log('Message:', data.toString()));
ws.on('close', (c,r) => console.log('Closed', c, r));
ws.on('error', (e) => console.error('Error:', e));
