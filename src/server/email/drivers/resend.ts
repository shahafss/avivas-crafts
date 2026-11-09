import 'server-only';
import { Resend } from 'resend';
import type { EmailDriver } from './types';

export function createResendDriver(apiKey: string): EmailDriver {
  const client = new Resend(apiKey);
  return {
    keepBodies: false,
    async send(message) {
      const { error } = await client.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
      });
      if (error) throw new Error(`Resend: ${error.name}`);
    },
  };
}
