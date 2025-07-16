import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { VerificationStatus, StatusHistory, FailedVerification } from '@/types/failed-verification';

export async function updateVerificationStatus(
  verificationId: string,
  newStatus: VerificationStatus,
  note?: string,
  additionalData?: Partial<FailedVerification>
) {
  const docRef = doc(db, 'user_failed_verifications', verificationId);
  
  const statusUpdate: StatusHistory = {
    status: newStatus,
    timestamp: new Date().toISOString(),
    note
  };
  
  const updateData: any = {
    status: newStatus,
    lastStatusUpdate: new Date().toISOString(),
    statusHistory: arrayUnion(statusUpdate),
    ...additionalData
  };
  
  // Set specific timestamp fields based on status
  switch (newStatus) {
    case 'email_sent':
      updateData.emailSentAt = new Date().toISOString();
      break;
    case 'label_received':
      updateData.labelReceivedAt = new Date().toISOString();
      break;
    case 'shipped_back':
      updateData.shippedBackAt = new Date().toISOString();
      break;
    case 'delivered_to_stockx':
      updateData.deliveredAt = new Date().toISOString();
      break;
    case 'refund_processed':
      updateData.refundProcessedAt = new Date().toISOString();
      break;
  }
  
  await updateDoc(docRef, updateData);
}

export async function sendStockXEmail(verificationId: string, orderNumber: string, productName: string, recipientEmail: string) {
  try {
    // Call your existing email API
    const response = await fetch('/api/gmail/send-return-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderNumber,
        productName,
        recipientEmail
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    // After sending email, update status
    await updateVerificationStatus(verificationId, 'email_sent', 'Return request email sent to StockX');
    
    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}