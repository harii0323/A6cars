//============================================================
// ✅ Email Service - Brevo (SendinBlue) Integration
// Handles automated emails for bookings and cancellations
//============================================================

const brevo = require('brevo');
require('dotenv').config();

// ============================================================
// ✅ Brevo Configuration
// ============================================================
const apiInstance = new brevo.TransactionalEmailsApi();

// Set API key for authentication
apiInstance.setApiKey(brevo.ApiKeyAuth.API_KEY, process.env.BREVO_API_KEY);

// Test the API connection
(async () => {
  try {
    const accountApi = new brevo.AccountApi();
    accountApi.setApiKey(brevo.ApiKeyAuth.API_KEY, process.env.BREVO_API_KEY);
    await accountApi.getAccount();
    console.log('✅ Brevo email service ready');
  } catch (error) {
    console.log('❌ Brevo service error:', error.message);
  }
})();

// ============================================================
// ✅ Email Templates
// ============================================================

const getBookingConfirmationEmail = (customer, booking, car) => {
  const bookingDate = new Date(booking.start_date).toLocaleDateString('en-IN');
  const returnDate = new Date(booking.end_date).toLocaleDateString('en-IN');
  
  return {
    subject: `Booking Confirmation - A6 Cars #${booking.id}`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a73e8; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .booking-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1a73e8; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; color: #1a73e8; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
          .btn { display: inline-block; background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚗 Booking Confirmation</h2>
          </div>
          
          <div class="content">
            <p>Dear <strong>${customer.name}</strong>,</p>
            
            <p>Thank you for booking with A6 Cars! Your booking has been confirmed. Below are your booking details:</p>
            
            <div class="booking-details">
              <div class="detail-row">
                <span class="label">Booking ID:</span>
                <span>#${booking.id}</span>
              </div>
              <div class="detail-row">
                <span class="label">Vehicle:</span>
                <span>${car.brand} ${car.model}</span>
              </div>
              <div class="detail-row">
                <span class="label">Pickup Date:</span>
                <span>${bookingDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Return Date:</span>
                <span>${returnDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Total Amount:</span>
                <span style="color: #28a745; font-weight: bold;">₹${booking.amount}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status:</span>
                <span style="color: #ffc107; font-weight: bold;">Pending Payment</span>
              </div>
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Complete payment using the UPI QR code sent to your phone</li>
              <li>Your booking will be confirmed once payment is verified</li>
              <li>You'll receive another email confirming your final booking</li>
            </ul>
            
            <p><strong>Contact Information:</strong></p>
            <p>If you have any questions, please contact us at:<br>
            Email: support@a6cars.com<br>
            Phone: +91 8179134484</p>
            
            <p>Thank you for choosing A6 Cars!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2025 A6 Cars. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this address.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

const getPaymentConfirmedEmail = (customer, booking, car) => {
  const bookingDate = new Date(booking.start_date).toLocaleDateString('en-IN');
  const returnDate = new Date(booking.end_date).toLocaleDateString('en-IN');
  
  return {
    subject: `Payment Confirmed - A6 Cars Booking #${booking.id}`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .success-box { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .booking-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #28a745; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; color: #28a745; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>✅ Payment Confirmed</h2>
          </div>
          
          <div class="content">
            <p>Dear <strong>${customer.name}</strong>,</p>
            
            <div class="success-box">
              <strong>Your payment has been successfully received and verified!</strong>
            </div>
            
            <p>Your booking is now confirmed. Here are your final booking details:</p>
            
            <div class="booking-details">
              <div class="detail-row">
                <span class="label">Booking ID:</span>
                <span>#${booking.id}</span>
              </div>
              <div class="detail-row">
                <span class="label">Vehicle:</span>
                <span>${car.brand} ${car.model}</span>
              </div>
              <div class="detail-row">
                <span class="label">Pickup Date:</span>
                <span>${bookingDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Return Date:</span>
                <span>${returnDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Total Amount:</span>
                <span style="color: #28a745; font-weight: bold;">₹${booking.amount}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status:</span>
                <span style="color: #28a745; font-weight: bold;">✅ CONFIRMED</span>
              </div>
            </div>
            
            <p><strong>Important Reminders:</strong></p>
            <ul>
              <li>Please arrive 15 minutes before your pickup time</li>
              <li>Bring a valid ID and driving license</li>
              <li>Return the vehicle by ${returnDate} as per the agreement</li>
              <li>For any changes, contact us immediately</li>
            </ul>
            
            <p><strong>Contact Information:</strong></p>
            <p>If you have any questions, please contact us at:<br>
            Email: support@a6cars.com<br>
            Phone: +91 8179134484</p>
            
            <p>Thank you for choosing A6 Cars!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2025 A6 Cars. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this address.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

const getCancellationEmail = (customer, booking, car, reason, refundAmount) => {
  const bookingDate = new Date(booking.start_date).toLocaleDateString('en-IN');
  const returnDate = new Date(booking.end_date).toLocaleDateString('en-IN');
  
  return {
    subject: `Booking Cancelled - A6 Cars #${booking.id}`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; }
          .cancel-box { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .booking-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #dc3545; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; color: #dc3545; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>❌ Booking Cancelled</h2>
          </div>
          
          <div class="content">
            <p>Dear <strong>${customer.name}</strong>,</p>
            
            <div class="cancel-box">
              <strong>Your booking has been cancelled.</strong>
            </div>
            
            <p>Below are the details of your cancelled booking:</p>
            
            <div class="booking-details">
              <div class="detail-row">
                <span class="label">Booking ID:</span>
                <span>#${booking.id}</span>
              </div>
              <div class="detail-row">
                <span class="label">Vehicle:</span>
                <span>${car.brand} ${car.model}</span>
              </div>
              <div class="detail-row">
                <span class="label">Original Pickup Date:</span>
                <span>${bookingDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Original Return Date:</span>
                <span>${returnDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Booking Amount:</span>
                <span>₹${booking.amount}</span>
              </div>
              ${refundAmount > 0 ? `
              <div class="detail-row">
                <span class="label">Refund Amount:</span>
                <span style="color: #28a745; font-weight: bold;">₹${refundAmount}</span>
              </div>
              ` : ''}
            </div>
            
            ${reason ? `
            <p><strong>Cancellation Reason:</strong></p>
            <p>${reason}</p>
            ` : ''}
            
            ${refundAmount > 0 ? `
            <p><strong>Refund Information:</strong></p>
            <ul>
              <li>Refund amount: ₹${refundAmount}</li>
              <li>The refund will be processed to your original payment method within 3-5 business days</li>
              <li>Please check your bank account for the refund</li>
            </ul>
            ` : ''}
            
            <p><strong>Book Again:</strong></p>
            <p>We'd love to have you back! Feel free to explore our available vehicles and book again anytime.</p>
            
            <p><strong>Contact Information:</strong></p>
            <p>If you have any questions about this cancellation, please contact us at:<br>
            Email: support@a6cars.com<br>
            Phone: +91 8179134484</p>
            
            <p>Thank you for being a valued customer!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2025 A6 Cars. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this address.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

// ============================================================
// ✅ Email Sending Functions
// ============================================================

/**
 * Send booking confirmation email
 * @param {Object} customer - Customer object with name and email
 * @param {Object} booking - Booking object with id, start_date, end_date, amount
 * @param {Object} car - Car object with brand, model, location
 */
const sendBookingConfirmationEmail = async (customer, booking, car) => {
  try {
    if (!customer.email) {
      console.warn('⚠️ Customer email not found for booking #' + booking.id);
      return false;
    }

    const emailTemplate = getBookingConfirmationEmail(customer, booking, car);
    
    const sendSmtpEmail = new brevo.SendSmtpEmail({
      to: [{ email: customer.email, name: customer.name }],
      sender: { 
        email: process.env.EMAIL_FROM || 'noreply@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      },
      subject: emailTemplate.subject,
      htmlContent: emailTemplate.htmlContent,
      replyTo: {
        email: process.env.EMAIL_FROM || 'support@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      }
    });

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Booking confirmation email sent to:', customer.email);
    return result;
  } catch (error) {
    console.error('❌ Error sending booking confirmation email:', error.message);
    return false;
  }
};

/**
 * Send payment confirmed email
 * @param {Object} customer - Customer object with name and email
 * @param {Object} booking - Booking object with id, start_date, end_date, amount
 * @param {Object} car - Car object with brand, model
 */
const sendPaymentConfirmedEmail = async (customer, booking, car) => {
  try {
    if (!customer.email) {
      console.warn('⚠️ Customer email not found for booking #' + booking.id);
      return false;
    }

    const emailTemplate = getPaymentConfirmedEmail(customer, booking, car);
    
    const sendSmtpEmail = new brevo.SendSmtpEmail({
      to: [{ email: customer.email, name: customer.name }],
      sender: { 
        email: process.env.EMAIL_FROM || 'noreply@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      },
      subject: emailTemplate.subject,
      htmlContent: emailTemplate.htmlContent,
      replyTo: {
        email: process.env.EMAIL_FROM || 'support@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      }
    });

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Payment confirmation email sent to:', customer.email);
    return result;
  } catch (error) {
    console.error('❌ Error sending payment confirmation email:', error.message);
    return false;
  }
};

/**
 * Send cancellation email
 * @param {Object} customer - Customer object with name and email
 * @param {Object} booking - Booking object with id, start_date, end_date, amount
 * @param {Object} car - Car object with brand, model
 * @param {String} reason - Cancellation reason
 * @param {Number} refundAmount - Refund amount
 */
const sendCancellationEmail = async (customer, booking, car, reason, refundAmount = 0) => {
  try {
    if (!customer.email) {
      console.warn('⚠️ Customer email not found for booking #' + booking.id);
      return false;
    }

    const emailTemplate = getCancellationEmail(customer, booking, car, reason, refundAmount);
    
    const sendSmtpEmail = new brevo.SendSmtpEmail({
      to: [{ email: customer.email, name: customer.name }],
      sender: { 
        email: process.env.EMAIL_FROM || 'noreply@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      },
      subject: emailTemplate.subject,
      htmlContent: emailTemplate.htmlContent,
      replyTo: {
        email: process.env.EMAIL_FROM || 'support@a6cars.com',
        name: process.env.EMAIL_FROM_NAME || 'A6 Cars'
      }
    });

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Cancellation email sent to:', customer.email);
    return result;
  } catch (error) {
    console.error('❌ Error sending cancellation email:', error.message);
    return false;
  }
};

module.exports = {
  sendBookingConfirmationEmail,
  sendPaymentConfirmedEmail,
  sendCancellationEmail
};
