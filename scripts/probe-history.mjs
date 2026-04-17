import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:2090/', { headers: { Origin: 'http://localhost:2090' } });

ws.on('open', () => {});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'debug', version: '1', platform: 'test', mode: 'ui' },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing']
      }
    }));
    return;
  }

  if (msg.type === 'res' && msg.id === 'c1' && msg.ok) {
    // Try the default main session
    ws.send(JSON.stringify({
      type: 'req', id: 'h1', method: 'chat.history',
      params: { sessionKey: 'agent:main:web:main', limit: 10 }
    }));
    return;
  }

  if (msg.type === 'res' && msg.id === 'h1') {
    const msgs = msg.payload?.messages ?? [];
    console.log('Total messages:', msgs.length);
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (Array.isArray(m.content)) {
        const types = m.content.map(c => c.type);
        console.log(`[${i}] ${m.role}: ${JSON.stringify(types)}`);
        for (const c of m.content) {
          if (c.type !== 'text' && c.type !== 'thinking') {
            console.log('  >> ' + c.type + ':', JSON.stringify(c).slice(0, 400));
          }
        }
      } else {
        console.log(`[${i}] ${m.role}: string (${(m.content || '').length} chars)`);
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.error('ERR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(0); }, 6000);
