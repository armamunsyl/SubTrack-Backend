const express = require('express');
const Account = require('../models/Account');
const verifyJWT = require('../middleware/auth');

const router = express.Router();

router.use(verifyJWT);

// GET /api/analytics/summary
router.get('/summary', async (req, res) => {
  try {
    const uid = req.user.uid;
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);

    await Account.updateMany(
      { createdBy: uid, status: 'active', validityDate: { $lt: now } },
      { $set: { status: 'expired' } }
    );

    const [total, active, expired, suspended, disabled, expiringSoon] = await Promise.all([
      Account.countDocuments({ createdBy: uid }),
      Account.countDocuments({ createdBy: uid, status: 'active' }),
      Account.countDocuments({ createdBy: uid, status: 'expired' }),
      Account.countDocuments({ createdBy: uid, status: 'suspended' }),
      Account.countDocuments({ createdBy: uid, status: 'disabled' }),
      Account.countDocuments({
        createdBy: uid,
        status: 'active',
        validityDate: { $lte: sevenDaysFromNow, $gte: now },
      }),
    ]);

    res.json({ total, active, expired, suspended, disabled, expiringSoon });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/analytics/monthly
router.get('/monthly', async (req, res) => {
  try {
    const uid = req.user.uid;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        label: date.toLocaleString('default', { month: 'short', year: '2-digit' }),
      });
    }

    const results = await Promise.all(
      months.map(async ({ year, month, label }) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);

        const active = await Account.countDocuments({
          createdBy: uid,
          status: { $in: ['active', 'expired'] },
          createdAt: { $lte: end },
          validityDate: { $gte: start },
        });

        return { label, active };
      })
    );

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/analytics/expiring
router.get('/expiring', async (req, res) => {
  try {
    const uid = req.user.uid;
    const days = parseInt(req.query.days) || 7;
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    const accounts = await Account.find({
      createdBy: uid,
      status: 'active',
      validityDate: { $gte: now, $lte: future },
    }).sort({ validityDate: 1 });

    res.json(accounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/analytics/services
router.get('/services', async (req, res) => {
  try {
    const result = await Account.aggregate([
      { $match: { createdBy: req.user.uid } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/analytics/expiring-members?days=0
router.get('/expiring-members', async (req, res) => {
  try {
    const uid = req.user.uid;
    const days = parseInt(req.query.days) || 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    future.setHours(23, 59, 59, 999);

    const accounts = await Account.find({
      createdBy: uid,
      service: 'Google AI Pro',
      members: { $elemMatch: { status: 'active', endDate: { $gte: now, $lte: future } } },
    });

    const result = [];
    for (const acc of accounts) {
      for (const m of acc.members) {
        const mEnd = new Date(m.endDate);
        if (m.status === 'active' && mEnd >= now && mEnd <= future) {
          result.push({
            accountId: acc._id,
            accountEmail: acc.email,
            memberId: m._id,
            memberEmail: m.email,
            endDate: m.endDate,
          });
        }
      }
    }
    result.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
