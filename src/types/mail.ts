export interface SMTPDevMailbox {
  id: string;
  name?: string;
  email?: string;
  createdAt?: string;
}

export interface SMTPDevMessage {
  id: string;
  from: string | {
    address: string;
    name?: string;
  };
  to: string | Array<string | {
    address: string;
    name?: string;
  }>;
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
  createdAt?: string;
  attachments?: Array<{
    filename: string;
    contentType?: string;
    size?: number;
  }>;
}

export interface FilteredMailQuery {
  timeFilterMinutes?: number;
  allowedMailboxes?: string[];
  allowedSenders?: string[];
  allowedReceivers?: string[];
}
