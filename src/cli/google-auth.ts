#!/usr/bin/env tsx
/**
 * Google OAuth2 helper to get refresh token
 * Usage: npx tsx src/cli/google-auth.ts
 */

import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { google } from 'googleapis';

// Load .env
function loadDotEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) return;
  
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

const REDIRECT_PORT = 3333;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

async function main() {
  console.log('\n📅 Google Calendar OAuth Setup\n');

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
  });

  console.log('Opening browser for authentication...\n');
  console.log('If the browser doesn\'t open, visit this URL:\n');
  console.log(authUrl);
  console.log('');

  // Open browser
  const { exec } = await import('child_process');
  const openCommand = process.platform === 'win32' ? 'start' : 
                      process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${openCommand} "${authUrl}"`);

  // Start local server to catch the callback
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400);
      res.end(`Error: ${error}`);
      console.error(`\n❌ Auth error: ${error}`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400);
      res.end('No code received');
      return;
    }

    try {
      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>✅ Success!</h1>
            <p>You can close this window and return to the terminal.</p>
          </body>
        </html>
      `);

      console.log('\n✅ Authentication successful!\n');
      console.log('Add this to your .env file:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('');

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500);
      res.end('Failed to exchange code for tokens');
      console.error('\n❌ Token exchange failed:', err);
      server.close();
      process.exit(1);
    }
  });

  server.listen(REDIRECT_PORT, () => {
    console.log(`Waiting for authorization callback on port ${REDIRECT_PORT}...`);
  });
}

main();

