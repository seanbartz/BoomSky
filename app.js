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
const DEFAULT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#dbe2f8"/><path d="M40 42c8.8 0 16-7.2 16-16S48.8 10 40 10s-16 7.2-16 16 7.2 16 16 16zm0 8c-13.3 0-24 10.7-24 24h48c0-13.3-10.7-24-24-24z" fill="#8aa0d6"/></svg>',
)}`;

const form = document.getElementById("credentials-form");
const timeline = document.getElementById("timeline");
const statusPill = document.getElementById("status-pill");
const postTemplate = document.getElementById("post-template");
const composerForm = document.getElementById("composer-form");
let currentHandle = "";
let currentSession = null;
let currentToken = "";

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

const renderPostText = (container, text, facets) => {
  container.textContent = "";
  const segments = buildTextSegments(text, facets) || linkifyText(text);
  segments.forEach((segment) => {
    if (segment.link) {
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
    const img = document.createElement("img");
    img.src = image.thumb || image.fullsize || "";
    img.alt = image.alt || "Post image";
    media.appendChild(img);
  });
  container.appendChild(media);
};

const renderExternalCard = (external, container) => {
  if (!external) {
    return;
  }
  const card = document.createElement("a");
  card.className = "link-card";
  card.href = external.uri;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  if (external.thumb) {
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
  let host = external.uri;
  try {
    host = new URL(external.uri).hostname;
  } catch (error) {
    host = external.uri;
  }
  url.textContent = host;

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
  const record = extractQuotedRecord(embed);

  renderImages(images, container);
  renderExternalCard(external, container);
  renderQuotedPost(record, container);
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

    clone.querySelector(".post-author").textContent = author.displayName || "Unknown";
    clone.querySelector(".post-handle").textContent = `@${author.handle || "unknown"}`;
    clone.querySelector(".post-date").textContent = formatDate(record.createdAt);

    const reason = item.reason;
    const reasonWrap = clone.querySelector(".post-reason");
    if (reason?.$type?.includes("reasonRepost")) {
      const by = reason.by || {};
      reasonWrap.hidden = false;
      reasonWrap.innerHTML = "";
      const reasonAvatar = document.createElement("img");
      reasonAvatar.src = by.avatar || DEFAULT_AVATAR;
      reasonAvatar.alt = by.displayName || by.handle || "Reposter avatar";
      const label = document.createElement("span");
      const name = by.displayName || by.handle || "Someone";
      const handle = by.handle ? `(@${by.handle})` : "";
      label.textContent = `Reposted by ${name} ${handle}`.trim();
      reasonWrap.appendChild(reasonAvatar);
      reasonWrap.appendChild(label);
    }

    const textContainer = clone.querySelector(".post-text");
    renderPostText(textContainer, record.text || "", record.facets || []);

    const embedContainer = clone.querySelector(".post-embed");
    renderEmbed(post.embed, embedContainer);

    const postElement = clone.querySelector(".post");
    postElement.dataset.uri = post.uri || "";
    postElement.dataset.cid = post.cid || "";
    postElement.dataset.rootUri = item.reply?.root?.uri || post.uri || "";
    postElement.dataset.rootCid = item.reply?.root?.cid || post.cid || "";

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

const createRecord = async (collection, record) => {
  if (!currentToken || !currentSession?.did) {
    throw new Error("Please sign in before posting or reacting.");
  }
  const response = await fetch(`${API_BASE}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentToken}`,
    },
    body: JSON.stringify({
      repo: currentSession.did,
      collection,
      record,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to update the timeline. Please try again.");
  }

  return response.json();
};

const refreshTimeline = async (limit, hidePacers) => {
  if (!currentToken) {
    return;
  }
  const feed = await fetchTimeline(currentToken, limit);
  const filtered = filterTimeline(feed, hidePacers);
  renderPosts(filtered);
};

const filterTimeline = (feed, hidePacers) => {
  const shouldIncludeReply = (item) => {
    if (!item.reply?.parent) {
      return true;
    }
    const parentAuthor = item.reply.parent.author;
    if (!parentAuthor) {
      return false;
    }
    if (parentAuthor.handle && parentAuthor.handle === currentHandle) {
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
    const text = item.post?.record?.text || "";
    return !containsPacersSpoiler(text);
  });
};

timeline.addEventListener("click", async (event) => {
  const actionButton = event.target.closest(".post-action");
  if (!actionButton) {
    return;
  }

  const postElement = actionButton.closest(".post");
  if (!postElement) {
    return;
  }

  const uri = postElement.dataset.uri;
  const cid = postElement.dataset.cid;

  try {
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
      setStatus("Liked!");
    }

    if (actionButton.dataset.action === "repost") {
      await createRecord("app.bsky.feed.repost", {
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      });
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
          root: {
            uri: postElement.dataset.rootUri || uri,
            cid: postElement.dataset.rootCid || cid,
          },
          parent: { uri, cid },
        },
        createdAt: new Date().toISOString(),
      });
      setStatus("Reply posted!");
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
    await createRecord("app.bsky.feed.post", {
      text,
      createdAt: new Date().toISOString(),
    });
    composerForm.reset();
    setStatus("Posted!");
    const limit = Number(form.querySelector('input[name="limit"]').value) || 30;
    const caughtUp = form.querySelector('input[name="caughtUp"][value="yes"]').checked;
    await refreshTimeline(limit, !caughtUp);
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
  const caughtUp = formData.get("caughtUp") === "yes";

  if (!handle || !appPassword) {
    showError("Please enter your handle and app password.");
    setStatus("Waiting for sign-in");
    return;
  }

  try {
    currentHandle = handle;
    currentSession = await createSession(handle, appPassword);
    currentToken = currentSession.accessJwt;
    const feed = await fetchTimeline(currentToken, limit);
    const filtered = filterTimeline(feed, !caughtUp);
    renderPosts(filtered);
    setStatus(caughtUp ? "Showing all posts" : "Spoilers hidden");
  } catch (error) {
    showError(error.message);
    setStatus("Sign-in error");
  }
});
