export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(generateAndPublishPost(env));
  },

  // Allows manual testing via a browser/URL hit to the deployed Worker
  async fetch(request, env, ctx) {
    try {
      const result = await generateAndPublishPost(env);

      return new Response(
        "Post generation triggered.\n" +
          JSON.stringify(result, null, 2)
      );
    } catch (err) {
      return new Response(
        "ERROR: " + err.message + "\n\n" + err.stack,
        { status: 500 }
      );
    }
  },
};

async function generateAndPublishPost(env) {
  const GITHUB_OWNER = "halumhrt1-cloud";
  const GITHUB_REPO = "thevelvetorchid";
  const GITHUB_BRANCH = "main";
  const TOPICS_PATH = "topics.json";
  const BLOG_DIR = "src/content/blog";

  const ghHeaders = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "velvetorchid-blogger",
    Accept: "application/vnd.github+json",
  };

  // ============================================================
  // 1. Fetch topics.json from GitHub
  // ============================================================

  const topicsUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${TOPICS_PATH}?ref=${GITHUB_BRANCH}`;

  const topicsRes = await fetch(topicsUrl, {
    headers: ghHeaders,
  });

  if (!topicsRes.ok) {
    throw new Error(
      `Failed to fetch topics.json: ${topicsRes.status} ${await topicsRes.text()}`
    );
  }

  const topicsFile = await topicsRes.json();

  const topicsContent = JSON.parse(
    atob(topicsFile.content.replace(/\n/g, ""))
  );

  if (
    !topicsContent.topics ||
    !Array.isArray(topicsContent.topics) ||
    topicsContent.topics.length === 0
  ) {
    throw new Error("No topics left in queue.");
  }

  // ============================================================
  // 2. Take the next topic from the queue
  // ============================================================

  const topic = topicsContent.topics.shift();

  // ============================================================
  // 3. Ask Gemini to generate the complete article + SEO data
  // ============================================================

  const prompt = `Write a high-quality blog post for a cozy home & plant-care lifestyle blog called "The Velvet Orchid".

Topic: "${topic}"

Return ONLY valid JSON in exactly this structure:

{
  "title": "SEO-friendly article title",
  "description": "Compelling meta description around 150-160 characters",
  "category": "One category from: Home Decor, Plant Care, Cozy Living, Seasonal Living, Gardening",
  "tags": ["tag 1", "tag 2", "tag 3", "tag 4", "tag 5"],
  "body": "Markdown article body"
}

TITLE REQUIREMENTS:
- Natural and appealing
- Clear about what the article covers
- SEO-friendly without keyword stuffing
- Do not use clickbait
- Do not add a # heading to the body

DESCRIPTION REQUIREMENTS:
- Around 150-160 characters
- Clearly summarize the article
- Naturally include the main topic
- Useful and appealing in search results
- Do not put quotation marks around the description

CATEGORY REQUIREMENTS:
- Choose exactly ONE category
- Use only one of these:
  Home Decor
  Plant Care
  Cozy Living
  Seasonal Living
  Gardening

TAG REQUIREMENTS:
- Provide exactly 5 relevant SEO tags
- Keep tags short and natural
- Use phrases people might realistically search for
- Do not stuff keywords
- Do not repeat the exact same tag

ARTICLE REQUIREMENTS:
- 700-1000 words
- Warm, friendly, approachable tone
- Practical and genuinely useful
- Write for real readers, not search engines
- Use Markdown formatting with ## and ### headings
- Use bullet points where useful
- Do NOT include a top-level # title heading
- Include a useful introduction
- Give specific practical advice
- Include a short FAQ section with 3 useful questions and answers
- End with a short encouraging closing line

QUALITY REQUIREMENTS:
- Avoid generic filler
- Avoid repeating the same ideas
- Give concrete examples and practical suggestions
- Make the article genuinely useful to someone searching for this topic
- Do not mention AI, Gemini, prompts, or content generation
- Do not include citations or external links unless naturally necessary
- Do not invent scientific claims
- Keep the article focused on the topic

Return ONLY the JSON object.
No code fences.
No explanation.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!geminiRes.ok) {
    throw new Error(
      `Gemini API error: ${geminiRes.status} ${await geminiRes.text()}`
    );
  }

  const geminiData = await geminiRes.json();

  const aiResponse =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!aiResponse) {
    throw new Error("Gemini returned no content.");
  }

  // ============================================================
  // 4. Parse Gemini JSON response
  // ============================================================

  let generated;

  try {
    generated = JSON.parse(aiResponse);
  } catch (err) {
    throw new Error(
      `Gemini returned invalid JSON: ${aiResponse}`
    );
  }

  const title = generated.title?.trim();
  const description = generated.description?.trim();
  const category = generated.category?.trim();

  const tags = Array.isArray(generated.tags)
    ? generated.tags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
    : [];

  const postBody = generated.body?.trim();

  if (!title || !description || !category || !postBody) {
    throw new Error(
      "Gemini returned incomplete article data."
    );
  }

  if (tags.length !== 5) {
    throw new Error(
      "Gemini did not return exactly 5 tags."
    );
  }

  const allowedCategories = [
    "Home Decor",
    "Plant Care",
    "Cozy Living",
    "Seasonal Living",
    "Gardening",
  ];

  if (!allowedCategories.includes(category)) {
    throw new Error(
      `Gemini returned an invalid category: ${category}`
    );
  }

  // ============================================================
  // 5. Build the Markdown file
  // ============================================================

  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const escapeYaml = (value) =>
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

  const frontmatter = `---
title: "${escapeYaml(title)}"
description: "${escapeYaml(description)}"
pubDate: "${dateStr}"
category: "${escapeYaml(category)}"
tags:
${tags.map((tag) => `  - "${escapeYaml(tag)}"`).join("\n")}
---

`;

  const fullMarkdown =
    frontmatter +
    postBody +
    "\n";

  const filePath =
    `${BLOG_DIR}/${dateStr}-${slug}.md`;

  // ============================================================
  // 6. Commit the new article to GitHub
  // ============================================================

  const createFileUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${filePath}`;

  const createRes = await fetch(createFileUrl, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Auto post: ${topic}`,
      content: btoa(
        unescape(
          encodeURIComponent(fullMarkdown)
        )
      ),
      branch: GITHUB_BRANCH,
    }),
  });

  if (!createRes.ok) {
    throw new Error(
      `Failed to create post file: ${createRes.status} ${await createRes.text()}`
    );
  }

  // ============================================================
  // 7. Remove the used topic from topics.json
  // ============================================================

  const updateTopicsUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${TOPICS_PATH}`;

  const updateRes = await fetch(updateTopicsUrl, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Remove used topic: ${topic}`,
      content: btoa(
        unescape(
          encodeURIComponent(
            JSON.stringify(topicsContent, null, 2)
          )
        )
      ),
      sha: topicsFile.sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!updateRes.ok) {
    throw new Error(
      `Failed to update topics.json: ${updateRes.status} ${await updateRes.text()}`
    );
  }

  // ============================================================
  // 8. Return result
  // ============================================================

  return {
    success: true,
    topic,
    title,
    description,
    category,
    tags,
    filePath,
  };
}