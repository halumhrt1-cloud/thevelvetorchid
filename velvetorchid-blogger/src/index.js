export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(generateAndPublishPost(env));
  },
  // Allows manual testing via a browser/URL hit to the deployed Worker
  async fetch(request, env, ctx) {
    try {
      const result = await generateAndPublishPost(env);
      return new Response("Post generation triggered.\n" + JSON.stringify(result, null, 2));
    } catch (err) {
      return new Response("ERROR: " + err.message + "\n\n" + err.stack, { status: 500 });
    }
  },
};

async function generateAndPublishPost(env) {
  const GITHUB_OWNER = "halumhrt1-cloud";
  const GITHUB_REPO = "thevelvetorchid";
  const GITHUB_BRANCH = "main";
  const TOPICS_PATH = "topics.json"; // stored in the repo, not the Worker
  const BLOG_DIR = "src/content/blog";

  const ghHeaders = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "velvetorchid-blogger",
    Accept: "application/vnd.github+json",
  };

  // 1. Fetch topics.json from the repo
  const topicsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TOPICS_PATH}?ref=${GITHUB_BRANCH}`;
  const topicsRes = await fetch(topicsUrl, { headers: ghHeaders });
  if (!topicsRes.ok) {
    throw new Error(`Failed to fetch topics.json: ${topicsRes.status} ${await topicsRes.text()}`);
  }
  const topicsFile = await topicsRes.json();
  const topicsContent = JSON.parse(atob(topicsFile.content));

  if (!topicsContent.topics || topicsContent.topics.length === 0) {
    throw new Error("No topics left in queue.");
  }

  // 2. Pop the next topic off the queue
  const topic = topicsContent.topics.shift();

  // 3. Call Gemini to generate the post
  const prompt = `Write a blog post for a cozy home & plant-care lifestyle blog called "The Velvet Orchid".
Topic: "${topic}"

Requirements:
- Warm, friendly, approachable tone
- 600-900 words
- Use Markdown formatting (##, ###, bullet points where useful)
- Do NOT include a top-level # title heading, that's handled separately
- End with a short encouraging closing line

Return ONLY the Markdown body content, nothing else.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!geminiRes.ok) {
    throw new Error(`Gemini API error: ${geminiRes.status} ${await geminiRes.text()}`);
  }
  const geminiData = await geminiRes.json();
  const postBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!postBody) {
    throw new Error("Gemini returned no content.");
  }

  // 4. Build the Markdown file with frontmatter
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const frontmatter = `---
title: "${topic.replace(/"/g, '\\"')}"
description: "${topic.replace(/"/g, '\\"')} — tips and ideas from The Velvet Orchid."
pubDate: "${dateStr}"
---

`;

  const fullMarkdown = frontmatter + postBody + "\n";
  const filePath = `${BLOG_DIR}/${dateStr}-${slug}.md`;

  // 5. Commit the new post file to GitHub
  const createFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const createRes = await fetch(createFileUrl, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Auto post: ${topic}`,
      content: btoa(unescape(encodeURIComponent(fullMarkdown))),
      branch: GITHUB_BRANCH,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create post file: ${createRes.status} ${await createRes.text()}`);
  }

  // 6. Update topics.json (remove the used topic) back to GitHub
  const updateTopicsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TOPICS_PATH}`;
  const updateRes = await fetch(updateTopicsUrl, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Remove used topic: ${topic}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(topicsContent, null, 2)))),
      sha: topicsFile.sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update topics.json: ${updateRes.status} ${await updateRes.text()}`);
  }

  return { success: true, topic, filePath };
}