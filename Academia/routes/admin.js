const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  validateEmail,
  validatePassword,
  validateRole,
  validateCourseLevel,
  validateSemester,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, 'course-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

router.get('/users', authorizeRoles('admin'), (req, res) => {
  try {
    const users = db.prepare('SELECT id, full_name, email, role, school, department, level, matric_number, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    handleDbError(res, err, 'Unable to load users');
  }
});

router.post('/users', authorizeRoles('admin'), (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { full_name, email, password, role, school, department, level, matric_number } = req.body;
    const safeFullName = sanitizeText(full_name);
    const safeEmail = normalizeText(email).toLowerCase();
    const safeRole = normalizeText(role);
    const safeSchool = sanitizeText(school);

    if (!safeFullName || !safeEmail || !password || !safeRole || !safeSchool) {
      return res.status(400).json({ error: 'All required user fields must be provided.' });
    }
    if (!validateEmail(safeEmail)) return res.status(400).json({ error: 'Please provide a valid email address.' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase letters and numbers.' });
    if (!validateRole(safeRole)) return res.status(400).json({ error: 'Invalid role selected.' });

    const hashedPassword = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      'INSERT INTO users (full_name, email, password, role, school, department, level, matric_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(safeFullName, safeEmail, hashedPassword, safeRole, safeSchool, sanitizeText(department) || null, normalizeText(level) || null, sanitizeText(matric_number) || null);
    logAudit('admin_create_user', { email: safeEmail, role: safeRole }, req.user.id);
    res.json({ message: 'User created', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create user');
  }
});

router.delete('/users/:id', authorizeRoles('admin'), (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id.' });
    db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(userId, 'admin');
    logAudit('admin_delete_user', { targetUserId: userId }, req.user.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete user');
  }
});

router.get('/courses', authorizeRoles('admin'), (req, res) => {
  try {
    const { status, semester, academic_year } = req.query;
    let query = `SELECT c.*, u.full_name as lecturer_name,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrolled_count
      FROM courses c LEFT JOIN users u ON u.id = c.lecturer_id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND c.status = ?'; params.push(status); }
    if (semester) { query += ' AND c.semester = ?'; params.push(semester); }
    if (academic_year) { query += ' AND c.academic_year = ?'; params.push(academic_year); }
    query += ' ORDER BY c.status, c.level, c.code';
    const courses = db.prepare(query).all(...params);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/courses', authorizeRoles('admin', 'lecturer'), (req, res) => {
  try {
    const { code, title, description, level, school, department, semester, academic_year, lecturer_id } = req.body;
    const safeCode = normalizeText(code).toUpperCase();
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeLevel = normalizeText(level);
    const safeSchool = sanitizeText(school);
    const safeDepartment = sanitizeText(department);
    const safeSemester = normalizeText(semester);
    const safeAcademicYear = normalizeText(academic_year) || '2025/2026';
    const lid = req.user.role === 'admin' ? (Number(lecturer_id) || req.user.id) : req.user.id;
    const status = req.user.role === 'admin' ? 'published' : 'draft';

    if (!safeCode || !safeTitle || !safeLevel || !safeSchool || !safeSemester) {
      return res.status(400).json({ error: 'Course code, title, level, school, and semester are required.' });
    }
    if (!validateCourseLevel(safeLevel)) return res.status(400).json({ error: 'Invalid course level.' });
    if (!validateSemester(safeSemester)) return res.status(400).json({ error: 'Invalid semester.' });

    const result = db.prepare(
      'INSERT INTO courses (code, title, description, level, school, department, semester, academic_year, status, lecturer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(safeCode, safeTitle, safeDescription, safeLevel, safeSchool, safeDepartment || null, safeSemester, safeAcademicYear, status, lid);

    logAudit('admin_create_course', { id: result.lastInsertRowid, code: safeCode }, req.user.id);
    res.json({ message: req.user.role === 'admin' ? 'Course created and published' : 'Course created (pending approval)', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create course');
  }
});

router.put('/courses/:id/publish', authorizeRoles('admin'), (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    db.prepare("UPDATE courses SET status = 'published' WHERE id = ?").run(courseId);
    logAudit('admin_publish_course', { courseId }, req.user.id);
    res.json({ message: 'Course published' });
  } catch (err) {
    handleDbError(res, err, 'Unable to publish course');
  }
});

router.put('/courses/:id/unpublish', authorizeRoles('admin'), (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    db.prepare("UPDATE courses SET status = 'draft' WHERE id = ?").run(courseId);
    logAudit('admin_unpublish_course', { courseId }, req.user.id);
    res.json({ message: 'Course unpublished' });
  } catch (err) {
    handleDbError(res, err, 'Unable to unpublish course');
  }
});

router.put('/courses/:id/delete', authorizeRoles('admin'), (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
    logAudit('admin_delete_course', { courseId }, req.user.id);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete course');
  }
});

router.delete('/courses/:id', authorizeRoles('admin'), (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
    logAudit('admin_delete_course', { courseId }, req.user.id);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete course');
  }
});

// News approval
router.get('/news', authorizeRoles('admin'), (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT n.*, u.full_name as author FROM news n JOIN users u ON u.id = n.published_by WHERE 1=1';
    const params = [];
    if (status) { query += ' AND n.status = ?'; params.push(status); }
    query += ' ORDER BY n.created_at DESC';
    const news = db.prepare(query).all(...params);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/news/:id/approve', authorizeRoles('admin'), (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid news id.' });
    db.prepare("UPDATE news SET status = 'approved' WHERE id = ?").run(newsId);
    logAudit('admin_approve_news', { newsId }, req.user.id);
    res.json({ message: 'News approved' });
  } catch (err) {
    handleDbError(res, err, 'Unable to approve news');
  }
});

router.put('/news/:id/reject', authorizeRoles('admin'), (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid news id.' });
    db.prepare("UPDATE news SET status = 'rejected' WHERE id = ?").run(newsId);
    logAudit('admin_reject_news', { newsId }, req.user.id);
    res.json({ message: 'News rejected' });
  } catch (err) {
    handleDbError(res, err, 'Unable to reject news');
  }
});

// Calendar event approval
router.get('/events', authorizeRoles('admin'), (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT ce.*, c.code as course_code, u.full_name as created_by_name FROM calendar_events ce LEFT JOIN courses c ON c.id = ce.course_id JOIN users u ON u.id = ce.created_by WHERE 1=1';
    const params = [];
    if (status) { query += ' AND ce.status = ?'; params.push(status); }
    query += ' ORDER BY ce.event_date DESC';
    const events = db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/events/:id/approve', authorizeRoles('admin'), (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: 'Invalid event id.' });
    db.prepare("UPDATE calendar_events SET status = 'approved' WHERE id = ?").run(eventId);
    logAudit('admin_approve_event', { eventId }, req.user.id);
    res.json({ message: 'Event approved' });
  } catch (err) {
    handleDbError(res, err, 'Unable to approve event');
  }
});

router.put('/events/:id/reject', authorizeRoles('admin'), (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: 'Invalid event id.' });
    db.prepare("UPDATE calendar_events SET status = 'rejected' WHERE id = ?").run(eventId);
    logAudit('admin_reject_event', { eventId }, req.user.id);
    res.json({ message: 'Event rejected' });
  } catch (err) {
    handleDbError(res, err, 'Unable to reject event');
  }
});

router.get('/stats', authorizeRoles('admin'), (req, res) => {
  try {
    const students = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get();
    const lecturers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'").get();
    const totalCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get();
    const draftCourses = db.prepare("SELECT COUNT(*) as count FROM courses WHERE status = 'draft'").get();
    const publishedCourses = db.prepare("SELECT COUNT(*) as count FROM courses WHERE status = 'published'").get();
    const materials = db.prepare('SELECT COUNT(*) as count FROM materials').get();
    const pendingNews = db.prepare("SELECT COUNT(*) as count FROM news WHERE status = 'pending'").get();
    const pendingEvents = db.prepare("SELECT COUNT(*) as count FROM calendar_events WHERE status = 'pending'").get();

    res.json({
      total_students: students.count,
      total_lecturers: lecturers.count,
      total_courses: totalCourses.count,
      draft_courses: draftCourses.count,
      published_courses: publishedCourses.count,
      total_materials: materials.count,
      pending_news: pendingNews.count,
      pending_events: pendingEvents.count
    });
  } catch (err) {
    handleDbError(res, err, 'Unable to load admin statistics');
  }
});

module.exports = router;
