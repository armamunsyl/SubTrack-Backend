const express = require('express');
const Account = require('../models/Account');
const verifyJWT = require('../middleware/auth');

const router = express.Router();

router.use(verifyJWT);

// GET /api/accounts
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', async (req, res) => {
  try {
    const { status, service, search, expiringSoon } = req.query;
    const filter = { createdBy: req.user.uid };

    if (status) filter.status = status;
    if (service) filter.service = new RegExp(escapeRegex(service), 'i');
    if (search) {
      const q = escapeRegex(search);
      filter.$or = [
        { email: new RegExp(q, 'i') },
        { service: new RegExp(q, 'i') },
        { notes: new RegExp(q, 'i') },
      ];
    }
    if (expiringSoon === 'true') {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      filter.validityDate = { $lte: sevenDaysFromNow, $gte: new Date() };
      filter.status = 'active';
    }

    // Auto-expire accounts + members
    const accounts = await Account.find({ createdBy: req.user.uid, status: 'active' });
    for (const acc of accounts) {
      let dirty = false;
      if (acc.validityDate < new Date()) { acc.status = 'expired'; dirty = true; }
      acc.members.forEach((m) => {
        if (m.status === 'active' && m.endDate < new Date()) { m.status = 'expired'; dirty = true; }
      });
      if (dirty) await acc.save();
    }

    const result = await Account.find(filter).sort({ validityDate: 1 });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, createdBy: req.user.uid });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    // Trigger auto-expire via save
    await account.save();
    res.json(account);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/accounts
router.post('/', async (req, res) => {
  try {
    const account = new Account({
      ...req.body,
      addedAt: req.body.addedAt || new Date(),
      createdBy: req.user.uid,
    });
    await account.save();
    res.status(201).json(account);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This email already exists in your accounts' });
    }
    res.status(400).json({ message: error.message });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  try {
    // Don't overwrite members via PUT — members are managed separately
    const { members, createdAt, updatedAt, ...rest } = req.body;
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.uid },
      rest,
      { new: true, runValidators: true }
    );
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PATCH /api/accounts/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'expired', 'suspended', 'disabled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.uid },
      { status },
      { new: true }
    );
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const account = await Account.findOneAndDelete({ _id: req.params.id, createdBy: req.user.uid });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({ message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Member management ─────────────────────────────────────────────

// POST /api/accounts/:id/members — add a member
router.post('/:id/members', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, createdBy: req.user.uid });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Trigger auto-expire first
    account.members.forEach((m) => {
      if (m.status === 'active' && m.endDate < new Date()) m.status = 'expired';
    });

    const activeCount = account.members.filter((m) => m.status === 'active').length;
    if (activeCount >= account.totalSlots) {
      return res.status(400).json({ message: 'No free slots available' });
    }

    const { email, startDate, durationDays, notes } = req.body;
    if (!email || !durationDays) {
      return res.status(400).json({ message: 'Email and duration are required' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + Number(durationDays));

    account.members.push({ email, startDate: start, durationDays: Number(durationDays), endDate, notes });
    await account.save();
    res.status(201).json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/accounts/:id/members/:memberId — remove a member
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, createdBy: req.user.uid });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const before = account.members.length;
    account.members = account.members.filter(
      (m) => m._id.toString() !== req.params.memberId
    );
    if (account.members.length === before) {
      return res.status(404).json({ message: 'Member not found' });
    }

    await account.save();
    res.json(account);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/accounts/:id/members/:memberId — update member (extend duration etc.)
router.patch('/:id/members/:memberId', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, createdBy: req.user.uid });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const member = account.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    const { durationDays, notes, status } = req.body;
    if (durationDays) {
      member.durationDays = Number(durationDays);
      member.endDate = new Date(new Date(member.startDate).getTime() + Number(durationDays) * 86400000);
      member.status = member.endDate > new Date() ? 'active' : 'expired';
    }
    if (notes !== undefined) member.notes = notes;
    if (status) member.status = status;

    await account.save();
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
