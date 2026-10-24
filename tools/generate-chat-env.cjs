'use strict';
// Run privately on the operator's own machine. Never prints passwords to logs.
const fs=require('node:fs');const crypto=require('node:crypto');
const password=crypto.randomBytes(24).toString('base64url');const secret=crypto.randomBytes(48).toString('base64url');
const filename='.env.local',passwordFile='swk-chat-operator-password.txt';
if(fs.existsSync(filename)||fs.existsSync(passwordFile))throw Error('Existing private settings found. Move them safely before generating replacements.');
fs.writeFileSync(filename,'SWK_CHAT_REDIS_URL=\nSWK_CHAT_REDIS_TOKEN=\nSWK_CHAT_ADMIN_PASSWORD_SHA256='+crypto.createHash('sha256').update(password).digest('hex')+'\nSWK_CHAT_SESSION_SECRET='+secret+'\nSWK_CHAT_ORIGIN=https://www.swkpropertiesuae.com\n',{mode:0o600,flag:'wx'});
fs.writeFileSync(passwordFile,password+'\n',{mode:0o600,flag:'wx'});
console.log('Created private .env.local settings and swk-chat-operator-password.txt. Store them securely; do not commit or share them.');
