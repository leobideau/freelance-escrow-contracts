const CONTRACTS = {
  chainId: 11155111,
  chainName: "Sepolia",
  paymentToken: "0xe0Be1a63F2A12F23b4304262494E4CCeFe6F95E9",
  escrow: "0xEda5541b44F17B727285f56E2C82bB8e08C2A82c",
};

const BACKEND_API_BASE = "http://127.0.0.1:8787";

const ESCROW_ABI = [
  "function createProject(address freelancer, string[] descriptions, uint256[] amounts) returns (uint256)",
  "function completeMilestone(uint256 projectId, uint256 milestoneIdx)",
  "function approveMilestone(uint256 projectId, uint256 milestoneIdx)",
  "function claimExpiredMilestone(uint256 projectId, uint256 milestoneIdx)",
  "function cancelProject(uint256 projectId)",
  "function raiseDispute(uint256 projectId, uint256 milestoneIdx, string reason)",
  "function getProject(uint256 projectId) view returns (address client, address freelancer, uint256 totalAmount, uint256 platformFeeBps, uint64 createdAt, uint8 status, uint256 milestoneCount, string disputeReason)",
  "function getAllMilestones(uint256 projectId) view returns ((string description, uint256 amount, uint64 completedAt, uint64 approvedAt, uint8 status)[])",
  "function getProjectsByClient(address client) view returns (uint256[])",
  "function getProjectsByFreelancer(address freelancer) view returns (uint256[])",
  "function AUTO_RELEASE_DELAY() view returns (uint256)",
  "event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed freelancer, uint256 totalAmount, uint256 milestoneCount, uint256 platformFeeBps)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function faucet()",
];

const PROJECT_STATUS = ["Active", "Cancelled", "Completed", "Disputed"];
const MILESTONE_STATUS = ["Pending", "Completed", "Approved", "Claimed", "Refunded", "Disputed"];

const state = {
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  escrow: null,
  token: null,
  tokenDecimals: 6,
  autoReleaseDelay: 14n * 24n * 60n * 60n,
  clientProjects: [],
  freelancerProjects: [],
  activity: [],
  backendProjects: [],
  backendAvailable: false,
};

const dom = {};
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

function init() {
  captureDom();
  hydrateStaticInfo();
  wireTabs();
  wireForm();
  createInitialMilestoneRow();
  hydrateDraft();
  renderStats();
  renderProjects();
  renderActivity();
  bindButtons();
  restoreTitles();
  setupWalletListeners();
}

function captureDom() {
  Object.assign(dom, {
    walletBtn: document.getElementById("walletBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    toast: document.getElementById("toast"),
    escrowAddress: document.getElementById("escrowAddress"),
    tokenAddress: document.getElementById("tokenAddress"),
    networkBadge: document.getElementById("networkBadge"),
    walletStateBadge: document.getElementById("walletStateBadge"),
    walletAddress: document.getElementById("walletAddress"),
    walletBalance: document.getElementById("walletBalance"),
    clientProjectCount: document.getElementById("clientProjectCount"),
    freelancerProjectCount: document.getElementById("freelancerProjectCount"),
    clientStats: document.getElementById("clientStats"),
    freelancerStats: document.getElementById("freelancerStats"),
    clientProjectsList: document.getElementById("clientProjectsList"),
    freelancerProjectsList: document.getElementById("freelancerProjectsList"),
    milestonesBuilder: document.getElementById("milestonesBuilder"),
    addMilestoneBtn: document.getElementById("addMilestoneBtn"),
    approveFundsBtn: document.getElementById("approveFundsBtn"),
    createProjectForm: document.getElementById("createProjectForm"),
    switchNetworkBtn: document.getElementById("switchNetworkBtn"),
    faucetBtn: document.getElementById("faucetBtn"),
    draftTotal: document.getElementById("draftTotal"),
    draftMilestoneCount: document.getElementById("draftMilestoneCount"),
    draftStatus: document.getElementById("draftStatus"),
    activityFeed: document.getElementById("activityFeed"),
  });
}

function hydrateStaticInfo() {
  dom.escrowAddress.textContent = CONTRACTS.escrow;
  dom.tokenAddress.textContent = CONTRACTS.paymentToken;
}

function wireTabs() {
  const sections = {
    client: document.getElementById("clientSection"),
    freelancer: document.getElementById("freelancerSection"),
    create: document.getElementById("createSection"),
  };

  document.querySelectorAll("[data-tab-target]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tabTarget;
      document.querySelectorAll("[data-tab-target]").forEach((node) => {
        node.classList.toggle("active", node === tab);
      });
      Object.entries(sections).forEach(([key, section]) => {
        section.classList.toggle("active", key === target);
      });
    });
  });
}

