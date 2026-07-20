const express = require('express');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { month, year, status: statusFilter } = req.query;
    let query = 'SELECT ce.*, c.code as course_code, u.full_name as created_by_name FROM calendar_events ce LEFT JOIN courses c ON c.id = ce.course_id JOIN users u ON u.id = ce.created_by WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += " AND ce.status = 'approved' AND (ce.school = ? OR ce.school IS NULL)";
      params.push(req.user.school);
    } else if (req.user.role === 'lecturer') {
      query += ' AND ce.created_by = ?';
      params.push(req.user.id);
      if (statusFilter) { query += ' AND ce.status = ?'; params.push(statusFilter); }
    }
    // admin uses /api/admin/events

    if (month && year) {
      query += " AND strftime('%m', ce.event_date) = ? AND strftime('%Y', ce.event_date) = ?";
      params.push(String(month).padStart(2, '0'), String(year));
    }

    query += ' ORDER BY ce.event_date ASC';
    const events = db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), (req, res) => {
  try {
    const { title, description, event_date, end_date, event_type, course_id, school } = req.body;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    const result = db.prepare(
      'INSERT INTO calendar_events (title, description, event_date, end_date, event_type, course_id, school, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(title, description, event_date, end_date, event_type, course_id || null, school || req.user.school, req.user.id, status);

    res.json({ message: status === 'pending' ? 'Event submitted (pending approval)' : 'Event created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorizeRoles('admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
