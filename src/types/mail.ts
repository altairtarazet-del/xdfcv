export interface SMTPDevMailbox {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SMTPDevMessage {
  id: string;
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  subject: string;
  text?: string;
  html?: string;
  date: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface FilteredMailQuery {
  timeFilterMinutes?: number;
  allowedMailboxes?: string[];
  allowedSenders?: string[];
  allowedReceivers?: string[];
}