function wireForm() {
  dom.addMilestoneBtn.addEventListener("click", addMilestoneRow);
  dom.approveFundsBtn.addEventListener("click", approveFunds);
  dom.createProjectForm.addEventListener("submit", handleCreateProject);
  dom.createProjectForm.addEventListener("input", handleDraftChange);
}

function bindButtons() {
  dom.walletBtn.addEventListener("click", connectWallet);
  dom.refreshBtn.addEventListener("click", refreshAll);
  dom.switchNetworkBtn.addEventListener("click", switchToSepolia);
  dom.faucetBtn.addEventListener("click", claimFaucet);
}

function setupWalletListeners() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", async (accounts) => {
    if (!accounts.length) {
      resetWalletState();
      showToast("Wallet disconnected");
      return;
    }
    await connectWallet(false);
  });

  window.ethereum.on("chainChanged", async () => {
    await connectWallet(false);
  });
}

function createInitialMilestoneRow() {
  addMilestoneRow();
  addMilestoneRow();
}

function addMilestoneRow() {
  const row = document.createElement("div");
  row.className = "milestone-item";
  row.innerHTML = `
    <input class="form-input" type="text" placeholder="Milestone description" maxlength="200" />
    <input class="form-input mono" type="number" min="0" step="0.01" placeholder="USDC" />
    <button type="button" class="btn-remove">×</button>
  `;

  row.querySelector(".btn-remove").addEventListener("click", () => {
    const rows = dom.milestonesBuilder.querySelectorAll(".milestone-item");
    if (rows.length > 1) {
      row.remove();
      handleDraftChange();
    }
  });

  dom.milestonesBuilder.appendChild(row);
  handleDraftChange();
}

async function connectWallet(requestAccounts = true) {
  if (!window.ethereum) {
    showToast("MetaMask is required to use this prototype.");
    return;
  }

  try {
    state.provider = new ethers.BrowserProvider(window.ethereum);
    if (requestAccounts) {
      await state.provider.send("eth_requestAccounts", []);
    }

    const network = await state.provider.getNetwork();
    state.chainId = Number(network.chainId);

    const signer = await state.provider.getSigner();
    const account = await signer.getAddress();
    const validChain = state.chainId === CONTRACTS.chainId;

    state.signer = signer;
    state.account = account;

    dom.walletBtn.textContent = shorten(account);
    dom.walletBtn.classList.add("connected");
    dom.walletAddress.textContent = account;
    dom.networkBadge.textContent = `Connected to ${network.name || "network"} · chain ${state.chainId}`;
    dom.walletStateBadge.textContent = validChain ? "Ready" : "Wrong chain";
    dom.walletStateBadge.className = `badge ${validChain ? "active" : "disputed"}`;

    if (!validChain) {
      state.escrow = null;
      state.token = null;
      state.clientProjects = [];
      state.freelancerProjects = [];
      dom.walletBalance.textContent = "0.00";
      dom.clientProjectCount.textContent = "0";
      dom.freelancerProjectCount.textContent = "0";
      addActivity("network", "Wallet connected on the wrong network.");
      renderStats();
      renderProjects();
      showToast("Switch MetaMask to Sepolia before sending transactions.");
      return;
    }

    state.escrow = new ethers.Contract(CONTRACTS.escrow, ESCROW_ABI, signer);
    state.token = new ethers.Contract(CONTRACTS.paymentToken, ERC20_ABI, signer);
    state.tokenDecimals = Number(await state.token.decimals());
    state.autoReleaseDelay = await state.escrow.AUTO_RELEASE_DELAY();
    addActivity("wallet", `Wallet connected: ${shorten(account)}`);
    await upsertBackendUser(account);

    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast(readError(error));
  }
}

