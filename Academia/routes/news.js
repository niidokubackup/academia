const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, 'news-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

router.get('/', (req, res) => {
  try {
    const { category, search, status: statusFilter } = req.query;
    let query = 'SELECT n.*, u.full_name as author FROM news n JOIN users u ON u.id = n.published_by WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += " AND n.status = 'approved' AND (n.school = ? OR n.school IS NULL)";
      params.push(req.user.school);
    } else if (req.user.role === 'lecturer') {
      query += ' AND n.published_by = ?';
      params.push(req.user.id);
      if (statusFilter) { query += ' AND n.status = ?'; params.push(statusFilter); }
    }
    // admin uses /api/admin/news

    if (category) { query += ' AND n.category = ?'; params.push(category); }
    if (search) { query += ' AND (n.title LIKE ? OR n.content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY n.is_pinned DESC, n.created_at DESC';
    const news = db.prepare(query).all(...params);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const article = db.prepare(`
      SELECT n.*, u.full_name as author FROM news n
      JOIN users u ON u.id = n.published_by WHERE n.id = ?
    `).get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), upload.single('image'), (req, res) => {
  try {
    const { title, content, category, school, is_pinned } = req.body;
    const safeTitle = sanitizeText(title);
    const safeContent = sanitizeText(content);
    const safeCategory = normalizeText(category) || 'announcement';
    const safeSchool = sanitizeText(school) || null;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    if (!safeTitle || !safeContent) return res.status(400).json({ error: 'News title and content are required.' });
    if (!['announcement', 'event', 'update', 'urgent'].includes(safeCategory)) return res.status(400).json({ error: 'Invalid news category.' });

    const result = db.prepare(
      'INSERT INTO news (title, content, category, school, image_path, published_by, status, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(safeTitle, safeContent, safeCategory, safeSchool, imagePath, req.user.id, status, is_pinned ? 1 : 0);

    logAudit('create_news', { title: safeTitle, category: safeCategory }, req.user.id);
    res.json({ message: status === 'pending' ? 'News submitted (pending approval)' : 'News published', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to publish news');
  }
});

router.delete('/:id', authorizeRoles('admin'), (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid article id.' });
    db.prepare('DELETE FROM news WHERE id = ?').run(newsId);
    logAudit('delete_news', { newsId }, req.user.id);
    res.json({ message: 'Article deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete article');
  }
});

module.exports = router;
