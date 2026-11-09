export interface EmailMessage {
  /** `"Shop name" <address>` */
  from: string;
  to: string;
  replyTo?: string | undefined;
  subject: string;
  html: string;
  text: string;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
  /** True when sent rows keep their bodies (the outbox-only driver outside production). */
  keepBodies: boolean;
}