function resetWalletState() {
  state.provider = null;
  state.signer = null;
  state.account = null;
  state.chainId = null;
  state.escrow = null;
  state.token = null;
  state.clientProjects = [];
  state.freelancerProjects = [];
  state.activity = [];
  dom.walletBtn.textContent = "Connect Wallet";
  dom.walletBtn.classList.remove("connected");
  dom.walletAddress.textContent = "Not connected";
  dom.walletBalance.textContent = "0.00";
  dom.networkBadge.textContent = "Disconnected";
  dom.walletStateBadge.textContent = "Idle";
  dom.walletStateBadge.className = "badge pending";
  dom.clientProjectCount.textContent = "0";
  dom.freelancerProjectCount.textContent = "0";
  renderStats();
  renderProjects();
  renderActivity();
}

async function refreshAll() {
  if (!state.account || !state.escrow || !state.token) {
    renderStats();
    renderProjects();
    return;
  }

  try {
    const [balance, clientIds, freelancerIds, backendProjects, backendActivity] = await Promise.all([
      state.token.balanceOf(state.account),
      state.escrow.getProjectsByClient(state.account),
      state.escrow.getProjectsByFreelancer(state.account),
      fetchBackendProjects(state.account),
      fetchBackendActivity(state.account),
    ]);

    dom.walletBalance.textContent = formatUnits(balance);
    state.backendProjects = backendProjects;
    state.backendAvailable = true;

    state.clientProjects = await loadProjects(clientIds, "client");
    state.freelancerProjects = await loadProjects(freelancerIds, "freelancer");

    dom.clientProjectCount.textContent = String(state.clientProjects.length);
    dom.freelancerProjectCount.textContent = String(state.freelancerProjects.length);

    if (backendActivity.length) {
      hydrateActivityFromBackend(backendActivity);
    }

    renderStats();
    renderProjects();
    addActivity("refresh", "On-chain data refreshed.");
  } catch (error) {
    console.error(error);
    state.backendAvailable = false;
    showToast(`Refresh failed: ${readError(error)}`);
  }
}

async function loadProjects(ids, role) {
  const items = [];

  for (const id of ids) {
    const projectId = Number(id);
    const [project, milestones] = await Promise.all([
      state.escrow.getProject(projectId),
      state.escrow.getAllMilestones(projectId),
    ]);

    const normalizedMilestones = milestones.map((m, index) => ({
      index,
      description: m.description,
      amount: BigInt(m.amount),
      completedAt: Number(m.completedAt),
      approvedAt: Number(m.approvedAt),
      status: Number(m.status),
    }));

    items.push({
      id: projectId,
      role,
      client: project.client,
      freelancer: project.freelancer,
      totalAmount: BigInt(project.totalAmount),
      platformFeeBps: Number(project.platformFeeBps),
      createdAt: Number(project.createdAt),
      status: Number(project.status),
      milestoneCount: Number(project.milestoneCount),
      disputeReason: project.disputeReason,
      milestones: normalizedMilestones,
    });
  }

  return items.sort((a, b) => b.id - a.id);
}

