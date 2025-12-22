// Resend email integration for NumisVault
// Uses Replit's Resend connector for API key management

import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { 
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email 
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export interface WatchlistAlertData {
  userName: string;
  userEmail: string;
  watchlistName: string;
  matchCount: number;
  matches: Array<{
    title: string;
    ruler?: string;
    denomination?: string;
    mint?: string;
    sourceUrl?: string;
  }>;
}

export async function sendWatchlistAlert(data: WatchlistAlertData): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();

    const matchesHtml = data.matches.map(m => `
      <li style="margin-bottom: 12px; padding: 12px; background: #f8f8f8; border-radius: 4px;">
        <strong>${m.title}</strong><br/>
        ${m.ruler ? `Ruler: ${m.ruler}<br/>` : ''}
        ${m.denomination ? `Denomination: ${m.denomination}<br/>` : ''}
        ${m.mint ? `Mint: ${m.mint}<br/>` : ''}
        ${m.sourceUrl ? `<a href="${m.sourceUrl}" style="color: #8B7355;">View Source</a>` : ''}
      </li>
    `).join('');

    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2C2416;">
        <h1 style="color: #8B7355; border-bottom: 2px solid #D4C5A9; padding-bottom: 16px;">
          NumisVault Alert
        </h1>
        <p>Hello ${data.userName},</p>
        <p>Your watchlist "<strong>${data.watchlistName}</strong>" has ${data.matchCount} new match${data.matchCount > 1 ? 'es' : ''}:</p>
        <ul style="list-style: none; padding: 0;">
          ${matchesHtml}
        </ul>
        <p style="margin-top: 24px;">
          <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://numis-vault.replit.app'}/watchlists" 
             style="background: #8B7355; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            View Your Watchlists
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin-top: 32px;">
          This is an automated alert from NumisVault. You can manage your notification preferences in your account settings.
        </p>
      </div>
    `;

    const result = await client.emails.send({
      from: fromEmail || 'NumisVault <noreply@resend.dev>',
      to: data.userEmail,
      subject: `NumisVault: ${data.matchCount} new match${data.matchCount > 1 ? 'es' : ''} for "${data.watchlistName}"`,
      html
    });

    console.log('Email sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Failed to send watchlist alert:', error);
    return false;
  }
}
