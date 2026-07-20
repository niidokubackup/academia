const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');

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
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    const result = db.prepare(
      'INSERT INTO news (title, content, category, school, image_path, published_by, status, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(title, content, category || 'announcement', school || null, imagePath, req.user.id, status, is_pinned ? 1 : 0);

    res.json({ message: status === 'pending' ? 'News submitted (pending approval)' : 'News published', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorizeRoles('admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