function renderStats() {
  const clientProjects = state.clientProjects || [];
  const freelancerProjects = state.freelancerProjects || [];

  dom.clientStats.innerHTML = buildStatsMarkup([
    {
      label: "Active projects",
      value: countProjects(clientProjects, 0),
      className: "",
    },
    {
      label: "Total locked",
      value: `${formatAggregate(sumByStatuses(clientProjects, [0, 3]))} USDC`,
      className: "green",
    },
    {
      label: "Cancelled",
      value: countProjects(clientProjects, 1),
      className: "amber",
    },
  ]);

  dom.freelancerStats.innerHTML = buildStatsMarkup([
    {
      label: "Assigned projects",
      value: freelancerProjects.length,
      className: "",
    },
    {
      label: "Released / claimable",
      value: `${formatAggregate(sumResolvedForFreelancer(freelancerProjects))} USDC`,
      className: "green",
    },
    {
      label: "Awaiting client action",
      value: countCompletedMilestones(freelancerProjects),
      className: "amber",
    },
  ]);
}

function buildStatsMarkup(items) {
  return items
    .map(
      (item) => `
        <div class="stat-card">
          <div class="stat-label">${item.label}</div>
          <div class="stat-val ${item.className || ""}">${item.value}</div>
        </div>
      `,
    )
    .join("");
}

function renderProjects() {
  renderProjectList(dom.clientProjectsList, state.clientProjects, "client");
  renderProjectList(dom.freelancerProjectsList, state.freelancerProjects, "freelancer");
}

function renderProjectList(container, projects, role) {
  if (!projects || !projects.length) {
    container.innerHTML = `
      <div class="empty-state">
        ${state.account ? "No projects found for this role yet." : "Connect a wallet to load on-chain projects."}
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map((project) => buildProjectCard(project, role)).join("");
  bindProjectActions(container);
}

function buildProjectCard(project, role) {
  const title = getStoredTitle(project) || inferFallbackTitle(project);
  const completedCount = project.milestones.filter((m) => [2, 3].includes(m.status)).length;
  const progress = Math.round((completedCount / project.milestones.length) * 100);
  const counterpartyLabel = role === "client" ? "Freelancer" : "Client";
  const counterparty = role === "client" ? project.freelancer : project.client;

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(title)}</div>
          <div class="address mono">
            Project #${project.id} · ${counterpartyLabel}: ${shorten(counterparty)} · ${project.milestoneCount} milestones
          </div>
        </div>
        <span class="badge ${statusBadgeClass(project.status)}">${PROJECT_STATUS[project.status]}</span>
      </div>

      <div class="card-summary">
        <div class="summary-box">
          <div class="label">Total locked</div>
          <div class="value">${formatUnits(project.totalAmount)} USDC</div>
        </div>
        <div class="summary-box">
          <div class="label">Fee</div>
          <div class="value">${(project.platformFeeBps / 100).toFixed(2)}%</div>
        </div>
        <div class="summary-box">
          <div class="label">Created</div>
          <div class="value">${formatDate(project.createdAt)}</div>
        </div>
        <div class="summary-box">
          <div class="label">Progress</div>
          <div class="value">${progress}%</div>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>

      ${project.disputeReason ? `<div class="subtle" style="margin: 8px 0 4px;">Dispute reason: ${escapeHtml(project.disputeReason)}</div>` : ""}

      ${project.milestones.map((milestone) => buildMilestoneRow(project, milestone, role)).join("")}

      ${
        role === "client" && project.status === 0
          ? `
            <div class="milestone-actions" style="margin-top:14px;">
              <button class="action-btn danger" data-action="cancel-project" data-project-id="${project.id}">
                Cancel pending milestones
              </button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function buildMilestoneRow(project, milestone, role) {
  const statusLabel = MILESTONE_STATUS[milestone.status];
  const metaParts = [statusLabel];
  if (milestone.completedAt) metaParts.push(`completed ${formatDate(milestone.completedAt)}`);
  if (milestone.approvedAt) metaParts.push(`released ${formatDate(milestone.approvedAt)}`);

  return `
    <div class="milestone-row">
      <div class="milestone-dot ${milestoneDotClass(milestone.status)}"></div>
      <div class="milestone-main">
        <div class="milestone-name">${escapeHtml(milestone.description)}</div>
        <div class="milestone-meta mono">${metaParts.join(" · ")}</div>
      </div>
      <div class="milestone-amount mono">${formatUnits(milestone.amount)} USDC</div>
      <div class="milestone-actions">
        ${buildMilestoneActions(project, milestone, role)}
      </div>
    </div>
  `;
}

function buildMilestoneActions(project, milestone, role) {
  const actions = [];

  if (!state.account || state.chainId !== CONTRACTS.chainId) {
    return `<button class="action-btn" disabled>Sepolia required</button>`;
  }

  if (role === "client" && project.status === 0 && milestone.status === 1) {
    actions.push(actionButton("approve", "Approve", "approve-milestone", project.id, milestone.index));
    actions.push(actionButton("danger", "Dispute", "raise-dispute", project.id, milestone.index));
  }

  if (role === "freelancer" && project.status === 0 && milestone.status === 0) {
    actions.push(actionButton("complete", "Mark done", "complete-milestone", project.id, milestone.index));
  }

  if (
    role === "freelancer" &&
    [0, 1].includes(project.status) &&
    milestone.status === 1 &&
    canClaimAutoRelease(milestone)
  ) {
    actions.push(actionButton("secondary", "Claim 14d release", "claim-milestone", project.id, milestone.index));
  }

  if (role === "freelancer" && project.status === 0 && milestone.status === 1) {
    actions.push(actionButton("danger", "Dispute", "raise-dispute", project.id, milestone.index));
  }

  if (!actions.length) {
    return `<button class="action-btn" disabled>No action</button>`;
  }

  return actions.join("");
}

function actionButton(className, label, action, projectId, milestoneIdx) {
  return `
    <button
      class="action-btn ${className}"
      data-action="${action}"
      data-project-id="${projectId}"
      data-milestone-idx="${milestoneIdx}"
    >
      ${label}
    </button>
  `;
}

function bindProjectActions(container) {
  container.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleProjectAction);
  });
}

