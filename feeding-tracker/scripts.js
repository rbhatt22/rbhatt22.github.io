const OWNER = "rbhatt22";
const REPO = "rbhatt22.github.io";
const FILE_PATH = "feeding-tracker/feed-log.json";
const CONTENTS_API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
const REPO_API_URL = `https://api.github.com/repos/${OWNER}/${REPO}`;
const STORAGE_KEY = "baby-feeding-tracker-draft-entries";
const TOKEN_STORAGE_KEY = "baby-feeding-tracker-github-token";
const AUTO_SAVE_DELAY_MS = 1200;

const form = document.getElementById("feedForm");
const feedTypeSelect = document.getElementById("feedType");
const feedTimeInput = document.getElementById("feedTime");
const loggedByInput = document.getElementById("loggedBy");
const notesInput = document.getElementById("notes");
const leftMinutesInput = document.getElementById("leftMinutes");
const rightMinutesInput = document.getElementById("rightMinutes");
const bottleMlInput = document.getElementById("bottleMl");
const githubTokenInput = document.getElementById("githubToken");
const nursingCard = document.getElementById("nursingCard");
const bottleCard = document.getElementById("bottleCard");
const feedTableBody = document.getElementById("feedTableBody");
const feedsTodayValue = document.getElementById("feedsToday");
const nursingMinutesTodayValue = document.getElementById("nursingMinutesToday");
const bottleMlTodayValue = document.getElementById("bottleMlToday");
const lastFeedTimeValue = document.getElementById("lastFeedTime");
const exportCsvButton = document.getElementById("exportCsvButton");
const clearAllButton = document.getElementById("clearAllButton");
const loadRepoButton = document.getElementById("loadRepoButton");
const saveRepoButton = document.getElementById("saveRepoButton");
const syncStatus = document.getElementById("syncStatus");

let entries = [];
let fileSha = "";
let repoBranch = "";
let autoSaveTimer = null;

function saveDraftEntries(nextEntries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function loadDraftEntries() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to parse draft feed entries.", error);
        return [];
    }
}

function saveToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function loadToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function getAuthHeaders() {
    const token = loadToken();

    if (!token) {
        return {
            Accept: "application/vnd.github+json",
        };
    }

    return {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
    };
}

function setStatus(message, isError = false) {
    syncStatus.textContent = message;
    syncStatus.classList.toggle("status-error", isError);
}

function toNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(dateTimeValue) {
    const date = new Date(dateTimeValue);
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function defaultDateTimeLocal() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

function getTypeLabel(type) {
    if (type === "nursing") {
        return "Breastfeeding";
    }

    if (type === "bottle") {
        return "Bottle";
    }

    return "Mixed";
}

function updateTypeVisibility() {
    const selectedType = feedTypeSelect.value;
    const showNursing = selectedType === "nursing" || selectedType === "mixed";
    const showBottle = selectedType === "bottle" || selectedType === "mixed";

    nursingCard.classList.toggle("is-muted", !showNursing);
    bottleCard.classList.toggle("is-muted", !showBottle);

    leftMinutesInput.disabled = !showNursing;
    rightMinutesInput.disabled = !showNursing;
    bottleMlInput.disabled = !showBottle;
}

function sortEntries(nextEntries) {
    return [...nextEntries].sort((a, b) => new Date(b.feedTime) - new Date(a.feedTime));
}

function renderStats(renderEntries) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    const todayEntries = renderEntries.filter((entry) => entry.feedTime.slice(0, 10) === todayKey);
    const totalNursingMinutes = todayEntries.reduce(
        (sum, entry) => sum + entry.leftMinutes + entry.rightMinutes,
        0
    );
    const totalBottleMl = todayEntries.reduce((sum, entry) => sum + entry.bottleMl, 0);

    feedsTodayValue.textContent = String(todayEntries.length);
    nursingMinutesTodayValue.textContent = String(totalNursingMinutes);
    bottleMlTodayValue.textContent = String(totalBottleMl);
    lastFeedTimeValue.textContent = renderEntries.length ? formatDateTime(renderEntries[0].feedTime) : "No entries";
}

