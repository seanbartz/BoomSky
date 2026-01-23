const API_BASE = "https://bsky.social/xrpc";
const STORAGE_KEY = "boomsky-hide-pacers";
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
const DEFAULT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#dbe2f8"/><path d="M40 42c8.8 0 16-7.2 16-16S48.8 10 40 10s-16 7.2-16 16 7.2 16 16 16zm0 8c-13.3 0-24 10.7-24 24h48c0-13.3-10.7-24-24-24z" fill="#8aa0d6"/></svg>',
)}`;

const form = document.getElementById("credentials-form");
const timeline = document.getElementById("timeline");
const statusPill = document.getElementById("status-pill");
const postTemplate = document.getElementById("post-template");
const composerForm = document.getElementById("composer-form");
const pacersToggle = document.getElementById("pacers-toggle");
const pacersState = document.getElementById("pacers-state");
const refreshButton = document.getElementById("refresh-button");
const tabTimeline = document.getElementById("tab-timeline");
const tabNotifications = document.getElementById("tab-notifications");
const notificationsSection = document.getElementById("notifications");
const notificationsList = document.getElementById("notifications-list");
const notificationsPill = document.getElementById("notifications-pill");
const markReadButton = document.getElementById("mark-read");
const composerAvatar = document.getElementById("composer-avatar");
const photoInput = document.getElementById("photo-input");
const photoButton = document.getElementById("photo-button");
const photoName = document.getElementById("photo-name");
const pacersStatus = document.getElementById("pacers-status");
const favicon = document.getElementById("favicon");

const state = {
  handle: "excitedstate.bsky.social",
  session: null,
  token: "",
  hidePacers: true,
  limit: 30,
  feed: [],
  notifications: [],
  view: "timeline",
  notificationsSeenAt: null,
  composerImage: null,
};

const storedHide = localStorage.getItem(STORAGE_KEY);
if (storedHide !== null) {
  state.hidePacers = storedHide === "true";
}

const setStatus = (text) => {
  statusPill.textContent = text;
};

const renderMessage = (container, className, message) => {
  container.innerHTML = "";
  const node = document.createElement("div");
  node.className = className;
  node.textContent = message;
  container.appendChild(node);
};

const showError = (message) => {
  renderMessage(timeline, "error", message);
};

const showEmpty = (message) => {
  renderMessage(timeline, "empty", message);
};

const showNotificationError = (message) => {
  renderMessage(notificationsList, "error", message);
};

const containsPacersSpoiler = (text) => {
  const lowered = text.toLowerCase();
  return PACERS_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const updatePacersUI = () => {
  if (!pacersToggle || !pacersState) {
    return;
  }
  pacersToggle.classList.toggle("is-off", !state.hidePacers);
  pacersState.textContent = state.hidePacers ? "On" : "Off";
  document.body.classList.toggle("theme-navy", !state.hidePacers);
  if (favicon) {
    favicon.href = state.hidePacers ? "favicon-orange.svg" : "favicon-navy.svg";
  }
  if (pacersStatus) {
    pacersStatus.textContent = state.hidePacers ? "Pacers Shield On" : "Pacers Shield Off";
  }
};

const updateComposerAvatar = (avatarUrl) => {
  if (!composerAvatar) {
    return;
  }
  composerAvatar.src = avatarUrl || DEFAULT_AVATAR;
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleString();
};

const truncateText = (text, maxLength = 160) => {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trim()}...`;
};