async function handleProjectAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  const projectId = Number(button.dataset.projectId);
  const milestoneIdx = button.dataset.milestoneIdx !== undefined ? Number(button.dataset.milestoneIdx) : null;

  if (!state.escrow || !state.signer) {
    showToast("Connect wallet first.");
    return;
  }

  if (state.chainId !== CONTRACTS.chainId) {
    showToast("Switch to Sepolia before sending a transaction.");
    return;
  }

  try {
    setBusy(button, true);

    if (action === "approve-milestone") {
      await sendTx(() => state.escrow.approveMilestone(projectId, milestoneIdx), "Approving milestone...");
    } else if (action === "complete-milestone") {
      await sendTx(() => state.escrow.completeMilestone(projectId, milestoneIdx), "Marking milestone complete...");
    } else if (action === "claim-milestone") {
      await sendTx(() => state.escrow.claimExpiredMilestone(projectId, milestoneIdx), "Claiming auto-release...");
    } else if (action === "cancel-project") {
      await sendTx(() => state.escrow.cancelProject(projectId), "Cancelling pending milestones...");
    } else if (action === "raise-dispute") {
      const reason = window.prompt("Short dispute reason (max 200 chars):");
      if (!reason) return;
      await sendTx(() => state.escrow.raiseDispute(projectId, milestoneIdx, reason.trim()), "Raising dispute...");
    }

    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast(readError(error));
  } finally {
    setBusy(button, false);
  }
}

async function approveFunds() {
  if (!state.token || !state.account) {
    showToast("Connect wallet first.");
    return;
  }

  if (state.chainId !== CONTRACTS.chainId) {
    showToast("Switch to Sepolia first.");
    return;
  }

  try {
    const { amounts } = getCreateFormData();
    const total = amounts.reduce((sum, value) => sum + value, 0n);

    if (total <= 0n) {
      showToast("Add at least one valid milestone amount.");
      return;
    }

    await sendTx(() => state.token.approve(CONTRACTS.escrow, total), `Approving ${formatUnits(total)} mUSDC...`);
    addActivity("approval", `Allowance updated for ${formatUnits(total)} mUSDC.`);
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast(readError(error));
  }
}

