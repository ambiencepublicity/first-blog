const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

/* ---------- Site config — edit these ---------- */
const SITE = {
  name: "My Static Blog",
  url: "https://your-site.netlify.app", // ← change after your first deploy
};

/* ---------- Paths ---------- */
const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, "content", "posts");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const STATIC_DIR = path.join(ROOT, "static");
const OUT_DIR = path.join(ROOT, "dist");

/* ---------- Helpers ---------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function readingTime(markdown) {
  const words = markdown.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

/* Tiny template engine: supports {{ key }} and {{#if key}} ... {{/if}} */
function render(template, data) {
  let out = template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, block) => (data[key] ? block : "")
  );
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    data[key] != null ? String(data[key]) : ""
  );
}

function loadTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8");
}

function page(innerHtml, data) {
  return render(loadTemplate("layout.html"), {
    siteName: SITE.name,
    year: new Date().getFullYear(),
    content: innerHtml,
    ...data,
  });
}

/* ---------- Read Markdown posts ---------- */
function getPosts() {
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
      const { data: fm, content } = matter(raw);
      const slug = fm.slug || path.basename(file, path.extname(file));
      const date = fm.date ? new Date(fm.date) : fs.statSync(path.join(POSTS_DIR, file)).mtime;

      return {
        slug,
        url: `/posts/${slug}/`,
        title: fm.title || slug,
        description: fm.description || "",
        date,
        isoDate: date.toISOString(),
        dateFormatted: formatDate(date),
        featuredImage: fm.featuredImage || "",           // optional!
        featuredImageAlt: fm.featuredImageAlt || fm.title || "",
        readingTime: readingTime(content),
        html: marked.parse(content),
      };
    })
    .sort((a, b) => b.date - a.date);
}

/* ---------- Home page card (image is conditional) ---------- */
function postCard(post) {
  const image = post.featuredImage
    ? `<a class="card-image" href="${post.url}">
         <img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.featuredImageAlt)}" loading="lazy">
       </a>`
    : "";
  return `
  <article class="card">
    ${image}
    <div class="card-body">
      <h2><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
      <p class="post-meta"><time datetime="${post.isoDate}">${post.dateFormatted}</time> · ${post.readingTime}</p>
      ${post.description ? `<p class="card-description">${escapeHtml(post.description)}</p>` : ""}
    </div>
  </article>`;
}

/* ---------- Build ---------- */
function build() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const posts = getPosts();

  // Home page
  const homeInner = render(loadTemplate("home.html"), {
    postList: posts.map(postCard).join("\n"),
  });
  fs.writeFileSync(
    path.join(OUT_DIR, "index.html"),
    page(homeInner, {
      title: SITE.name,
      description: "A standard blog built with a tiny static site generator.",
    })
  );

  // One page per post → /posts/<slug>/
  for (const post of posts) {
    const inner = render(loadTemplate("post.html"), { ...post, content: post.html });
    const html = page(inner, {
      title: `${post.title} — ${SITE.name}`,
      description: post.description,
      featuredImageAbs: post.featuredImage
        ? new URL(post.featuredImage, SITE.url).href   // og:image needs absolute URL
        : "",
    });
    const dir = path.join(OUT_DIR, "posts", post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }

  // 404 page (Netlify serves this automatically)
  fs.writeFileSync(
    path.join(OUT_DIR, "404.html"),
    page(`<h1>Page not found</h1><p><a href="/">← Back to home</a></p>`, {
      title: `Not found — ${SITE.name}`,
      description: "",
    })
  );

  // Static assets (CSS, images…)
  copyDir(STATIC_DIR, OUT_DIR);

  console.log(`✅ Built ${posts.length} post(s) → dist/`);
}

build();