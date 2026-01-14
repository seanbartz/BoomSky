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

const renderEmbed = (embed, container) => {
  if (!embed) {
    return;
  }
  const images = embed.images || embed.media?.images;
  const external = embed.external || embed.record?.external;

  renderImages(images, container);
  renderExternalCard(external, container);
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

    const textContainer = clone.querySelector(".post-text");
    renderPostText(textContainer, record.text || "", record.facets || []);

    const embedContainer = clone.querySelector(".post-embed");
    renderEmbed(post.embed, embedContainer);

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
    return !containsPacersSpoiler(text);
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