async function handleCreateProject(event) {
  event.preventDefault();

  if (!state.escrow || !state.account) {
    showToast("Connect wallet first.");
    return;
  }

  if (state.chainId !== CONTRACTS.chainId) {
    showToast("Switch MetaMask to Sepolia first.");
    return;
  }

  try {
    const formData = getCreateFormData();
    const total = formData.amounts.reduce((sum, value) => sum + value, 0n);
    const allowance = await state.token.allowance(state.account, CONTRACTS.escrow);

    if (allowance < total) {
      showToast("Approve the total USDC amount before creating the project.");
      return;
    }

    const tx = await state.escrow.createProject(
      formData.freelancerAddress,
      formData.descriptions,
      formData.amounts,
    );
    showToast("Creating escrow project...");
    const receipt = await tx.wait();

    let createdProjectId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = state.escrow.interface.parseLog(log);
        if (parsed?.name === "ProjectCreated") {
          createdProjectId = Number(parsed.args.projectId);
          break;
        }
      } catch (_error) {
        continue;
      }
    }

    if (createdProjectId !== null && formData.projectTitle) {
      persistProjectTitle(createdProjectId, formData.projectTitle);
      await syncProjectToBackend({
        onChainProjectId: createdProjectId,
        projectTitle: formData.projectTitle,
        clientAddress: state.account,
        freelancerAddress: formData.freelancerAddress,
        chainId: CONTRACTS.chainId,
        network: CONTRACTS.chainName.toLowerCase(),
        escrowAddress: CONTRACTS.escrow,
        txHash: tx.hash,
        totalUsdc: Number(formatUnits(total).replaceAll(",", "")),
        milestones: formData.descriptions.map((description, index) => ({
          description,
          amountUsdc: Number(formatUnits(formData.amounts[index]).replaceAll(",", "")),
        })),
      });
    }

    dom.createProjectForm.reset();
    dom.milestonesBuilder.innerHTML = "";
    createInitialMilestoneRow();
    clearDraft();

    addActivity(
      "project",
      createdProjectId !== null
        ? `Project #${createdProjectId} created for ${shorten(formData.freelancerAddress)}.`
        : "Project created on-chain.",
    );
    showToast(createdProjectId !== null ? `Project #${createdProjectId} created on Sepolia.` : "Project created.");
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast(readError(error));
  }
}

function getCreateFormData() {
  const projectTitle = document.getElementById("projectTitle").value.trim();
  const freelancerAddress = document.getElementById("freelancerAddressInput").value.trim();
  const rows = [...dom.milestonesBuilder.querySelectorAll(".milestone-item")];

  if (!projectTitle) {
    throw new Error("Project title is required for a clean presentation.");
  }

  if (!ethers.isAddress(freelancerAddress)) {
    throw new Error("Invalid freelancer wallet address.");
  }

  const descriptions = [];
  const amounts = [];

  for (const row of rows) {
    const [descriptionInput, amountInput] = row.querySelectorAll("input");
    const description = descriptionInput.value.trim();
    const amountRaw = amountInput.value.trim();

    if (!description || !amountRaw) {
      throw new Error("Each milestone needs a description and an amount.");
    }

    if (Number(amountRaw) <= 0) {
      throw new Error("Milestone amounts must be greater than zero.");
    }

    descriptions.push(description);
    amounts.push(ethers.parseUnits(amountRaw, state.tokenDecimals));
  }

  return { projectTitle, freelancerAddress, descriptions, amounts };
}

async function sendTx(send, pendingMessage) {
  showToast(pendingMessage);
  addActivity("tx", pendingMessage);
  const tx = await send();
  await tx.wait();
  showToast("Transaction confirmed.");
  addActivity("confirmed", `Confirmed: ${shorten(tx.hash)}`);
}

