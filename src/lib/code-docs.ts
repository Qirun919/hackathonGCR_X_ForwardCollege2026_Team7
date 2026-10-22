export type CodeRole = "route" | "controller" | "service" | "model" | "middleware" | "other";

export type CodeFile = {
  id: string;
  name: string;
  role: CodeRole;
  content: string;
};

export const CODE_ROLES: CodeRole[] = ["route", "controller", "service", "model", "middleware", "other"];

export const MAX_FILES = 8;
export const MAX_FILE_CHARS = 15000;
export const MAX_TOTAL_CHARS = 40000;

const ACCOUNT_ROUTES = `const express = require('express');
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const accountController = require('../controllers/accountController');

const router = express.Router();

router.get('/:id', param('id').isMongoId(), accountController.getAccount);
router.put(
  '/:id/tier',
  auth,
  param('id').isMongoId(),
  body('tier').isIn(['standard', 'premium', 'enterprise']),
  accountController.updateTier
);

module.exports = router;`;

const ACCOUNT_CONTROLLER = `const { body, validationResult } = require('express-validator');
const accountService = require('../services/accountService');

async function getAccount(req, res, next) {
  try {
    const account = await accountService.getAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) { next(err); }
}

async function updateTier(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const account = await accountService.updateAccountTier(req.params.id, req.body.tier);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) { next(err); }
}

module.exports = { getAccount, updateTier };`;

const ACCOUNT_SERVICE = `const Account = require('../models/Account');

async function getAccountById(accountId) {
  return Account.findById(accountId);
}

async function updateAccountTier(accountId, tier) {
  if (!['standard', 'premium', 'enterprise'].includes(tier)) {
    throw new Error('Invalid tier');
  }
  return Account.findByIdAndUpdate(accountId, { tier }, { new: true });
}

module.exports = { getAccountById, updateAccountTier };`;

const ACCOUNT_MODEL = `const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tier: { type: String, enum: ['standard', 'premium', 'enterprise'], default: 'standard' },
    creditLimit: { type: Number, min: 0 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);`;

const ACCOUNT_AUTH = `const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};`;

export type DemoProject = {
  id: string;
  label: string;
  projectName: string;
  description: string;
  files: CodeFile[];
};

function f(id: string, name: string, role: CodeRole, content: string): CodeFile {
  return { id, name, role, content };
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "account-complete",
    label: "Account API (complete: routes + controller + service + model + auth)",
    projectName: "account-api",
    description: "Full tier-update flow: auth, validation, service call, DB update, success/failure responses.",
    files: [
      f("demo-routes", "routes/accountRoutes.js", "route", ACCOUNT_ROUTES),
      f("demo-controller", "controllers/accountController.js", "controller", ACCOUNT_CONTROLLER),
      f("demo-service", "services/accountService.js", "service", ACCOUNT_SERVICE),
      f("demo-model", "models/Account.js", "model", ACCOUNT_MODEL),
      f("demo-auth", "middleware/auth.js", "middleware", ACCOUNT_AUTH),
    ],
  },
  {
    id: "account-service-only",
    label: "Account service only (incomplete context demo)",
    projectName: "account-api",
    description: "Only the service file — expect component-level docs, no invented route, plus recommendations.",
    files: [f("demo-service-only", "services/accountService.js", "service", ACCOUNT_SERVICE)],
  },
];

export function demoProject(id: string): DemoProject {
  return DEMO_PROJECTS.find((p) => p.id === id) ?? DEMO_PROJECTS[0];
}

export function sampleFiles(): CodeFile[] {
  return demoProject("account-complete").files.map((x) => ({ ...x }));
}

export function newFileId(): string {
  return `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