const buildTextSegments = (text, facets = []) => {
  if (!facets.length) {
    return null;
  }

  const encoder = new TextEncoder();
  const map = [];
  let byteIndex = 0;
  let stringIndex = 0;
  for (const char of text) {
    const bytes = encoder.encode(char).length;
    map.push({
      startByte: byteIndex,
      endByte: byteIndex + bytes,
      startIndex: stringIndex,
      endIndex: stringIndex + char.length,
    });
    byteIndex += bytes;
    stringIndex += char.length;
  }

  const getStringIndex = (targetByte) => {
    for (const entry of map) {
      if (targetByte <= entry.endByte) {
        return targetByte === entry.endByte ? entry.endIndex : entry.startIndex;
      }
    }
    return text.length;
  };

  const linkFacets = facets
    .map((facet) => {
      const link = facet.features?.find(
        (feature) => feature.$type === "app.bsky.richtext.facet#link",
      );
      if (!link) {
        return null;
      }
      return {
        start: getStringIndex(facet.index.byteStart),
        end: getStringIndex(facet.index.byteEnd),
        uri: link.uri,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (!linkFacets.length) {
    return null;
  }

  const fragments = [];
  let cursor = 0;
  linkFacets.forEach((facet) => {
    if (facet.start > cursor) {
      fragments.push({ text: text.slice(cursor, facet.start) });
    }
    fragments.push({
      text: text.slice(facet.start, facet.end),
      link: facet.uri,
    });
    cursor = facet.end;
  });
  if (cursor < text.length) {
    fragments.push({ text: text.slice(cursor) });
  }

  return fragments;
};

const linkifyText = (text) => {
  const regex = /(https?:\/\/[^\s]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    parts.push({ text: match[0], link: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  return parts;
};

const isSafeUrl = (url, allowRelative = true) => {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return false;
  }
  try {
    // If allowRelative is true, use base URL for resolution
    // If false, only allow absolute URLs
    const parsed = allowRelative 
      ? new URL(url, window.location.href)
      : new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
};

const renderPostText = (container, text, facets) => {
  container.textContent = "";
  const segments = buildTextSegments(text, facets) || linkifyText(text);
  segments.forEach((segment) => {
    if (segment.link && isSafeUrl(segment.link)) {
      const anchor = document.createElement("a");
      anchor.href = segment.link;
      anchor.textContent = segment.text;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      container.appendChild(anchor);
    } else {
      container.appendChild(document.createTextNode(segment.text));
    }
  });
};

const renderImages = (images, container) => {
  if (!images?.length) {
    return;
  }
  const media = document.createElement("div");
  media.className = "post-media";
  images.forEach((image) => {
    const imgUrl = image.thumb || image.fullsize || "";
    // Only render images with safe URLs - require absolute URLs for external images
    if (imgUrl && isSafeUrl(imgUrl, false)) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.alt = image.alt || "Post image";
      media.appendChild(img);
    }
  });
  // Only append media container if it has children
  if (media.children.length > 0) {
    container.appendChild(media);
  }
};

const renderVideo = (video, container) => {
  if (!video) {
    return;
  }
  const card = document.createElement("div");
  card.className = "video-card";
  if (video.playlist) {
    const player = document.createElement("video");
    player.controls = true;
    if (video.thumbnail) {
      player.poster = video.thumbnail;
    }
    const source = document.createElement("source");
    source.src = video.playlist;
    source.type = "application/x-mpegURL";
    player.appendChild(source);
    card.appendChild(player);
  } else if (video.thumbnail) {
    const thumb = document.createElement("img");
    thumb.src = video.thumbnail;
    thumb.alt = "Video thumbnail";
    card.appendChild(thumb);
  }
  container.appendChild(card);
};

const renderExternalCard = (external, container) => {
  if (!external) {
    return;
  }
  
  // Validate the external URI for security - require absolute URLs
  if (!isSafeUrl(external.uri, false)) {
    // Don't render the card if the URI is not safe
    return;
  }
  
  const card = document.createElement("a");
  card.className = "link-card";
  card.href = external.uri;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  if (external.thumb && isSafeUrl(external.thumb, false)) {
    const thumb = document.createElement("img");
    thumb.src = external.thumb;
    thumb.alt = external.title || "External preview";
    card.appendChild(thumb);
  }

  const content = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = external.title || "External link";
  const desc = document.createElement("p");
  desc.textContent = external.description || "";
  const url = document.createElement("span");
  // Since external.uri has been validated as absolute URL, parse it safely
  try {
    const host = new URL(external.uri).hostname;
    url.textContent = host;
  } catch (error) {
    // Fallback to showing full URI if parsing fails
    url.textContent = external.uri;
  }

  content.appendChild(title);
  content.appendChild(desc);
  content.appendChild(url);
  card.appendChild(content);

  container.appendChild(card);
};

const buildPostUrl = (record) => {
  const handle = record?.author?.handle;
  const uri = record?.uri;
  if (!handle || !uri) {
    return null;
  }
  const rkey = uri.split("/").pop();
  if (!rkey) {
    return null;
  }
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
};

const buildPostUrlFromUri = (uri) => {
  if (!uri) {
    return null;
  }
  const parts = uri.split("/");
  const rkey = parts[parts.length - 1];
  const did = parts[2];
  if (!rkey || !did) {
    return null;
  }
  return `https://bsky.app/profile/${did}/post/${rkey}`;
};

const renderQuotedPost = (record, container) => {
  if (!record) {
    return;
  }

  if (record.$type?.includes("viewNotFound")) {
    const missing = document.createElement("div");
    missing.className = "quote-card quote-unavailable";
    missing.textContent = "Quoted post unavailable.";
    container.appendChild(missing);
    return;
  }

  if (record.$type?.includes("viewBlocked")) {
    const blocked = document.createElement("div");
    blocked.className = "quote-card quote-unavailable";
    blocked.textContent = "Quoted post blocked.";
    container.appendChild(blocked);
    return;
  }

  const cardTag = buildPostUrl(record) ? "a" : "div";
  const quoteCard = document.createElement(cardTag);
  quoteCard.className = "quote-card";
  if (cardTag === "a") {
    quoteCard.href = buildPostUrl(record);
    quoteCard.target = "_blank";
    quoteCard.rel = "noopener noreferrer";
  }

  const meta = document.createElement("div");
  meta.className = "quote-meta";
  const avatar = document.createElement("img");
  avatar.className = "quote-avatar";
  avatar.src = record.author?.avatar || DEFAULT_AVATAR;
  avatar.alt = record.author?.displayName || record.author?.handle || "User avatar";
  const author = document.createElement("div");
  author.className = "quote-author";
  author.textContent = record.author?.displayName || "Unknown";
  const handle = document.createElement("span");
  handle.className = "quote-handle";
  handle.textContent = record.author?.handle ? `@${record.author.handle}` : "@unknown";
  const date = document.createElement("span");
  date.className = "quote-date";
  date.textContent = formatDate(record.value?.createdAt);

  meta.appendChild(avatar);
  meta.appendChild(author);
  meta.appendChild(handle);
  meta.appendChild(date);

  const text = document.createElement("div");
  text.className = "quote-text";
  renderPostText(text, record.value?.text || "", record.value?.facets || []);

  quoteCard.appendChild(meta);
  if (record.value?.text) {
    quoteCard.appendChild(text);
  }

  if (record.embeds?.length) {
    const nested = document.createElement("div");
    nested.className = "quote-embed";
    renderEmbed(record.embeds[0], nested);
    quoteCard.appendChild(nested);
  }

  container.appendChild(quoteCard);
};

const extractQuotedRecord = (embed) => {
  if (!embed) {
    return null;
  }

  if (embed.$type?.includes("recordWithMedia")) {
    return embed.record?.record || embed.record || null;
  }

  if (embed.$type?.includes("record")) {
    return embed.record || embed.record?.record || null;
  }

  return null;
};

const renderEmbed = (embed, container) => {
  if (!embed) {
    return;
  }
  const images = embed.images || embed.media?.images;
  const external = embed.external || embed.media?.external || embed.record?.external;
  const video =
    embed.video ||
    (embed.media?.$type?.includes("video") ? embed.media : null) ||
    (embed.$type?.includes("video") ? embed : null);
  const record = extractQuotedRecord(embed);

  renderImages(images, container);
  renderExternalCard(external, container);
  renderVideo(video, container);
  renderQuotedPost(record, container);
};

const renderReplyContext = (item, container) => {
  container.innerHTML = "";
  container.style.display = "none";
  const parent = item.reply?.parent;
  if (!parent) {
    return;
  }
  container.style.display = "block";

  const label = document.createElement("div");
  label.className = "thread-label";
  label.textContent = "Replying to";
  const text = document.createElement("div");
  text.className = "thread-text";

  if (parent.$type?.includes("viewNotFound")) {
    text.textContent = "Original post unavailable.";
  } else if (parent.$type?.includes("viewBlocked")) {
    text.textContent = "Original post blocked.";
  } else {
    const author = parent.author?.displayName || parent.author?.handle || "Unknown";
    const snippet = truncateText(parent.record?.text || "", 160);
    text.textContent = `${author}: ${snippet}`;
  }

  container.appendChild(label);
  container.appendChild(text);
};

const fetchThread = async (uri) => {
  if (!state.token) {
    throw new Error("Please sign in to view threads.");
  }
  const response = await fetch(
    `${API_BASE}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}`,
    {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Unable to load the thread. Please try again.");
  }

  return response.json();
};

const createThreadItem = (node, depth = 0) => {
  if (!node || !node.post) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "thread-item";
  if (depth > 0) {
    wrapper.classList.add(`thread-indent-${Math.min(depth, 3)}`);
  }

  const avatar = document.createElement("img");
  avatar.className = "thread-avatar";
  avatar.src = node.post.author?.avatar || DEFAULT_AVATAR;
  avatar.alt = node.post.author?.displayName || node.post.author?.handle || "User avatar";

  const body = document.createElement("div");
  const meta = document.createElement("div");
  meta.className = "thread-meta";
  const author = document.createElement("span");
  author.textContent = node.post.author?.displayName || "Unknown";
  const handle = document.createElement("span");
  handle.className = "thread-handle";
  handle.textContent = node.post.author?.handle
    ? `@${node.post.author.handle}`
    : "@unknown";
  const date = document.createElement("span");
  date.className = "thread-date";
  date.textContent = formatDate(node.post.record?.createdAt);

  meta.appendChild(author);
  meta.appendChild(handle);
  meta.appendChild(date);

  const text = document.createElement("div");
  text.className = "thread-text";
  renderPostText(text, node.post.record?.text || "", node.post.record?.facets || []);

  body.appendChild(meta);
  body.appendChild(text);

  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  return wrapper;
};

const appendThreadNodes = (container, node, depth = 0, maxDepth = 3) => {
  if (!node || depth > maxDepth) {
    return;
  }

  const text = node.post?.record?.text || "";
  if (state.hidePacers && containsPacersSpoiler(text)) {
    const hidden = document.createElement("div");
    hidden.className = "thread-muted";
    hidden.textContent = "Spoiler hidden in thread.";
    container.appendChild(hidden);
    return;
  }

  const item = createThreadItem(node, depth);
  if (item) {
    container.appendChild(item);
  }

  const replies = node.replies || [];
  replies.forEach((reply) => appendThreadNodes(container, reply, depth + 1, maxDepth));
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

    const avatar = clone.querySelector(".post-avatar");
    avatar.src = author.avatar || DEFAULT_AVATAR;
    avatar.alt = author.displayName || author.handle || "User avatar";

    const repostMeta = clone.querySelector(".repost-meta");
    if (repostMeta) {
      const reason = item.reason;
      if (reason?.$type?.includes("reasonRepost") && reason.by?.handle) {
        repostMeta.textContent = `Reposted by @${reason.by.handle}`;
        repostMeta.classList.remove("is-hidden");
      } else {
        repostMeta.textContent = "";
        repostMeta.classList.add("is-hidden");
      }
    }

    clone.querySelector(".post-author").textContent = author.displayName || "Unknown";
    clone.querySelector(".post-handle").textContent = `@${author.handle || "unknown"}`;
    clone.querySelector(".post-date").textContent = formatDate(record.createdAt);

    const threadContext = clone.querySelector(".thread-context");
    renderReplyContext(item, threadContext);

    const textContainer = clone.querySelector(".post-text");
    renderPostText(textContainer, record.text || "", record.facets || []);

    const embedContainer = clone.querySelector(".post-embed");
    renderEmbed(post.embed, embedContainer);

    const actionCounts = {
      reply: post.replyCount || 0,
      repost: post.repostCount || 0,
      like: post.likeCount || 0,
    };
    Object.entries(actionCounts).forEach(([key, value]) => {
      const countNode = clone.querySelector(`.action-count[data-count="${key}"]`);
      if (countNode) {
        countNode.textContent = value;
      }
    });

    const likeButton = clone.querySelector('.post-action[data-action="like"]');
    if (likeButton && post.viewer?.like) {
      likeButton.classList.add("is-active");
    }
    const repostButton = clone.querySelector('.post-action[data-action="repost"]');
    if (repostButton && post.viewer?.repost) {
      repostButton.classList.add("is-active");
    }
    const menuButton = clone.querySelector(".post-menu");
    if (menuButton) {
      menuButton.dataset.uri = post.uri || "";
      menuButton.dataset.rkey = post.uri?.split("/").pop() || "";
    }
    const menuPanel = clone.querySelector(".post-menu-panel");
    if (menuPanel) {
      menuPanel.dataset.uri = post.uri || "";
      menuPanel.dataset.rkey = post.uri?.split("/").pop() || "";
    }

    const postElement = clone.querySelector(".post");
    postElement.dataset.uri = post.uri || "";
    postElement.dataset.cid = post.cid || "";
    postElement.dataset.threadLoaded = "false";

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
  return payload;
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

const uploadImage = async (file) => {
  if (!state.token) {
    throw new Error("Please sign in before uploading images.");
  }
  const response = await fetch(`${API_BASE}/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error("Unable to upload the image.");
  }

  const payload = await response.json();
  return payload.blob;
};

const fetchProfile = async (handle) => {
  const response = await fetch(
    `${API_BASE}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
    {
      headers: state.token
        ? {
            Authorization: `Bearer ${state.token}`,
          }
        : {},
    },
  );

  if (!response.ok) {
    throw new Error("Unable to load profile details.");
  }

  return response.json();
};

const fetchNotifications = async () => {
  if (!state.token) {
    return { notifications: [], seenAt: null };
  }
  const response = await fetch(`${API_BASE}/app.bsky.notification.listNotifications`, {
    headers: {
      Authorization: `Bearer ${state.token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load notifications. Please try again.");
  }

  const payload = await response.json();
  return {
    notifications: payload.notifications || [],
    seenAt: payload.seenAt || null,
  };
};

const updateNotificationsSeen = async () => {
  if (!state.token) {
    return;
  }
  await fetch(`${API_BASE}/app.bsky.notification.updateSeen`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ seenAt: new Date().toISOString() }),
  });
};

const createRecord = async (collection, record) => {
  if (!state.token || !state.session?.did) {
    throw new Error("Please sign in before posting or reacting.");
  }
  const response = await fetch(`${API_BASE}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({
      repo: state.session.did,
      collection,
      record,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to update the timeline. Please try again.");
  }

  return response.json();
};

const deleteRecord = async (collection, rkey) => {
  if (!state.token || !state.session?.did) {
    throw new Error("Please sign in before deleting posts.");
  }
  const response = await fetch(`${API_BASE}/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({
      repo: state.session.did,
      collection,
      rkey,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to delete the post.");
  }

  return response.json();
};

const refreshTimeline = async () => {
  if (!state.token) {
    return;
  }
  const feed = await fetchTimeline(state.token, state.limit);
  state.feed = feed;
  const filtered = filterTimeline(feed, state.hidePacers);
  renderPosts(filtered);
};

const updateNotificationsPill = (notifications, seenAt) => {
  if (!notificationsPill) {
    return;
  }
  const unread = notifications.filter((item) => {
    if (typeof item.isRead === "boolean") {
      return item.isRead === false;
    }
    if (seenAt && item.indexedAt) {
      return new Date(item.indexedAt) > new Date(seenAt);
    }
    return false;
  }).length;
  notificationsPill.textContent = unread;
};

const renderNotifications = (notifications) => {
  notificationsList.innerHTML = "";
  if (notifications.length === 0) {
    renderMessage(notificationsList, "empty", "No notifications yet.");
    return;
  }

  notifications.forEach((notification) => {
    const item = document.createElement("div");
    item.className = "notification-item";
    if (notification.isRead === false) {
      item.classList.add("is-unread");
    }

    const avatar = document.createElement("img");
    avatar.className = "post-avatar";
    avatar.src = notification.author?.avatar || DEFAULT_AVATAR;
    avatar.alt =
      notification.author?.displayName || notification.author?.handle || "User avatar";

    const body = document.createElement("div");
    body.className = "notification-body";
    const meta = document.createElement("div");
    meta.className = "notification-meta";
    const author = document.createElement("strong");
    author.textContent = notification.author?.displayName || "Unknown";
    const handle = document.createElement("span");
    handle.textContent = notification.author?.handle
      ? `@${notification.author.handle}`
      : "@unknown";
    const reason = document.createElement("span");
    const reasonMap = {
      like: "liked",
      reply: "replied",
      repost: "reposted",
      mention: "mentioned you",
      follow: "followed you",
      quote: "quoted",
    };
    reason.textContent = reasonMap[notification.reason] || "activity";
    const date = document.createElement("span");
    date.textContent = formatDate(notification.indexedAt);

    meta.appendChild(author);
    meta.appendChild(handle);
    meta.appendChild(reason);
    meta.appendChild(date);

    const text = document.createElement("p");
    const recordText = notification.record?.text || "";
    if (recordText) {
      text.textContent = truncateText(recordText, 180);
    } else {
      const target = notification.reasonSubject ? "your post" : "your profile";
      const fallbackMap = {
        liked: "Liked",
        replied: "Replied to",
        reposted: "Reposted",
        "mentioned you": "Mentioned you in",
        "followed you": "Followed you",
        quoted: "Quoted",
        activity: "Activity on",
      };
      const prefix = fallbackMap[reason.textContent] || "Activity on";
      const suffix = notification.reasonSubject ? "your post." : "your profile.";
      if (reason.textContent === "followed you") {
        text.textContent = "Followed you.";
      } else {
        text.textContent = `${prefix} ${suffix}`;
      }
    }

    body.appendChild(meta);
    body.appendChild(text);

    const link = buildPostUrlFromUri(notification.reasonSubject);
    if (link) {
      const linkEl = document.createElement("a");
      linkEl.href = link;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = "View post";
      linkEl.className = "thread-muted";
      body.appendChild(linkEl);
    }

    item.appendChild(avatar);
    item.appendChild(body);
    notificationsList.appendChild(item);
  });
};

const refreshNotifications = async () => {
  if (!state.token) {
    return;
  }
  const payload = await fetchNotifications();
  state.notifications = payload.notifications;
  state.notificationsSeenAt = payload.seenAt;
  updateNotificationsPill(payload.notifications, payload.seenAt);
  if (state.view === "notifications") {
    renderNotifications(payload.notifications);
  }
};

const extractSpoilerText = (item) => {
  const post = item.post || {};
  const record = post.record || {};
  const replyParent = item.reply?.parent;
  const quoted = extractQuotedRecord(post.embed);
  const texts = [
    record.text,
    replyParent?.record?.text,
    quoted?.value?.text,
  ].filter(Boolean);
  return texts.join(" ");
};

const filterTimeline = (feed, hidePacers) => {
  const shouldIncludeReply = (item) => {
    if (!item.reply?.parent) {
      return true;
    }
    const reason = item.reason;
    if (reason?.$type?.includes("reasonRepost") && reason.by?.viewer?.following) {
      return true;
    }
    const parentAuthor = item.reply.parent.author;
    if (!parentAuthor) {
      return false;
    }
    if (parentAuthor.handle && parentAuthor.handle === state.handle) {
      return true;
    }
    return parentAuthor.viewer?.following === true;
  };

  if (!hidePacers) {
    return feed.filter(shouldIncludeReply);
  }

  return feed.filter((item) => {
    if (!shouldIncludeReply(item)) {
      return false;
    }
    const authorHandle = item.post?.author?.handle || "";
    if (PACERS_BLOCKED_HANDLES.has(authorHandle)) {
      return false;
    }
    const text = extractSpoilerText(item);
    return !containsPacersSpoiler(text);
  });
};

timeline.addEventListener("click", async (event) => {
  const menuButton = event.target.closest(".post-menu");
  const menuActionButton = event.target.closest("[data-menu-action]");
  const quoteActionButton = event.target.closest("[data-quote-action]");
  const actionButton = event.target.closest(".post-action");
  const postElement = event.target.closest(".post");
  if (!postElement) {
    return;
  }

  const uri = postElement.dataset.uri;
  const cid = postElement.dataset.cid;
  const threadContainer = postElement.querySelector(".thread-expand");
  const menuPanel = postElement.querySelector(".post-menu-panel");
  const quoteComposer = postElement.querySelector(".quote-composer");

  try {
    if (menuButton) {
      document.querySelectorAll(".post-menu-panel.is-open").forEach((panel) => {
        if (panel !== menuPanel) {
          panel.classList.remove("is-open");
        }
      });
      menuPanel?.classList.toggle("is-open");
      return;
    }

    if (menuActionButton) {
      const action = menuActionButton.dataset.menuAction;
      if (action === "copy") {
        const link = buildPostUrlFromUri(uri);
        if (link) {
          await navigator.clipboard.writeText(link);
          setStatus("Post link copied!");
        }
      }

      if (action === "quote") {
        quoteComposer?.classList.add("is-visible");
        const textarea = quoteComposer?.querySelector("textarea");
        textarea?.focus();
      }

      if (action === "delete") {
        const rkey = menuActionButton.closest(".post-menu-panel")?.dataset.rkey;
        if (!rkey) {
          setStatus("Unable to delete this post.");
          return;
        }
        const confirmed = window.confirm("Delete this post?");
        if (!confirmed) {
          return;
        }
        await deleteRecord("app.bsky.feed.post", rkey);
        setStatus("Deleted!");
        await refreshTimeline();
      }
      menuPanel?.classList.remove("is-open");
      return;
    }

    if (quoteActionButton) {
      const action = quoteActionButton.dataset.quoteAction;
      if (!quoteComposer) {
        return;
      }
      if (action === "cancel") {
        quoteComposer.classList.remove("is-visible");
        quoteComposer.querySelector("textarea").value = "";
        return;
      }
      if (action === "post") {
        const quoteText = quoteComposer.querySelector("textarea").value.trim();
        if (!quoteText) {
          return;
        }
        await createRecord("app.bsky.feed.post", {
          text: quoteText,
          embed: {
            $type: "app.bsky.embed.record",
            record: {
              uri,
              cid,
            },
          },
          createdAt: new Date().toISOString(),
        });
        quoteComposer.classList.remove("is-visible");
        quoteComposer.querySelector("textarea").value = "";
        setStatus("Quoted!");
        await refreshTimeline();
        return;
      }
    }

    if (!actionButton) {
      return;
    }

    if (actionButton.dataset.action === "share") {
      if (uri) {
        await navigator.clipboard.writeText(uri);
        setStatus("Post link copied!");
      }
      return;
    }

    if (actionButton.dataset.action === "like") {
      await createRecord("app.bsky.feed.like", {
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      });
      actionButton.classList.add("is-active");
      const count = actionButton.querySelector('.action-count[data-count="like"]');
      if (count) {
        count.textContent = Number(count.textContent || 0) + 1;
      }
      setStatus("Liked!");
    }

    if (actionButton.dataset.action === "repost") {
      await createRecord("app.bsky.feed.repost", {
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      });
      actionButton.classList.add("is-active");
      const count = actionButton.querySelector('.action-count[data-count="repost"]');
      if (count) {
        count.textContent = Number(count.textContent || 0) + 1;
      }
      setStatus("Reposted!");
    }

    if (actionButton.dataset.action === "reply") {
      const replyText = window.prompt("Reply:", "");
      if (!replyText) {
        return;
      }
      await createRecord("app.bsky.feed.post", {
        text: replyText,
        reply: {
          root: { uri, cid },
          parent: { uri, cid },
        },
        createdAt: new Date().toISOString(),
      });
      const count = actionButton.querySelector('.action-count[data-count="reply"]');
      if (count) {
        count.textContent = Number(count.textContent || 0) + 1;
      }
      setStatus("Reply posted!");
    }

    if (actionButton.dataset.action === "thread") {
      if (!uri || !threadContainer) {
        return;
      }
      if (threadContainer.classList.contains("is-visible")) {
        threadContainer.classList.remove("is-visible");
        return;
      }
      threadContainer.innerHTML = "";
      threadContainer.classList.add("is-visible");
      const payload = await fetchThread(uri);
      const root = payload.thread;
      appendThreadNodes(threadContainer, root, 0, 3);
      setStatus("Thread loaded");
    }
  } catch (error) {
    showError(error.message);
  }
});

composerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(composerForm);
  const text = formData.get("postText").trim();
  if (!text) {
    return;
  }

  try {
    const record = {
      text,
      createdAt: new Date().toISOString(),
    };

    if (state.composerImage) {
      const blob = await uploadImage(state.composerImage);
      record.embed = {
        $type: "app.bsky.embed.images",
        images: [
          {
            alt: "",
            image: blob,
          },
        ],
      };
    }

    await createRecord("app.bsky.feed.post", record);
    composerForm.reset();
    state.composerImage = null;
    if (photoInput) {
      photoInput.value = "";
    }
    if (photoName) {
      photoName.textContent = "";
    }
    setStatus("Posted!");
    state.limit = Number(form.querySelector('input[name="limit"]').value) || 30;
    await refreshTimeline();
  } catch (error) {
    showError(error.message);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Loading timeline...");
  timeline.innerHTML = "";

  const formData = new FormData(form);
  const handle = formData.get("handle").trim();
  const appPassword = formData.get("appPassword").trim();
  const limit = Number(formData.get("limit")) || 30;

  if (!handle || !appPassword) {
    showError("Please enter your handle and app password.");
    setStatus("Waiting for sign-in");
    return;
  }

  try {
    state.handle = handle;
    state.limit = limit;
    state.session = await createSession(handle, appPassword);
    state.token = state.session.accessJwt;
    const profile = await fetchProfile(handle);
    updateComposerAvatar(profile.avatar);
    const feed = await fetchTimeline(state.token, limit);
    state.feed = feed;
    const filtered = filterTimeline(feed, state.hidePacers);
    renderPosts(filtered);
    setStatus(state.hidePacers ? "Spoilers hidden" : "Showing all posts");
    await refreshNotifications();
  } catch (error) {
    showError(error.message);
    setStatus("Sign-in error");
  }
});

pacersToggle?.addEventListener("click", () => {
  state.hidePacers = !state.hidePacers;
  localStorage.setItem(STORAGE_KEY, String(state.hidePacers));
  updatePacersUI();
  if (state.feed.length) {
    const filtered = filterTimeline(state.feed, state.hidePacers);
    renderPosts(filtered);
  }
  if (state.token) {
    setStatus(state.hidePacers ? "Spoilers hidden" : "Showing all posts");
  }
});

refreshButton?.addEventListener("click", async () => {
  if (!state.token) {
    setStatus("Waiting for sign-in");
    return;
  }
  try {
    setStatus("Refreshing...");
    await refreshTimeline();
    await refreshNotifications();
    setStatus(state.hidePacers ? "Spoilers hidden" : "Showing all posts");
  } catch (error) {
    showError(error.message);
    setStatus("Refresh error");
  }
});

tabTimeline?.addEventListener("click", () => {
  state.view = "timeline";
  tabTimeline.classList.add("is-active");
  tabNotifications.classList.remove("is-active");
  document.querySelector(".composer")?.classList.remove("is-hidden");
  document.querySelector(".timeline")?.classList.remove("is-hidden");
  notificationsSection?.classList.remove("is-visible");
});

tabNotifications?.addEventListener("click", async () => {
  state.view = "notifications";
  tabNotifications.classList.add("is-active");
  tabTimeline.classList.remove("is-active");
  document.querySelector(".composer")?.classList.add("is-hidden");
  document.querySelector(".timeline")?.classList.add("is-hidden");
  notificationsSection?.classList.add("is-visible");
  if (state.notifications.length === 0) {
    try {
      await refreshNotifications();
    } catch (error) {
      showNotificationError(error.message);
    }
  } else {
    renderNotifications(state.notifications);
  }
});

markReadButton?.addEventListener("click", async () => {
  try {
    const seenAt = new Date().toISOString();
    await updateNotificationsSeen();
    state.notifications = state.notifications.map((item) => ({
      ...item,
      isRead: true,
    }));
    state.notificationsSeenAt = seenAt;
    updateNotificationsPill(state.notifications, seenAt);
    renderNotifications(state.notifications);
    setStatus("Notifications marked as read");
  } catch (error) {
    showError(error.message);
  }
});

updatePacersUI();
updateComposerAvatar();

photoButton?.addEventListener("click", () => {
  photoInput?.click();
});

photoInput?.addEventListener("change", () => {
  const [file] = photoInput.files || [];
  state.composerImage = file || null;
  if (photoName) {
    photoName.textContent = file ? file.name : "";
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".post-menu") || event.target.closest(".post-menu-panel")) {
    return;
  }
  document.querySelectorAll(".post-menu-panel.is-open").forEach((panel) => {
    panel.classList.remove("is-open");
  });
});