function persistProjectTitle(projectId, title) {
  const titles = getStoredTitles();
  titles[String(projectId)] = title;
  localStorage.setItem("freelanceEscrowTitles", JSON.stringify(titles));
}

function restoreTitles() {
  getStoredTitles();
}

function hydrateDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem("freelanceEscrowDraft") || "{}");
    if (raw.projectTitle) document.getElementById("projectTitle").value = raw.projectTitle;
    if (raw.freelancerAddress) {
      document.getElementById("freelancerAddressInput").value = raw.freelancerAddress;
    }
  } catch (_error) {
    return;
  } finally {
    handleDraftChange();
  }
}

function saveDraft() {
  const draft = {
    projectTitle: document.getElementById("projectTitle").value.trim(),
    freelancerAddress: document.getElementById("freelancerAddressInput").value.trim(),
  };
  localStorage.setItem("freelanceEscrowDraft", JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem("freelanceEscrowDraft");
  handleDraftChange();
}

function handleDraftChange() {
  saveDraft();
  const rows = [...dom.milestonesBuilder.querySelectorAll(".milestone-item")];
  const amounts = rows
    .map((row) => row.querySelectorAll("input")[1]?.value.trim() || "")
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value) && value > 0);

  const total = amounts.reduce((sum, value) => sum + value, 0);
  const title = document.getElementById("projectTitle").value.trim();
  const freelancer = document.getElementById("freelancerAddressInput").value.trim();
  const rowsFilled = rows.filter((row) => {
    const [descriptionInput, amountInput] = row.querySelectorAll("input");
    return descriptionInput.value.trim() && amountInput.value.trim();
  }).length;

  dom.draftTotal.textContent = `${total.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
  dom.draftMilestoneCount.textContent = String(rows.length);

  if (!title && !freelancer && rowsFilled === 0) {
    dom.draftStatus.textContent = "Waiting input";
  } else if (!title || !ethers.isAddress(freelancer) || rowsFilled !== rows.length) {
    dom.draftStatus.textContent = "Needs completion";
  } else {
    dom.draftStatus.textContent = "Ready to approve";
  }
}

function getStoredTitle(project) {
  const backendProject = state.backendProjects.find(
    (item) => Number(item.onChainProjectId) === Number(project.id),
  );
  if (backendProject?.projectTitle) {
    return backendProject.projectTitle;
  }

  const titles = getStoredTitles();
  return titles[String(project.id)] || "";
}

function getStoredTitles() {
  try {
    return JSON.parse(localStorage.getItem("freelanceEscrowTitles") || "{}");
  } catch (_error) {
    return {};
  }
}

function inferFallbackTitle(project) {
  if (project.milestones[0]?.description) {
    return project.milestones[0].description;
  }
  return `Escrow project #${project.id}`;
}

