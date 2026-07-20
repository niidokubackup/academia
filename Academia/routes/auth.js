const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function recordAttempt(identifier, ip, success) {
  db.prepare('INSERT INTO login_attempts (identifier, ip_address, success) VALUES (?, ?, ?)').run(identifier, ip, success ? 1 : 0);
  if (success) {
    db.prepare("DELETE FROM login_attempts WHERE identifier = ? AND success = 1").run(identifier);
  }
}

function getFailedAttempts(identifier) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE identifier = ? AND success = 0 AND attempted_at > datetime('now', ?)
  `).get(identifier, `-${LOCKOUT_MINUTES} minutes`);
  return row.count;
}

function isLockedOut(identifier) {
  return getFailedAttempts(identifier) >= MAX_ATTEMPTS;
}

function getLockoutRemaining(identifier) {
  const row = db.prepare(`
    SELECT MAX(attempted_at) as last_attempt FROM login_attempts
    WHERE identifier = ? AND success = 0
  `).get(identifier);
  if (!row.last_attempt) return 0;
  const lastAttempt = new Date(row.last_attempt + 'Z');
  const unlockTime = new Date(lastAttempt.getTime() + LOCKOUT_MINUTES * 60000);
  const remaining = Math.ceil((unlockTime - new Date()) / 60000);
  return remaining > 0 ? remaining : 0;
}

router.post('/register', (req, res) => {
  try {
    const { full_name, email, password, role, school, department, level, matric_number } = req.body;

    if (!full_name || !email || !password || !role || !school) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    if (role === 'student' && matric_number) {
      const existingMatric = db.prepare('SELECT id FROM users WHERE matric_number = ?').get(matric_number);
      if (existingMatric) return res.status(400).json({ error: 'Matric number already registered.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (full_name, email, password, role, school, department, level, matric_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(full_name, email, hashedPassword, role, school, department || null, level || null, matric_number || null);

    const token = jwt.sign(
      { id: result.lastInsertRowid, email, role, full_name, school },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'strict' });
    res.json({ message: 'Registration successful', token, user: { id: result.lastInsertRowid, full_name, email, role, school } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { identifier, password, loginType } = req.body;
    const email = req.body.email;

    const lookup = identifier || email;

    if (!lookup || !password) {
      return res.status(400).json({ error: 'Please enter your credentials.' });
    }

    const ip = req.ip || req.connection.remoteAddress;

    if (isLockedOut(lookup)) {
      const remaining = getLockoutRemaining(lookup);
      return res.status(429).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`,
        locked: true,
        remaining
      });
    }

    let user;
    if (loginType === 'student') {
      user = db.prepare('SELECT * FROM users WHERE (email = ? OR matric_number = ?) AND role = ?').get(lookup, lookup, 'student');
    } else {
      user = db.prepare('SELECT * FROM users WHERE email = ? AND role IN (?, ?)').get(lookup, 'lecturer', 'admin');
    }

    if (!user) {
      recordAttempt(lookup, ip, false);
      const remaining = MAX_ATTEMPTS - getFailedAttempts(lookup);
      return res.status(401).json({
        error: 'Invalid credentials. ' + (remaining > 0 ? `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Account locked.'),
        remaining
      });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      recordAttempt(lookup, ip, false);
      const remaining = MAX_ATTEMPTS - getFailedAttempts(lookup);
      return res.status(401).json({
        error: 'Invalid credentials. ' + (remaining > 0 ? `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Account locked.'),
        remaining
      });
    }

    recordAttempt(lookup, ip, true);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name, school: user.school },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'strict' });
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, school: user.school }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', (req, res) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, full_name, email, role, school, department, level, matric_number FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

module.exports = router;
