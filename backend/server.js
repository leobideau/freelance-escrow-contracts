const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.BACKEND_HOST || "127.0.0.1";
const PORT = Number(process.env.BACKEND_PORT || 8787);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const DEPLOYMENT_FILE = path.join(__dirname, "..", "deployments", "sepolia.json");

const defaultDb = {
  users: [],
  projects: [],
  activityLogs: [],
};

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultDb, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    };
  } catch (_error) {
    return structuredClone(defaultDb);
  }
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function readDeployment() {
  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
  } catch (_error) {
    return {};
  }
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function listProjects(db, searchParams) {
  const wallet = normalizeAddress(searchParams.get("wallet"));
  const onChainProjectId = searchParams.get("onChainProjectId");

  let projects = [...db.projects];
  if (wallet) {
    projects = projects.filter(
      (project) =>
        normalizeAddress(project.clientAddress) === wallet ||
        normalizeAddress(project.freelancerAddress) === wallet,
    );
  }

  if (onChainProjectId !== null) {
    projects = projects.filter((project) => String(project.onChainProjectId) === onChainProjectId);
  }

  projects.sort((a, b) => Number(b.onChainProjectId) - Number(a.onChainProjectId));
  return projects;
}

function listActivity(db, searchParams) {
  const wallet = normalizeAddress(searchParams.get("wallet"));
  const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 10)));

  let activity = [...db.activityLogs];
  if (wallet) {
    activity = activity.filter((entry) =>
      Array.isArray(entry.wallets) && entry.wallets.some((value) => normalizeAddress(value) === wallet),
    );
  }

  activity.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return activity.slice(0, limit);
}

function sanitizeMilestones(milestones) {
  if (!Array.isArray(milestones) || !milestones.length) {
    throw new Error("At least one milestone is required");
  }

  return milestones.map((milestone, index) => {
    const description = String(milestone.description || "").trim();
    const amountUsdc = Number(milestone.amountUsdc);

    if (!description) {
      throw new Error(`Milestone ${index + 1} is missing a description`);
    }
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      throw new Error(`Milestone ${index + 1} amount must be greater than zero`);
    }

    return {
      description,
      amountUsdc,
    };
  });
}

function upsertProject(db, body) {
  const onChainProjectId = Number(body.onChainProjectId);
  if (!Number.isInteger(onChainProjectId) || onChainProjectId < 0) {
    throw new Error("onChainProjectId is required");
  }

  const projectTitle = String(body.projectTitle || "").trim();
  const clientAddress = normalizeAddress(body.clientAddress);
  const freelancerAddress = normalizeAddress(body.freelancerAddress);

  if (!projectTitle) throw new Error("projectTitle is required");
  if (!clientAddress) throw new Error("clientAddress is required");
  if (!freelancerAddress) throw new Error("freelancerAddress is required");

  const milestones = sanitizeMilestones(body.milestones);
  const timestamp = nowIso();
  const existing = db.projects.find((project) => project.onChainProjectId === onChainProjectId);

  const payload = {
    onChainProjectId,
    projectTitle,
    clientAddress,
    freelancerAddress,
    chainId: String(body.chainId || "11155111"),
    network: String(body.network || "sepolia"),
    escrowAddress: String(body.escrowAddress || ""),
    txHash: String(body.txHash || ""),
    totalUsdc: Number(body.totalUsdc || milestones.reduce((sum, item) => sum + item.amountUsdc, 0)),
    milestoneCount: milestones.length,
    milestones,
    notes: String(body.notes || "").trim(),
    updatedAt: timestamp,
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    db.projects.push({
      ...payload,
      createdAt: timestamp,
    });
  }

  db.activityLogs.unshift({
    id: `project-${onChainProjectId}-${Date.now()}`,
    type: existing ? "project.updated" : "project.created",
    message: existing
      ? `Off-chain metadata updated for project #${onChainProjectId}`
      : `Off-chain metadata saved for project #${onChainProjectId}`,
    wallets: [clientAddress, freelancerAddress],
    projectId: onChainProjectId,
    createdAt: timestamp,
  });
}

function upsertUser(db, body) {
  const walletAddress = normalizeAddress(body.walletAddress);
  if (!walletAddress) throw new Error("walletAddress is required");

  const existing = db.users.find((user) => normalizeAddress(user.walletAddress) === walletAddress);
  const payload = {
    walletAddress,
    displayName: String(body.displayName || "").trim(),
    role: String(body.role || "").trim(),
    email: String(body.email || "").trim(),
    bio: String(body.bio || "").trim(),
    updatedAt: nowIso(),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    db.users.push({
      ...payload,
      createdAt: payload.updatedAt,
    });
  }
}

function appendActivity(db, body) {
  const message = String(body.message || "").trim();
  if (!message) throw new Error("message is required");

  const wallets = Array.isArray(body.wallets) ? body.wallets.map(normalizeAddress).filter(Boolean) : [];
  db.activityLogs.unshift({
    id: `activity-${Date.now()}`,
    type: String(body.type || "app.event"),
    message,
    wallets,
    projectId: body.projectId !== undefined ? Number(body.projectId) : null,
    txHash: String(body.txHash || ""),
    createdAt: nowIso(),
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    notFound(res);
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;
  const db = readDb();
  const deployment = readDeployment();

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "freelance-escrow-backend",
        timestamp: nowIso(),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/config") {
      sendJson(res, 200, {
        ok: true,
        apiBaseUrl: `http://${HOST}:${PORT}`,
        chain: deployment,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      sendJson(res, 200, {
        ok: true,
        projects: listProjects(db, url.searchParams),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/projects") {
      const body = await parseBody(req);
      upsertProject(db, body);
      writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/projects/")) {
      const id = Number(pathname.split("/").pop());
      const project = db.projects.find((item) => item.onChainProjectId === id);
      if (!project) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { ok: true, project });
      return;
    }

    if (req.method === "PATCH" && pathname.startsWith("/api/projects/")) {
      const id = Number(pathname.split("/").pop());
      const body = await parseBody(req);
      const existing = db.projects.find((item) => item.onChainProjectId === id);
      if (!existing) {
        notFound(res);
        return;
      }

      Object.assign(existing, {
        statusLabel: body.statusLabel ? String(body.statusLabel) : existing.statusLabel,
        notes: body.notes !== undefined ? String(body.notes) : existing.notes,
        updatedAt: nowIso(),
      });
      db.activityLogs.unshift({
        id: `project-patch-${id}-${Date.now()}`,
        type: "project.synced",
        message: `Project #${id} synced from app`,
        wallets: [existing.clientAddress, existing.freelancerAddress],
        projectId: id,
        createdAt: nowIso(),
      });
      writeDb(db);
      sendJson(res, 200, { ok: true, project: existing });
      return;
    }

    if (req.method === "GET" && pathname === "/api/activity") {
      sendJson(res, 200, {
        ok: true,
        activity: listActivity(db, url.searchParams),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/activity") {
      const body = await parseBody(req);
      appendActivity(db, body);
      writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/users") {
      const body = await parseBody(req);
      upsertUser(db, body);
      writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/users/")) {
      const walletAddress = normalizeAddress(pathname.split("/").pop());
      const user = db.users.find((item) => normalizeAddress(item.walletAddress) === walletAddress);
      if (!user) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { ok: true, user });
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || "Request failed",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FreelanceEscrow backend listening on http://${HOST}:${PORT}`);
});
