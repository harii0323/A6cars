const axios = require('axios');
require('dotenv').config();

const BASE_URL = `http://localhost:${process.env.PORT || 10000}`;
const client = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true
});

async function runTests() {
  console.log('='.repeat(70));
  console.log('🚀 A6 CARS - COMPREHENSIVE AUTHORIZATION & ENDPOINT TEST SUITE');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition, description, detail = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  // 1. Health & Public browsing
  console.log('\n[1] Testing Public Browsing Endpoints...');
  const healthRes = await client.get('/health');
  assert(healthRes.status === 200 && healthRes.data.status === 'ok', 'GET /health returns 200 ok');

  const carsRes = await client.get('/api/cars');
  assert(carsRes.status === 200 && Array.isArray(carsRes.data), 'GET /api/cars returns 200 array without auth');
  const testCar = carsRes.data.length ? carsRes.data[0] : null;

  if (testCar) {
    const carBookingsRes = await client.get(`/api/bookings/${testCar.id}`);
    assert(carBookingsRes.status === 200 && Array.isArray(carBookingsRes.data), 'GET /api/bookings/:car_id returns 200');
    
    // Check for leak of sensitive fields
    const hasLeak = carBookingsRes.data.some(row => row.amount !== undefined || row.paid !== undefined || row.verified !== undefined);
    assert(!hasLeak, 'GET /api/bookings/:car_id strips amount, paid, verified fields');

    const batchRes = await client.post('/api/bookings/batch', { car_ids: [testCar.id] });
    assert(batchRes.status === 200 && typeof batchRes.data === 'object', 'POST /api/bookings/batch returns 200 grouped availability');
  }

  // 2. Unauthenticated Booking Rejection
  console.log('\n[2] Testing Guest Booking Attempt...');
  const unauthBookRes = await client.post('/api/book', {
    car_id: testCar ? testCar.id : 1,
    start_date: '2027-01-10',
    end_date: '2027-01-12'
  });
  assert(unauthBookRes.status === 401, 'POST /api/book without auth returns 401');

  // 3. User Registration & Authentication
  console.log('\n[3] Testing User Auth & Handoff...');
  const randA = Math.floor(Math.random() * 100000);
  const randB = Math.floor(Math.random() * 100000);
  
  const userAPayload = {
    name: 'Alice Driver',
    email: `alice_${randA}@example.com`,
    phone: '9876543210',
    password: 'password123'
  };
  const userBPayload = {
    name: 'Bob Driver',
    email: `bob_${randB}@example.com`,
    phone: '9876543211',
    password: 'password123'
  };

  const regARes = await client.post('/api/register', userAPayload);
  assert(regARes.status === 200 && regARes.data.token && regARes.data.customer_id, 'POST /api/register creates User A and returns token');
  const userAToken = regARes.data.token;
  const userAId = regARes.data.customer_id;

  const regBRes = await client.post('/api/register', userBPayload);
  assert(regBRes.status === 200 && regBRes.data.token && regBRes.data.customer_id, 'POST /api/register creates User B and returns token');
  const userBToken = regBRes.data.token;
  const userBId = regBRes.data.customer_id;

  // 4. Authenticated Booking Creation
  console.log('\n[4] Testing Authenticated Booking Creation...');
  let bookingAId = null;
  if (testCar) {
    const bookARes = await client.post('/api/book', {
      car_id: testCar.id,
      start_date: '2027-02-01',
      end_date: '2027-02-03',
      payment_plan: 'full'
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });

    assert(bookARes.status === 200 && bookARes.data.booking_id, 'POST /api/book with User A token creates booking');
    bookingAId = bookARes.data.booking_id;
  }

  // 5. Personal Booking Data Protection (Cross-Customer Checks)
  console.log('\n[5] Testing Personal Data Cross-User Ownership...');
  const endpoints = ['mybookings', 'history', 'bookings/status', 'discounts', 'notifications'];
  
  for (const ep of endpoints) {
    // Unauth attempt
    const unauthRes = await client.get(`/api/${ep}/${userAId}`);
    assert(unauthRes.status === 401, `GET /api/${ep}/:id unauthenticated returns 401`);

    // User B tries to view User A's data
    const crossRes = await client.get(`/api/${ep}/${userAId}`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert(crossRes.status === 403, `GET /api/${ep}/:id (User B accessing User A data) returns 403`);

    // User A views their own data
    const ownerRes = await client.get(`/api/${ep}/${userAId}`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert(ownerRes.status === 200, `GET /api/${ep}/:id (User A accessing own data) returns 200`);
  }

  // 6. Payment & Verification Protection
  console.log('\n[6] Testing Payment Endpoint Authorization...');
  if (bookingAId) {
    // QR Code fetch authorization
    const qrUnauth = await client.post('/api/payments/qr', { booking_id: bookingAId });
    assert(qrUnauth.status === 401, 'POST /api/payments/qr unauthenticated returns 401');

    const qrCross = await client.post('/api/payments/qr', { booking_id: bookingAId }, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert(qrCross.status === 403, 'POST /api/payments/qr with mismatched user returns 403');

    const qrOwner = await client.post('/api/payments/qr', { booking_id: bookingAId }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert(qrOwner.status === 200 && qrOwner.data.qr, 'POST /api/payments/qr with owner returns 200 and QR');

    // Reference Submission Authorization
    const refUnauth = await client.post('/api/verify-payment', {
      booking_id: bookingAId,
      payment_reference_id: `UPI${randA}TEST`
    });
    assert(refUnauth.status === 401, 'POST /api/verify-payment unauthenticated returns 401');

    const refCross = await client.post('/api/verify-payment', {
      booking_id: bookingAId,
      payment_reference_id: `UPI${randA}TEST`,
      customer_id: userBId
    }, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert(refCross.status === 403, 'POST /api/verify-payment with mismatched user returns 403');

    const refOwner = await client.post('/api/verify-payment', {
      booking_id: bookingAId,
      payment_reference_id: `UPI${randA}TEST`,
      customer_id: userAId
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert(refOwner.status === 200, 'POST /api/verify-payment with owner returns 200');

    // Payment Confirm Authorization
    const confirmUnauth = await client.post('/api/payment/confirm', { booking_id: bookingAId });
    assert(confirmUnauth.status === 401, 'POST /api/payment/confirm unauthenticated returns 401');
  }

  // 7. Cancellation Authorization
  console.log('\n[7] Testing Cancellation Ownership...');
  if (bookingAId) {
    const cancelUnauth = await client.post('/api/cancel-booking', {
      booking_id: bookingAId
    });
    assert(cancelUnauth.status === 401, 'POST /api/cancel-booking unauthenticated returns 401');

    const cancelCross = await client.post('/api/cancel-booking', {
      booking_id: bookingAId,
      customer_id: userBId
    }, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert(cancelCross.status === 403, 'POST /api/cancel-booking with mismatched user returns 403');

    const cancelOwner = await client.post('/api/cancel-booking', {
      booking_id: bookingAId,
      customer_id: userAId
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert(cancelOwner.status === 200, 'POST /api/cancel-booking with owner returns 200');
  }

  // 8. Admin Authorization
  console.log('\n[8] Testing Admin Authorization...');
  const adminUnauth = await client.get('/api/bookings/all');
  assert(adminUnauth.status === 401, 'GET /api/bookings/all unauthenticated returns 401');

  const jwt = require('jsonwebtoken');
  const adminToken = jwt.sign(
    { email: process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com' },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '2h' }
  );
  assert(Boolean(adminToken), 'Admin JWT generated with valid secret');
  
  if (adminToken) {
    const adminBookingsRes = await client.get('/api/bookings/all', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminBookingsRes.status === 200 && Array.isArray(adminBookingsRes.data), 'GET /api/bookings/all with admin token returns 200');
  }

  console.log('\n' + '='.repeat(70));
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    const check = await client.get('/health');
    if (check.status === 200) {
      await runTests();
      process.exit(0);
    }
  } catch (e) {
    // Server not running, launch it
  }

  console.log('Starting backend server for test execution...');
  require('./server.js');
  setTimeout(async () => {
    try {
      await runTests();
      process.exit(0);
    } catch (err) {
      console.error('Test execution error:', err);
      process.exit(1);
    }
  }, 3500);
}

main();
