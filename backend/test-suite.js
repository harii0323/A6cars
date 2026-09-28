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

  // Test admin login endpoint with wrong password
  const badLoginRes = await client.post('/api/admin/login', {
    email: process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com',
    password: 'wrong_password'
  });
  assert(badLoginRes.status === 401, 'POST /api/admin/login with wrong password returns 401');

  // Test admin login endpoint with correct credentials
  const adminLoginRes = await client.post('/api/admin/login', {
    email: process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com',
    password: process.env.ADMIN_PASS || 'Anu'
  });
  assert(adminLoginRes.status === 200 && adminLoginRes.data.token, 'POST /api/admin/login with valid credentials returns 200 and token');
  
  const adminToken = adminLoginRes.data?.token;
  if (adminToken) {
    const adminBookingsRes = await client.get('/api/bookings/all', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminBookingsRes.status === 200 && Array.isArray(adminBookingsRes.data), 'GET /api/bookings/all with returned admin token returns 200');
  }

  // 9. Testing Collection PIN Verification (AI Travel Planner Integration)
  console.log('\n[9] Testing AI Travel Planner Collection PIN Verification...');
  const futureYear = 2030 + Math.floor(Math.random() * 40);
  const bookCRes = await client.post('/api/book', {
    car_id: testCar ? testCar.id : 1,
    customer_id: userAId,
    start_date: `${futureYear}-06-10`,
    end_date: `${futureYear}-06-12`,
    payment_plan: 'full'
  }, {
    headers: { Authorization: `Bearer ${userAToken}` }
  });
  if (bookCRes.status !== 200) {
    console.error('bookCRes error:', bookCRes.status, bookCRes.data);
  }
  assert(bookCRes.status === 200 && bookCRes.data?.collection_pin, 'POST /api/book generates 4-digit Collection PIN');
  assert(bookCRes.data?.booking_reference, 'POST /api/book returns formatted Booking Reference (e.g. A6-2026-XX)');

  const bookingCId = bookCRes.data?.booking_id;
  const bookingCRef = bookCRes.data?.booking_reference;
  const collectionPin = bookCRes.data?.collection_pin;

  if (bookingCId && adminToken) {
    // Test verify-pin with non-existent booking ID returns 404
    const pinNotFound = await client.post('/api/admin/verify-pin', {
      booking_id: 'A6-2099-999999',
      collection_pin: '1234'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(pinNotFound.status === 404, 'POST /api/admin/verify-pin with non-existent booking ID returns 404');

    // Test verify-pin before payment is confirmed (unpaid) returns 409
    const pinUnpaid = await client.post('/api/admin/verify-pin', {
      booking_id: bookingCRef,
      collection_pin: collectionPin
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(pinUnpaid.status === 409, 'POST /api/admin/verify-pin on unpaid booking returns 409');

    // Confirm payment for booking C
    await client.post('/api/payment/confirm', {
      booking_id: bookingCId
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Test that customer booking view contains collection_pin and booking_reference
    const custBookingsRes = await client.get(`/api/mybookings/${userAId}`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const foundBookingC = (custBookingsRes.data || []).find(b => b.id === bookingCId);
    assert(foundBookingC && foundBookingC.collection_pin && foundBookingC.booking_reference, 'GET /api/mybookings/:id includes collection_pin and booking_reference');

    // Test that admin all bookings includes collection_pin and booking_reference
    const adminAllRes = await client.get('/api/bookings/all', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminFoundC = (adminAllRes.data || []).find(b => (b.id === bookingCId || b.booking_id === bookingCId));
    assert(adminFoundC && adminFoundC.collection_pin && adminFoundC.booking_reference, 'GET /api/bookings/all includes collection_pin and booking_reference');

    // Test verify-pin unauthenticated
    const pinUnauth = await client.post('/api/admin/verify-pin', {
      booking_id: bookingCRef,
      collection_pin: collectionPin
    });
    assert(pinUnauth.status === 401, 'POST /api/admin/verify-pin unauthenticated returns 401');

    // Test verify-pin with wrong PIN
    const pinWrong = await client.post('/api/admin/verify-pin', {
      booking_id: bookingCRef,
      collection_pin: '0000'
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(pinWrong.status === 401, 'POST /api/admin/verify-pin with wrong PIN returns 401');

    // Test verify-pin with correct PIN and formatted Booking Reference (A6-2026-XX)
    const pinSuccess = await client.post('/api/admin/verify-pin', {
      booking_id: bookingCRef,
      collection_pin: collectionPin
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(pinSuccess.status === 200 && pinSuccess.data.qr_verification?.booking?.collection_verified, 'POST /api/admin/verify-pin with valid PIN and Booking ID marks vehicle collected');

    // Test repeat verification
    const pinRepeat = await client.post('/api/admin/verify-pin', {
      booking_id: bookingCId,
      collection_pin: collectionPin
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // 10. Testing A6-20XX-XX and XX Booking ID Formats Across Endpoints
    console.log('\n[10] Testing A6-20XX-XX and XX Booking ID Formats Across Endpoints...');

    // GET /api/payment/status with formatted reference (A6-20XX-XX) and raw ID (XX)
    const statusByRef = await client.get(`/api/payment/status/${bookingCRef}`);
    assert(statusByRef.status === 200 && statusByRef.data.paid === true, 'GET /api/payment/status/:booking_id accepts A6-20XX-XX format');

    const statusById = await client.get(`/api/payment/status/${bookingCId}`);
    assert(statusById.status === 200 && statusById.data.paid === true, 'GET /api/payment/status/:booking_id accepts XX format');

    // Create booking D to test /api/payments/qr and /api/payment/confirm with formatted reference
    const futureYearD = 2075 + Math.floor(Math.random() * 20);
    const bookDRes = await client.post('/api/book', {
      car_id: testCar ? testCar.id : 1,
      customer_id: userAId,
      start_date: `${futureYearD}-01-10`,
      end_date: `${futureYearD}-01-12`,
      payment_plan: 'full'
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const bookingDId = bookDRes.data?.booking_id;
    const bookingDRef = bookDRes.data?.booking_reference;

    if (bookingDId && bookingDRef) {
      // POST /api/payments/qr with formatted reference A6-20XX-XX
      const qrByRef = await client.post('/api/payments/qr', {
        booking_id: bookingDRef
      }, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert(qrByRef.status === 200 && qrByRef.data.qr, 'POST /api/payments/qr accepts A6-20XX-XX format');

      // POST /api/payments/qr with raw numeric XX
      const qrById = await client.post('/api/payments/qr', {
        booking_id: bookingDId
      }, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert(qrById.status === 200 && qrById.data.qr, 'POST /api/payments/qr accepts XX format');

      // POST /api/payment/confirm with formatted reference A6-20XX-XX
      const confirmByRef = await client.post('/api/payment/confirm', {
        booking_id: bookingDRef
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(confirmByRef.status === 200, 'POST /api/payment/confirm accepts A6-20XX-XX format');
    }

    // Create booking E to test /api/verify-payment with formatted reference
    const futureYearE = 2075 + Math.floor(Math.random() * 20);
    const bookERes = await client.post('/api/book', {
      car_id: testCar ? testCar.id : 1,
      customer_id: userAId,
      start_date: `${futureYearE}-02-10`,
      end_date: `${futureYearE}-02-12`,
      payment_plan: 'full'
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const bookingEId = bookERes.data?.booking_id;
    const bookingERef = bookERes.data?.booking_reference;

    if (bookingEId && bookingERef) {
      const uniqueRef = `UPI-VERIFY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      // Customer submits payment reference with formatted Booking ID (A6-20XX-XX)
      const custSubmit = await client.post('/api/verify-payment', {
        booking_id: bookingERef,
        payment_reference_id: uniqueRef,
        customer_id: userAId
      }, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert(custSubmit.status === 200, 'POST /api/verify-payment customer submission accepts A6-20XX-XX format');

      // Admin matches and verifies payment with formatted Booking ID (A6-20XX-XX)
      const adminVerify = await client.post('/api/verify-payment', {
        booking_id: bookingERef,
        payment_reference_id: uniqueRef,
        admin_email: 'karikeharikrishna@gmail.com'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(adminVerify.status === 200, 'POST /api/verify-payment admin verification accepts A6-20XX-XX format');
    }

    // Create booking F to test /api/cancel-booking with formatted reference
    const futureYearF = 2075 + Math.floor(Math.random() * 20);
    const bookFRes = await client.post('/api/book', {
      car_id: testCar ? testCar.id : 1,
      customer_id: userAId,
      start_date: `${futureYearF}-03-10`,
      end_date: `${futureYearF}-03-12`,
      payment_plan: 'full'
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const bookingFId = bookFRes.data?.booking_id;
    const bookingFRef = bookFRes.data?.booking_reference;

    if (bookingFId && bookingFRef) {
      const cancelByRef = await client.post('/api/cancel-booking', {
        booking_id: bookingFRef,
        reason: 'Testing A6-20XX-XX format cancellation'
      }, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert(cancelByRef.status === 200, 'POST /api/cancel-booking accepts A6-20XX-XX format');
    }

    // Create booking G to test /api/admin/cancel-booking with formatted reference
    const futureYearG = 2075 + Math.floor(Math.random() * 20);
    const bookGRes = await client.post('/api/book', {
      car_id: testCar ? testCar.id : 1,
      customer_id: userAId,
      start_date: `${futureYearG}-04-10`,
      end_date: `${futureYearG}-04-12`,
      payment_plan: 'full'
    }, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const bookingGId = bookGRes.data?.booking_id;
    const bookingGRef = bookGRes.data?.booking_reference;

    if (bookingGId && bookingGRef) {
      const adminCancelByRef = await client.post('/api/admin/cancel-booking', {
        booking_id: bookingGRef,
        reason: 'Testing admin A6-20XX-XX format cancellation'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(adminCancelByRef.status === 200, 'POST /api/admin/cancel-booking accepts A6-20XX-XX format');
    }
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
  
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 600));
    try {
      const check = await client.get('/health');
      if (check.status === 200) {
        break;
      }
    } catch (e) {}
  }

  try {
    await runTests();
    process.exit(0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

main();