function renderTable(renderEntries) {
    if (!renderEntries.length) {
        feedTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No feeds logged yet.</td></tr>';
        return;
    }

    feedTableBody.innerHTML = renderEntries
        .map(
            (entry) => `
                <tr>
                    <td>${formatDateTime(entry.feedTime)}</td>
                    <td>${entry.loggedBy}</td>
                    <td>${getTypeLabel(entry.feedType)}</td>
                    <td>${entry.leftMinutes ? `${entry.leftMinutes} min` : "-"}</td>
                    <td>${entry.rightMinutes ? `${entry.rightMinutes} min` : "-"}</td>
                    <td>${entry.bottleMl ? `${entry.bottleMl} ml` : "-"}</td>
                    <td>${entry.notes || "-"}</td>
                    <td><button class="table-delete" type="button" data-entry-id="${entry.id}">Delete</button></td>
                </tr>
            `
        )
        .join("");
}

function render() {
    const sortedEntries = sortEntries(entries);
    renderStats(sortedEntries);
    renderTable(sortedEntries);
}

function setEntries(nextEntries) {
    entries = sortEntries(nextEntries);
    saveDraftEntries(entries);
    render();
}

function hasStoredToken() {
    return Boolean(loadToken().trim());
}

function resetForm() {
    form.reset();
    feedTimeInput.value = defaultDateTimeLocal();
    feedTypeSelect.value = "nursing";
    leftMinutesInput.value = "0";
    rightMinutesInput.value = "0";
    bottleMlInput.value = "0";
    loggedByInput.value = "Mom";
    updateTypeVisibility();
}

function buildEntry() {
    const feedType = feedTypeSelect.value;
    const leftMinutes = feedType === "nursing" || feedType === "mixed" ? toNumber(leftMinutesInput.value) : 0;
    const rightMinutes = feedType === "nursing" || feedType === "mixed" ? toNumber(rightMinutesInput.value) : 0;
    const bottleMl = feedType === "bottle" || feedType === "mixed" ? toNumber(bottleMlInput.value) : 0;

    if (!feedTimeInput.value) {
        throw new Error("Feed time is required.");
    }

    if (feedType !== "bottle" && leftMinutes + rightMinutes <= 0) {
        throw new Error("Enter at least one nursing duration.");
    }

    if (feedType !== "nursing" && bottleMl <= 0) {
        throw new Error("Enter the bottle amount in ml.");
    }

    return {
        id: String(Date.now()),
        loggedBy: loggedByInput.value,
        feedType,
        feedTime: new Date(feedTimeInput.value).toISOString(),
        leftMinutes,
        rightMinutes,
        bottleMl,
        notes: notesInput.value.trim(),
    };
}

