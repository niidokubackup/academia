const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, 'sub-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', (req, res) => {
  try {
    let query, params = [];

    if (req.user.role === 'student') {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        (SELECT id FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submitted,
        (SELECT grade FROM submissions WHERE assignment_id = a.id AND student_id = ?) as my_grade
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ?
        ORDER BY a.due_date ASC
      `;
      params = [req.user.id, req.user.id, req.user.id];
    } else if (req.user.role === 'lecturer') {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submission_count,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id AND grade IS NOT NULL) as graded_count
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.created_by = ?
        ORDER BY a.created_at DESC
      `;
      params = [req.user.id];
    } else {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        u.full_name as created_by_name
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        JOIN users u ON u.id = a.created_by
        ORDER BY a.created_at DESC
      `;
    }

    const assignments = db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/midsems', (req, res) => {
  try {
    let query, params = [];

    if (req.user.role === 'student') {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        JOIN enrollments e ON e.course_id = m.course_id AND e.student_id = ?
        ORDER BY m.exam_date ASC
      `;
      params = [req.user.id];
    } else if (req.user.role === 'lecturer') {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        WHERE m.created_by = ?
        ORDER BY m.created_at DESC
      `;
      params = [req.user.id];
    } else {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as created_by_name
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        JOIN users u ON u.id = m.created_by
        ORDER BY m.exam_date ASC
      `;
    }

    const exams = db.prepare(query).all(...params);
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), upload.single('attachment'), (req, res) => {
  try {
    const { course_id, title, description, due_date, total_marks } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db.prepare(
      'INSERT INTO assignments (course_id, title, description, due_date, total_marks, attachment_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(course_id, title, description, due_date, total_marks || 100, filePath, req.user.id);

    res.json({ message: 'Assignment created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/midsem', authorizeRoles('lecturer', 'admin'), (req, res) => {
  try {
    const { course_id, title, description, exam_date, duration_minutes, total_marks, venue, instructions } = req.body;

    const result = db.prepare(
      'INSERT INTO midsem_exams (course_id, title, description, exam_date, duration_minutes, total_marks, venue, instructions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(course_id, title, description, exam_date, duration_minutes || 60, total_marks || 50, venue, instructions, req.user.id);

    res.json({ message: 'Mid-sem exam created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/submit/:assignmentId', authorizeRoles('student'), upload.single('file'), (req, res) => {
  try {
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const { notes } = req.body;

    const existing = db.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(req.params.assignmentId, req.user.id);
    if (existing) return res.status(400).json({ error: 'Already submitted.' });

    db.prepare(
      'INSERT INTO submissions (assignment_id, student_id, file_path, notes) VALUES (?, ?, ?, ?)'
    ).run(req.params.assignmentId, req.user.id, filePath, notes);

    res.json({ message: 'Assignment submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/submissions/:assignmentId', authorizeRoles('lecturer', 'admin'), (req, res) => {
  try {
    const submissions = db.prepare(`
      SELECT s.*, u.full_name, u.matric_number, u.email
      FROM submissions s JOIN users u ON u.id = s.student_id
      WHERE s.assignment_id = ?
    `).all(req.params.assignmentId);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/grade/:submissionId', authorizeRoles('lecturer', 'admin'), (req, res) => {
  try {
    const { grade, feedback } = req.body;
    db.prepare('UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?').run(grade, feedback, req.params.submissionId);
    res.json({ message: 'Graded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
