export type VerificationStatus = 
  | 'needs_review'
  | 'email_sent'
  | 'label_received'
  | 'shipped_back'
  | 'delivered_to_stockx'
  | 'refund_processed'
  | 'dispute'
  | 'closed_no_resolution';

export interface StatusHistory {
  status: VerificationStatus;
  timestamp: string;
  note?: string;
}

export interface FailedVerification {
  id?: string;
  userId: string;
  orderNumber: string;
  productName: string;
  failureReason: string;
  date: string;
  emailDate?: string;
  status: VerificationStatus;
  subject: string;
  fromEmail: string;
  source: 'gmail_scan' | 'manual';
  createdAt: string;
  additionalNotes?: string;
  
  // New fields
  statusHistory: StatusHistory[];
  lastStatusUpdate: string;
  returnTrackingNumber?: string;
  stockxTicketNumber?: string;
  emailSentAt?: string;
  labelReceivedAt?: string;
  shippedBackAt?: string;
  deliveredAt?: string;
  refundProcessedAt?: string;
  refundAmount?: number;
  expectedRefundAmount?: number;
  purchaseOrderNumber?: string;
  lastUpdated?: string;
}