function exportCsv(renderEntries) {
    if (!renderEntries.length) {
        window.alert("There are no feed entries to export yet.");
        return;
    }

    const rows = [
        ["Time", "Logged By", "Type", "Left Minutes", "Right Minutes", "Bottle Ml", "Notes"],
        ...renderEntries.map((entry) => [
            entry.feedTime,
            entry.loggedBy,
            getTypeLabel(entry.feedType),
            entry.leftMinutes,
            entry.rightMinutes,
            entry.bottleMl,
            entry.notes,
        ]),
    ];

    const csv = rows
        .map((row) =>
            row
                .map((value) => `"${String(value).replace(/"/g, '""')}"`)
                .join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `feeding-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function decodeBase64Utf8(value) {
    const binary = atob(value.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

function normalizeEntries(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && Array.isArray(payload.entries)) {
        return payload.entries;
    }

    return [];
}

async function fetchRepoMetadata() {
    const response = await fetch(REPO_API_URL, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error(`GitHub repo lookup failed with status ${response.status}.`);
    }

    return response.json();
}

async function ensureRepoBranch() {
    if (repoBranch) {
        return repoBranch;
    }

    const repo = await fetchRepoMetadata();
    repoBranch = repo.default_branch || "master";
    return repoBranch;
}

async function fetchRepoFile() {
    const branch = await ensureRepoBranch();
    const response = await fetch(`${CONTENTS_API_URL}?ref=${encodeURIComponent(branch)}`, {
        headers: getAuthHeaders(),
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`GitHub load failed with status ${response.status}.`);
    }

    return response.json();
}

async function loadFromRepo() {
    setStatus("Loading feed-log.json from GitHub...");

    try {
        const file = await fetchRepoFile();

        if (!file) {
            fileSha = "";
            setEntries([]);
            setStatus(`No ${FILE_PATH} file exists on GitHub yet. Starting with an empty log.`);
            return;
        }

        const content = decodeBase64Utf8(file.content);
        const parsed = JSON.parse(content);
        fileSha = file.sha;
        setEntries(normalizeEntries(parsed));
        setStatus(`Loaded ${entries.length} feed entries from ${FILE_PATH}.`);
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to load the repo file.", true);
    }
}

async function saveToRepo() {
    const token = githubTokenInput.value.trim() || loadToken().trim();

    if (!token) {
        setStatus("Enter a GitHub token before saving to the repo.", true);
        return;
    }

    saveToken(token);
    setStatus("Saving feed-log.json back to GitHub...");

    try {
        const branch = await ensureRepoBranch();
        const latestFile = await fetchRepoFile();
        fileSha = latestFile ? latestFile.sha : "";

        const payload = {
            message: `Update feeding tracker data on ${new Date().toISOString()}`,
            content: encodeBase64Utf8(JSON.stringify({ entries: sortEntries(entries) }, null, 2) + "\n"),
            branch,
        };

        if (fileSha) {
            payload.sha = fileSha;
        }

        const response = await fetch(CONTENTS_API_URL, {
            method: "PUT",
            headers: {
                ...getAuthHeaders(),
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const detail = errorBody.message ? ` ${errorBody.message}` : "";
            throw new Error(`GitHub save failed with status ${response.status}.${detail}`);
        }

        const result = await response.json();
        fileSha = result.content ? result.content.sha : fileSha;
        setStatus(`Saved ${entries.length} feed entries to ${FILE_PATH}. GitHub Pages may take a minute to update.`);
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to save the repo file.", true);
    }
}

function scheduleAutoSave(reason) {
    if (!hasStoredToken()) {
        return;
    }

    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = window.setTimeout(() => {
        setStatus(`${reason} Auto-saving to GitHub...`);
        saveToRepo();
    }, AUTO_SAVE_DELAY_MS);
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
        const nextEntries = [...entries, buildEntry()];
        setEntries(nextEntries);
        resetForm();
        setStatus("Feed added locally.");
        scheduleAutoSave("Feed added.");
    } catch (error) {
        window.alert(error.message);
    }
});

feedTypeSelect.addEventListener("change", updateTypeVisibility);

feedTableBody.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !target.matches("[data-entry-id]")) {
        return;
    }

    const entryId = target.getAttribute("data-entry-id");
    setEntries(entries.filter((entry) => entry.id !== entryId));
    setStatus("Feed removed locally.");
    scheduleAutoSave("Feed removed.");
});

exportCsvButton.addEventListener("click", () => {
    exportCsv(sortEntries(entries));
});

clearAllButton.addEventListener("click", () => {
    if (!window.confirm("Clear all feed entries from the current draft?")) {
        return;
    }

    setEntries([]);
    setStatus("All entries cleared locally.");
    resetForm();
    scheduleAutoSave("All entries cleared.");
});

loadRepoButton.addEventListener("click", () => {
    loadFromRepo();
});

saveRepoButton.addEventListener("click", () => {
    saveToRepo();
});

githubTokenInput.addEventListener("input", () => {
    saveToken(githubTokenInput.value.trim());
});

githubTokenInput.addEventListener("change", () => {
    if (hasStoredToken()) {
        loadFromRepo();
    }
});

githubTokenInput.value = loadToken();
resetForm();
setEntries(loadDraftEntries());
setStatus("Draft loaded from this browser.");
loadFromRepo();
