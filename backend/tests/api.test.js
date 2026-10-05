const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const pool = require('../src/db');

// Read schema.sql so test DB can auto-provision if needed
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

beforeAll(async () => {
  // Ensure tables and indexes exist in the test DB
  await pool.query(schemaSql);
});

beforeEach(async () => {
  // Reset all data between test runs
  await pool.query('TRUNCATE users, devices, sessions RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  // Close connection pool so Jest exits cleanly
  await pool.end();
});

describe('Authentication', () => {
  it('registers a user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('rejects duplicate email registration with 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice 2', email: 'alice@example.com', password: 'password456' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('logs in registered user and returns token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@example.com');
  });

  it('rejects invalid login credentials with 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid email or password');
  });
});

describe('Devices', () => {
  let token;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'password123' });

    token = loginRes.body.data.token;
  });

  it('registers a device and returns existing one idempotently', async () => {
    // First creation
    const res1 = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceName: 'Workstation', platform: 'win32' });

    expect(res1.status).toBe(201);
    expect(res1.body.data.created).toBe(true);
    const deviceId = res1.body.data.device.id;

    // Second call with same name: should return existing device
    const res2 = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceName: 'Workstation', platform: 'win32' });

    expect(res2.status).toBe(200);
    expect(res2.body.data.created).toBe(false);
    expect(res2.body.data.device.id).toBe(deviceId);
  });
});

describe('Sessions and Bulk Upload', () => {
  let token;
  let deviceId;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Charlie', email: 'charlie@example.com', password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'charlie@example.com', password: 'password123' });

    token = loginRes.body.data.token;

    const devRes = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceName: 'GamingPC', platform: 'win32' });

    deviceId = devRes.body.data.device.id;
  });

  it('uploads sessions and handles duplicates idempotently', async () => {
    const payload = {
      deviceId,
      sessions: [
        {
          clientSessionId: 'sess-1',
          appName: 'Google Chrome',
          appIdentifier: 'chrome.exe',
          startTime: '2026-10-03T10:00:00.000Z',
          endTime: '2026-10-03T11:00:00.000Z',
          durationSeconds: 3600,
        },
        {
          clientSessionId: 'sess-2',
          appName: 'VS Code',
          appIdentifier: 'code.exe',
          startTime: '2026-10-03T11:30:00.000Z',
          endTime: '2026-10-03T12:00:00.000Z',
          durationSeconds: 1800,
        },
      ],
    };

    // First upload: 2 inserted, 0 skipped
    const res1 = await request(app)
      .post('/api/sessions/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.data.total).toBe(2);
    expect(res1.body.data.inserted).toBe(2);
    expect(res1.body.data.skipped).toBe(0);

    // Duplicate upload: 0 inserted, 2 skipped
    const res2 = await request(app)
      .post('/api/sessions/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.data.inserted).toBe(0);
    expect(res2.body.data.skipped).toBe(2);
  });

  it('rejects upload for a device that does not belong to user', async () => {
    const res = await request(app)
      .post('/api/sessions/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 99999,
        sessions: [
          {
            clientSessionId: 'sess-err',
            appName: 'Chrome',
            appIdentifier: 'chrome.exe',
            startTime: '2026-10-03T10:00:00.000Z',
            endTime: '2026-10-03T11:00:00.000Z',
            durationSeconds: 3600,
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('Statistics and Timeline', () => {
  let token;
  let deviceId;

  beforeEach(async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dana', email: 'dana@example.com', password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dana@example.com', password: 'password123' });

    token = loginRes.body.data.token;

    const devRes = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceName: 'Laptop', platform: 'win32' });

    deviceId = devRes.body.data.device.id;

    // Seed known sessions for 2026-10-03 and 2026-10-05 (leave 2026-10-04 empty)
    await request(app)
      .post('/api/sessions/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        sessions: [
          // 2026-10-03 in Asia/Kolkata
          {
            clientSessionId: 'stat-1',
            appName: 'Chrome',
            appIdentifier: 'chrome.exe',
            startTime: '2026-10-03T04:30:00.000Z', // 10:00 IST
            endTime: '2026-10-03T05:30:00.000Z',
            durationSeconds: 3600,
          },
          {
            clientSessionId: 'stat-2',
            appName: 'VS Code',
            appIdentifier: 'code.exe',
            startTime: '2026-10-03T06:00:00.000Z', // 11:30 IST
            endTime: '2026-10-03T06:30:00.000Z',
            durationSeconds: 1800,
          },
          // 2026-10-05 in Asia/Kolkata
          {
            clientSessionId: 'stat-3',
            appName: 'Chrome',
            appIdentifier: 'chrome.exe',
            startTime: '2026-10-05T03:30:00.000Z', // 09:00 IST
            endTime: '2026-10-05T04:30:00.000Z',
            durationSeconds: 3600,
          },
        ],
      });
  });

  it('returns daily stats with gapless days', async () => {
    const res = await request(app)
      .get('/api/stats/daily?from=2026-10-03&to=2026-10-05&tz=Asia/Kolkata')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.length).toBe(3);

    // 2026-10-03: 3600 + 1800 = 5400
    expect(data[0].duration).toBe(5400);

    // 2026-10-04: Gap day must exist with 0
    expect(data[1].duration).toBe(0);

    // 2026-10-05: 3600
    expect(data[2].duration).toBe(3600);
  });

  it('returns app stats sorted descending by duration', async () => {
    const res = await request(app)
      .get('/api/stats/apps?date=2026-10-03&tz=Asia/Kolkata')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const apps = res.body.data;
    expect(apps.length).toBe(2);
    expect(apps[0]).toEqual({ name: 'Chrome', duration: 3600 });
    expect(apps[1]).toEqual({ name: 'VS Code', duration: 1800 });
  });

  it('returns list of sessions for a date ordered by start time', async () => {
    const res = await request(app)
      .get('/api/sessions?date=2026-10-03&tz=Asia/Kolkata')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const sessions = res.body.data;
    expect(sessions.length).toBe(2);
    expect(sessions[0].app_name).toBe('Chrome');
    expect(sessions[1].app_name).toBe('VS Code');
  });
});
