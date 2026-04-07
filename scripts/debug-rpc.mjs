import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:2090/', { headers: { Origin: 'http://localhost:2090' } });
let reqId = 0;

function send(method, params) {
  const id = 'test-' + (++reqId);
  ws.send(JSON.stringify({ type: 'req', id, method, params: params || {} }));
  return id;
}

ws.on('open', () => console.log('WS open'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    console.log('Got challenge, sending connect...');
    send('connect', {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'openclaw-control-ui', version: 'test', platform: 'test', mode: 'ui' },
      role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'],
    });
    return;
  }

  if (msg.type === 'res' && msg.ok === true) {
    if (reqId === 1) {
      console.log('Connected. Fetching config.schema...');
      send('config.schema');
      return;
    }
    if (reqId === 2) {
      const payload = msg.payload;
      console.log('\n=== config.schema response ===');
      console.log('Top-level keys:', Object.keys(payload));
      if (payload.schema) {
        console.log('schema.type:', payload.schema.type);
        const propKeys = Object.keys(payload.schema.properties || {});
        console.log('schema.properties keys:', propKeys);
        const channels = payload.schema.properties?.channels;
        if (channels) {
          console.log('channels.type:', channels.type);
          const chKeys = Object.keys(channels.properties || {});
          console.log('channels.properties keys:', chKeys);
          // Print first channel schema as sample
          const discord = channels.properties?.discord;
          if (discord) {
            console.log(`\n=== discord channel schema ===`);
            console.log(`discord.type:`, discord.type);
            const discordKeys = Object.keys(discord.properties || {});
            console.log(`discord.properties keys (${discordKeys.length}):`, discordKeys);
          }
          const whatsapp = channels.properties?.whatsapp;
          if (whatsapp) {
            console.log(`\n=== whatsapp channel schema ===`);
            console.log(`whatsapp.type:`, whatsapp.type);
            const waKeys = Object.keys(whatsapp.properties || {});
            console.log(`whatsapp.properties keys (${waKeys.length}):`, waKeys);
          }
          const telegram = channels.properties?.telegram;
          if (telegram) {
            console.log(`\n=== telegram channel schema ===`);
            console.log(`telegram.type:`, telegram.type);
            const tgKeys = Object.keys(telegram.properties || {});
            console.log(`telegram.properties keys (${tgKeys.length}):`, tgKeys);
          }
        } else {
          console.log('NO channels in schema.properties');
        }
      } else {
        console.log('NO .schema in payload');
        console.log('Payload sample:', JSON.stringify(payload).slice(0, 1000));
      }

      send('config.get');
      return;
    }
    if (reqId === 3) {
      const payload = msg.payload;
      console.log('\n=== config.get response ===');
      console.log('Top-level keys:', Object.keys(payload));
      if (payload.config) {
        console.log('config keys:', Object.keys(payload.config));
        const ch = payload.config.channels;
        console.log('config.channels:', ch ? JSON.stringify(ch).slice(0, 500) : 'MISSING');
      } else {
        console.log('Payload (no .config):', JSON.stringify(payload).slice(0, 1000));
      }
      send('channels.status');
      return;
    }
    if (reqId === 4) {
      const payload = msg.payload;
      console.log('\n=== channels.status response ===');
      console.log('Full response:', JSON.stringify(payload).slice(0, 2000));
      ws.close();
      process.exit(0);
    }
  }

  if (msg.type === 'res' && msg.ok === false) {
    console.log('ERROR:', JSON.stringify(msg).slice(0, 500));
  }
});

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