function addActivity(kind, message) {
  state.activity.unshift({
    kind,
    message,
    timestamp: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 8);
  renderActivity();
}

function hydrateActivityFromBackend(entries) {
  const backendItems = entries.map((entry) => ({
    kind: entry.type || "backend",
    message: entry.message,
    timestamp: entry.createdAt,
  }));

  state.activity = [...backendItems, ...state.activity]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .filter((item, index, array) => {
      return (
        array.findIndex(
          (candidate) =>
            candidate.kind === item.kind &&
            candidate.message === item.message &&
            candidate.timestamp === item.timestamp,
        ) === index
      );
    })
    .slice(0, 8);
  renderActivity();
}

function renderActivity() {
  if (!dom.activityFeed) return;
  if (!state.activity.length) {
    dom.activityFeed.innerHTML = `<div class="empty-state compact-empty">No activity yet.</div>`;
    return;
  }

  dom.activityFeed.innerHTML = state.activity
    .map(
      (item) => `
        <div class="activity-item">
          <div class="activity-topline">
            <span class="activity-kind">${escapeHtml(item.kind)}</span>
            <span class="activity-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="activity-message">${escapeHtml(item.message)}</div>
        </div>
      `,
    )
    .join("");
}

function countProjects(projects, status) {
  return projects.filter((project) => project.status === status).length;
}

function countCompletedMilestones(projects) {
  return projects.reduce(
    (count, project) => count + project.milestones.filter((m) => m.status === 1).length,
    0,
  );
}

function sumByStatuses(projects, statuses) {
  return projects.reduce((sum, project) => {
    if (!statuses.includes(project.status)) return sum;
    return sum + project.totalAmount;
  }, 0n);
}

function sumResolvedForFreelancer(projects) {
  return projects.reduce((sum, project) => {
    const released = project.milestones
      .filter((m) => [2, 3].includes(m.status))
      .reduce((acc, milestone) => acc + milestone.amount, 0n);
    return sum + released;
  }, 0n);
}

function canClaimAutoRelease(milestone) {
  if (!milestone.completedAt) return false;
  const completedAt = BigInt(milestone.completedAt);
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now >= completedAt + state.autoReleaseDelay;
}

function statusBadgeClass(status) {
  return ["active", "cancelled", "completed", "disputed"][status] || "pending";
}

function milestoneDotClass(status) {
  if ([2, 3].includes(status)) return "dot-done";
  if (status === 1) return "dot-pending";
  if (status === 5) return "dot-disputed";
  return "dot-idle";
}

function formatAggregate(value) {
  return Number(ethers.formatUnits(value, state.tokenDecimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatUnits(value) {
  return Number(ethers.formatUnits(value, state.tokenDecimals)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`${BACKEND_API_BASE}${pathname}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Backend request failed (${response.status})`);
  }

  return response.json();
}

async function fetchBackendProjects(wallet) {
  try {
    const payload = await apiRequest(`/api/projects?wallet=${encodeURIComponent(wallet)}`);
    return Array.isArray(payload.projects) ? payload.projects : [];
  } catch (_error) {
    return [];
  }
}

async function fetchBackendActivity(wallet) {
  try {
    const payload = await apiRequest(`/api/activity?wallet=${encodeURIComponent(wallet)}&limit=8`);
    return Array.isArray(payload.activity) ? payload.activity : [];
  } catch (_error) {
    return [];
  }
}

async function upsertBackendUser(walletAddress) {
  try {
    await apiRequest("/api/users", {
      method: "POST",
      body: JSON.stringify({
        walletAddress,
        role: "wallet-user",
      }),
    });
  } catch (_error) {
    return;
  }
}

async function syncProjectToBackend(project) {
  try {
    await apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(project),
    });
    state.backendProjects = await fetchBackendProjects(state.account);
    state.backendAvailable = true;
  } catch (_error) {
    addActivity("backend", "Project metadata stayed local because backend was unreachable.");
  }
}

async function switchToSepolia() {
  if (!window.ethereum) {
    showToast("MetaMask is required.");
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
    addActivity("network", "Switched wallet to Sepolia.");
    await connectWallet(false);
  } catch (error) {
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        addActivity("network", "Sepolia network added to wallet.");
        await connectWallet(false);
      } catch (innerError) {
        showToast(readError(innerError));
      }
      return;
    }
    showToast(readError(error));
  }
}

async function claimFaucet() {
  if (!state.token || !state.account) {
    showToast("Connect wallet first.");
    return;
  }

  if (state.chainId !== CONTRACTS.chainId) {
    showToast("Switch to Sepolia first.");
    return;
  }

  try {
    await sendTx(() => state.token.faucet(), "Claiming 10,000 mUSDC from faucet...");
    addActivity("faucet", "Demo faucet claimed successfully.");
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast(readError(error));
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "Not yet";
  return new Date(timestamp * 1000).toLocaleDateString();
}

function shorten(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function setBusy(button, busy) {
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? "Pending..." : button.dataset.originalLabel;
}

function showToast(message) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 3000);
}

function readError(error) {
  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    "Transaction failed.";
  return message.replace(/^execution reverted:?\s*/i, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
