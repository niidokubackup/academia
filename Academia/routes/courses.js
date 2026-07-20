const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

router.get('/', (req, res) => {
  try {
    const { level, semester, school, search } = req.query;
    let query = 'SELECT c.*, u.full_name as lecturer_name FROM courses c LEFT JOIN users u ON u.id = c.lecturer_id WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += " AND c.status = 'published'";
      const student = db.prepare('SELECT school, level FROM users WHERE id = ?').get(req.user.id);
      if (student) {
        if (student.school) { query += ' AND (c.school = ? OR c.school IS NULL)'; params.push(student.school); }
        if (student.level) { query += ' AND c.level = ?'; params.push(student.level); }
      }
    } else if (req.user.role === 'lecturer') {
      query += ' AND c.lecturer_id = ?';
      params.push(req.user.id);
    }
    // admin sees all via /api/admin/courses

    if (level) { query += ' AND c.level = ?'; params.push(level); }
    if (semester) { query += ' AND c.semester = ?'; params.push(semester); }
    if (school) { query += ' AND c.school = ?'; params.push(school); }
    if (search) { query += ' AND (c.code LIKE ? OR c.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const courses = db.prepare(query).all(...params);

    if (req.user.role === 'student') {
      const enrollments = db.prepare('SELECT course_id FROM enrollments WHERE student_id = ?').all(req.user.id);
      const enrolledIds = new Set(enrollments.map(e => e.course_id));
      courses.forEach(c => { c.enrolled = enrolledIds.has(c.id); });
    }

    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/materials', (req, res) => {
  try {
    const materials = db.prepare(`
      SELECT m.*, u.full_name as uploaded_by_name
      FROM materials m JOIN users u ON u.id = m.uploaded_by
      WHERE m.course_id = ? ORDER BY m.created_at DESC
    `).all(req.params.id);
    res.json(materials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/browse', (req, res) => {
  try {
    const { level, semester, category, search } = req.query;
    let query = 'SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploaded_by_name FROM materials m JOIN courses c ON c.id = m.course_id JOIN users u ON u.id = m.uploaded_by WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += ' AND c.school = ?';
      params.push(req.user.school);
      const studentLevel = db.prepare('SELECT level FROM users WHERE id = ?').get(req.user.id);
      if (studentLevel && studentLevel.level) {
        query += ' AND c.level = ?';
        params.push(studentLevel.level);
      }
    }

    if (level) { query += ' AND c.level = ?'; params.push(level); }
    if (semester) { query += ' AND c.semester = ?'; params.push(semester); }
    if (category) { query += ' AND m.category = ?'; params.push(category); }
    if (search) { query += ' AND (m.title LIKE ? OR c.code LIKE ? OR c.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    query += ' ORDER BY m.created_at DESC';
    const materials = db.prepare(query).all(...params);
    res.json(materials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), upload.single('file'), (req, res) => {
  try {
    const { course_id, title, description, level, semester, academic_year, category } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const fileType = req.file ? req.file.mimetype : null;

    const result = db.prepare(
      'INSERT INTO materials (course_id, title, description, file_path, file_type, uploaded_by, level, semester, academic_year, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(course_id, title, description, filePath, fileType, req.user.id, level, semester, academic_year, category || 'other');

    res.json({ message: 'Material uploaded successfully', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/enroll', authorizeRoles('student'), (req, res) => {
  try {
    const { course_id } = req.body;
    const course = db.prepare("SELECT id, status FROM courses WHERE id = ?").get(course_id);
    if (!course || course.status !== 'published') {
      return res.status(400).json({ error: 'Course is not available for registration.' });
    }
    db.prepare('INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)').run(req.user.id, course_id);
    res.json({ message: 'Enrolled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unenroll', authorizeRoles('student'), (req, res) => {
  try {
    const { course_id } = req.body;
    db.prepare('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?').run(req.user.id, course_id);
    res.json({ message: 'Unenrolled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/enrolled', authorizeRoles('student'), (req, res) => {
  try {
    const courses = db.prepare(`
      SELECT c.*, u.full_name as lecturer_name FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      LEFT JOIN users u ON u.id = c.lecturer_id
      WHERE e.student_id = ?
    `).all(req.user.id);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
