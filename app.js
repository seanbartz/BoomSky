const API_BASE = "https://bsky.social/xrpc";
const PACERS_KEYWORDS = [
  "pacers",
  "indiana pacers",
  "haliburton",
  "tyrese",
  "turner",
  "siakam",
  "carlisle",
  "fieldhouse",
  "aaron nesmith",
  "andrew nembhard",
  "ben sheppard",
  "bennedict mathurin",
  "ethan thompson",
  "isaiah jackson",
  "jarace walker",
  "jay huff",
  "johnny furphy",
  "kam jones",
  "micah potter",
  "obi toppin",
  "pascal siakam",
  "quenton jackson",
  "t.j. mcconnell",
  "tj mcconnell",
  "taelon peter",
  "tony bradley",
  "tyrese haliburton",
];
const PACERS_BLOCKED_HANDLES = new Set([
  "tonyreast.bsky.social",
  "ipacers.bsky.social",
]);

const form = document.getElementById("credentials-form");
const timeline = document.getElementById("timeline");
const statusPill = document.getElementById("status-pill");
const postTemplate = document.getElementById("post-template");

const setStatus = (text) => {
  statusPill.textContent = text;
};

const showError = (message) => {
  timeline.innerHTML = "";
  const error = document.createElement("div");
  error.className = "error";
  error.textContent = message;
  timeline.appendChild(error);
};

const showEmpty = (message) => {
  timeline.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  timeline.appendChild(empty);
};

const containsPacersSpoiler = (text) => {
  const lowered = text.toLowerCase();
  return PACERS_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleString();
};

const renderPosts = (posts) => {
  timeline.innerHTML = "";
  if (posts.length === 0) {
    showEmpty("No posts to show after filtering.");
    return;
  }

  posts.forEach((item) => {
    const post = item.post || {};
    const record = post.record || {};
    const author = post.author || {};
    const clone = postTemplate.content.cloneNode(true);

    clone.querySelector(".post-author").textContent = author.displayName || "Unknown";
    clone.querySelector(".post-handle").textContent = `@${author.handle || "unknown"}`;
    clone.querySelector(".post-date").textContent = formatDate(record.createdAt);
    clone.querySelector(".post-text").textContent = record.text || "";

    timeline.appendChild(clone);
  });
};

const createSession = async (handle, appPassword) => {
  const response = await fetch(`${API_BASE}/com.atproto.server.createSession`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: handle,
      password: appPassword,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to sign in. Check your handle and app password.");
  }

  const payload = await response.json();
  return payload.accessJwt;
};

const fetchTimeline = async (token, limit) => {
  const response = await fetch(`${API_BASE}/app.bsky.feed.getTimeline?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load timeline. Please try again.");
  }

  const payload = await response.json();
  return payload.feed || [];
};

const filterTimeline = (feed, hidePacers) => {
  if (!hidePacers) {
    return feed;
  }

  return feed.filter((item) => {
    const text = item.post?.record?.text || "";
    const handle = item.post?.author?.handle || "";
    return !containsPacersSpoiler(text) && !PACERS_BLOCKED_HANDLES.has(handle);
  });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Loading timeline...");
  timeline.innerHTML = "";

  const formData = new FormData(form);
  const handle = formData.get("handle").trim();
  const appPassword = formData.get("appPassword").trim();
  const limit = Number(formData.get("limit")) || 30;
  const caughtUp = formData.get("caughtUp") === "yes";

  if (!handle || !appPassword) {
    showError("Please enter your handle and app password.");
    setStatus("Waiting for sign-in");
    return;
  }

  try {
    const token = await createSession(handle, appPassword);
    const feed = await fetchTimeline(token, limit);
    const filtered = filterTimeline(feed, !caughtUp);
    renderPosts(filtered);
    setStatus(caughtUp ? "Showing all posts" : "Spoilers hidden");
  } catch (error) {
    showError(error.message);
    setStatus("Sign-in error");
  }
});
