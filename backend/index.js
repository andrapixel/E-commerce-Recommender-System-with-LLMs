const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json());

// Load data
let users = require("./data/users.json");
const products = require("./data/emag_products.json");
let interactions = require("./data/interactions.json");

const usersPath = path.join(__dirname, "data", "users.json");
const interactionsPath = path.join(__dirname, "data", "interactions.json");
const explanationFeedbackPath = path.join(
  __dirname,
  "data",
  "explanation_feedback.json"
);

let explanationFeedback = [];
try {
  explanationFeedback = require("./data/explanation_feedback.json");
} catch (e) {
  explanationFeedback = [];
}

// ====================== HELPER FUNCTIONS ========================

// Normalization method
function normalize(value, min, max) {
  if (!isFinite(value) || !isFinite(min) || !isFinite(max) || min === max) {
    return 0;
  }
  return (value - min) / (max - min);
}

// Cosine similarity for vectors
function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Build a "user embedding" by averaging embeddings of liked products
function computeUserEmbedding(likedProducts) {
  if (!likedProducts || likedProducts.length === 0) {
    return null;
  }

  const dim = productEmbeddings.values().next().value?.length;
  if (!dim) return null;

  const sum = new Array(dim).fill(0);
  let count = 0;

  for (const p of likedProducts) {
    const emb = productEmbeddings.get(p.id);
    if (!emb) continue;
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i];
    }
    count++;
  }

  if (count === 0) return null;

  for (let i = 0; i < dim; i++) {
    sum[i] /= count;
  }

  return sum;
}

// Basic scoring: overlapping tags + category bonus + brand bonus
function scoreProductForUser(product, likedProducts, userEmbedding) {
  if (!likedProducts || likedProducts.length === 0) {
    return 0;
  }

  // Content-based part: tags + category
  const likedTags = new Set(likedProducts.flatMap((p) => p.tags || []));
  const likedCategories = new Set(likedProducts.map((p) => p.category));

  const overlap = (product.tags || []).filter((t) => likedTags.has(t)).length;
  const categoryBonus = likedCategories.has(product.category) ? 1 : 0;

  const contentScore = overlap + categoryBonus;

  // Vector-based part: cosine similarity between user embedding and product embedding
  let vectorScore = 0;
  if (userEmbedding) {
    const productEmbedding = productEmbeddings.get(product.id);
    if (productEmbedding) {
      vectorScore = cosineSimilarity(userEmbedding, productEmbedding); // in [0,1]
    }
  }

  // Combine them
  const alpha = 2.0; // weight for vector similarity
  const finalScore = contentScore + alpha * vectorScore;

  return finalScore;
}

// Methods to persist data back to files
function saveUsers() {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf-8");
}

function saveInteractions() {
  fs.writeFileSync(
    interactionsPath,
    JSON.stringify(interactions, null, 2),
    "utf-8"
  );
}

function saveExplanationFeedback() {
  fs.writeFileSync(
    explanationFeedbackPath,
    JSON.stringify(explanationFeedback, null, 2),
    "utf-8"
  );
}

// Methods to get user-specific data
function getUserInteractions(userId) {
  return interactions.filter((i) => i.userId === userId);
}

function getUserLikedProducts(userId) {
  const userInts = getUserInteractions(userId);
  const likedProductIds = userInts.map((i) => i.productId);
  return products.filter((p) => likedProductIds.includes(p.id));
}

function getUserWishlistProducts(userId) {
  const wishlistIds = new Set(
    interactions
      .filter((i) => i.userId === userId && i.event === "wishlist")
      .map((i) => i.productId)
  );
  return products.filter((p) => wishlistIds.has(p.id));
}

function getUserCartProducts(userId) {
  const lastEventPerProduct = new Map();

  for (const inter of interactions) {
    if (inter.userId !== userId) continue;
    if (!["add_to_cart", "purchase"].includes(inter.event)) continue;

    // Because interactions are appended over time, last occurrence wins
    lastEventPerProduct.set(inter.productId, inter.event);
  }

  const cartIds = [];
  for (const [productId, event] of lastEventPerProduct.entries()) {
    if (event === "add_to_cart") {
      cartIds.push(productId);
    }
  }

  return products.filter((p) => cartIds.includes(p.id));
}

function getUserOrdersProducts(userId) {
  const purchasedIds = new Set(
    interactions
      .filter((i) => i.userId === userId && i.event === "purchase")
      .map((i) => i.productId)
  );
  return products.filter((p) => purchasedIds.has(p.id));
}

// ====================== EMBEDDINGS / "VECTOR DB" SETUP ========================

// Build a small vocabulary from the most frequent tags
const tagCounts = {};
for (const p of products) {
  for (const t of p.tags || []) {
    const tag = t.toLowerCase();
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
}

// Take top N tags as our "dimensions"
const TOP_TAGS = 50;
const sortedTags = Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_TAGS)
  .map(([tag]) => tag);
const tagIndex = new Map(sortedTags.map((tag, idx) => [tag, idx]));

// Build a category index (one-hot)
const categories = Array.from(new Set(products.map((p) => p.category)));
const categoryIndex = new Map(categories.map((cat, idx) => [cat, idx]));

// Build product embeddings: [tags..., categories..., normalizedPrice, normalizedRating]
const productEmbeddings = new Map();

// Get min/max for price and rating for normalization
let minPrice = Infinity;
let maxPrice = -Infinity;
let minRating = Infinity;
let maxRating = -Infinity;

for (const p of products) {
  if (typeof p.price === "number") {
    minPrice = Math.min(minPrice, p.price);
    maxPrice = Math.max(maxPrice, p.price);
  }
  if (typeof p.rating === "number") {
    minRating = Math.min(minRating, p.rating);
    maxRating = Math.max(maxRating, p.rating);
  }
}

// Create the embedding vector for each product
for (const p of products) {
  const tagVector = new Array(sortedTags.length).fill(0);
  for (const t of p.tags || []) {
    const tag = t.toLowerCase();
    const idx = tagIndex.get(tag);
    if (idx !== undefined) {
      tagVector[idx] = 1;
    }
  }

  // Category vector
  const catVector = new Array(categories.length).fill(0);
  const cIdx = categoryIndex.get(p.category);
  if (cIdx !== undefined) {
    catVector[cIdx] = 1;
  }

  // Normalized numeric features
  const priceNorm = normalize(
    typeof p.price === "number" ? p.price : 0,
    minPrice,
    maxPrice
  );
  const ratingNorm = normalize(
    typeof p.rating === "number" ? p.rating : 0,
    minRating,
    maxRating
  );

  const embedding = [...tagVector, ...catVector, priceNorm, ratingNorm];
  productEmbeddings.set(p.id, embedding);
}

// ====================== BASE RECOMMENDER (NO LLM) ========================

function getRecommendationsForUser(userId, k = 5) {
  const likedProducts = getUserLikedProducts(userId);

  if (!likedProducts || likedProducts.length === 0) {
    // No history: fallback to "most popular" (here: just first K)
    return products.slice(0, k).map((p) => ({ ...p, score: 0 }));
  }

  const likedIds = new Set(likedProducts.map((p) => p.id));
  const userEmbedding = computeUserEmbedding(likedProducts);
  const scored = products
    .filter((p) => !likedIds.has(p.id)) // Don't recommend already seen
    .map((p) => ({
      ...p,
      score: scoreProductForUser(p, likedProducts, userEmbedding),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}

// ======================= EXPRESS API ENDPOINTS =======================

// POST /login  { "email": "user@example.com" }
app.post("/login", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find(
    (u) => u.email && u.email.toLowerCase() === normalizedEmail
  );

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({
    message: "Logged in",
    user,
  });
});

// POST /signup  { "name": "Firstname Lastname", "email": "user@example.com" }
app.post("/signup", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Missing name or email" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = users.find(
    (u) => u.email && u.email.toLowerCase() === normalizedEmail
  );
  if (existing) {
    return res
      .status(400)
      .json({ error: "A user with this email already exists" });
  }

  // generate a simple new id: u{N+1}
  const newIdNumber =
    users
      .map((u) => parseInt((u.id || "").replace("u", ""), 10))
      .filter((n) => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0) + 1;

  const newUser = {
    id: `u${newIdNumber}`,
    name: name.trim(),
    email: normalizedEmail,
  };

  users.push(newUser);
  saveUsers();

  return res.status(201).json({
    message: "User created",
    user: newUser,
  });
});

// GET /users 
app.get("/users", (req, res) => {
  res.json(users);
});

// GET /products?category=&sortBy=price|rating&sortOrder=asc|desc&page=1&pageSize=20
app.get("/products", (req, res) => {
  const {
    category,
    sortBy,
    sortOrder = "asc",
    page = 1,
    pageSize = 20,
  } = req.query;

  let filtered = [...products];

  // filter by category 
  if (category) {
    filtered = filtered.filter((p) => p.category === category);
  }

  // sorting
  if (sortBy === "price" || sortBy === "rating") {
    filtered.sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      if (sortOrder === "desc") {
        return vb - va;
      }
      return va - vb;
    });
  }

  const pageNum = parseInt(page, 10) || 1;
  const sizeNum = parseInt(pageSize, 10) || 20;
  const start = (pageNum - 1) * sizeNum;
  const end = start + sizeNum;

  const paged = filtered.slice(start, end);

  res.json({
    total: filtered.length,
    page: pageNum,
    pageSize: sizeNum,
    items: paged,
  });
});

// POST /interactions
// body: { "userId": "u1", "productId": "p123", "event": "wishlist" }
app.post("/interactions", (req, res) => {
  const { userId, productId, event } = req.body;

  if (!userId || !productId || !event) {
    return res
      .status(400)
      .json({ error: "Missing userId, productId or event" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const allowedEvents = ["view", "wishlist", "add_to_cart", "purchase"];
  if (!allowedEvents.includes(event)) {
    return res
      .status(400)
      .json({ error: `event must be one of: ${allowedEvents.join(", ")}` });
  }

  const interaction = {
    userId,
    productId,
    event,
    timestamp: new Date().toISOString(),
  };

  interactions.push(interaction);
  saveInteractions(); // persist to file

  res.status(201).json({
    message: "Interaction recorded",
    interaction,
  });
});

// GET /categories -> all distinct product categories
app.get("/categories", (req, res) => {
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ).sort();

  res.json({ categories });
});

// GET /wishlist?userId=u1
app.get("/wishlist", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query param" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const items = getUserWishlistProducts(userId);
  return res.json({ userId, items });
});

// GET /cart?userId=u1
app.get("/cart", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query param" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const items = getUserCartProducts(userId);
  return res.json({ userId, items });
});

// GET /orders?userId=u1
app.get("/orders", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query param" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const items = getUserOrdersProducts(userId);
  return res.json({ userId, items });
});

// GET /explanation_feedback_stats
app.get("/explanation_feedback_stats", (req, res) => {
  const stats = {
    baseline: { total: 0, helpful: 0 },
    llm: { total: 0, helpful: 0 },
  };

  for (const fb of explanationFeedback) {
    if (!stats[fb.model]) continue;
    stats[fb.model].total += 1;
    if (fb.helpful) stats[fb.model].helpful += 1;
  }

  const result = {};
  for (const model of Object.keys(stats)) {
    const { total, helpful } = stats[model];
    result[model] = {
      total,
      helpful,
      helpfulRate: total > 0 ? helpful / total : null,
    };
  }

  return res.json(result);
});

// Example: GET /similar?productId=p10&k=5
app.get("/similar", (req, res) => {
  const { productId, k = 5 } = req.query;

  if (!productId) {
    return res.status(400).json({ error: "Missing productId query param" });
  }

  const baseProduct = products.find((p) => p.id === productId);
  if (!baseProduct) {
    return res.status(404).json({ error: "Product not found" });
  }

  const baseEmbedding = productEmbeddings.get(productId);
  if (!baseEmbedding) {
    return res.status(500).json({ error: "No embedding for this product" });
  }

  const K = parseInt(k, 10) || 5;

  // compute similarity to all other products
  const scored = [];
  for (const p of products) {
    if (p.id === productId) continue;
    const emb = productEmbeddings.get(p.id);
    if (!emb) continue;
    const sim = cosineSimilarity(baseEmbedding, emb);
    scored.push({ product: p, similarity: sim });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  const top = scored.slice(0, K).map((s) => ({
    ...s.product,
    similarity: s.similarity,
  }));

  res.json({
    productId,
    similar: top,
  });
});

// POST /explanation_feedback
// body: { userId, productId, model: "llm" | "baseline", helpful: true|false }
app.post("/explanation_feedback", (req, res) => {
  const { userId, productId, model, helpful } = req.body;

  if (!userId || !productId || typeof helpful !== "boolean" || !model) {
    return res.status(400).json({
      error: "Missing or invalid userId, productId, model or helpful flag",
    });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const allowedModels = ["baseline", "llm"];
  if (!allowedModels.includes(model)) {
    return res
      .status(400)
      .json({ error: `model must be one of: ${allowedModels.join(", ")}` });
  }

  const entry = {
    userId,
    productId,
    model,
    helpful,
    timestamp: new Date().toISOString(),
  };

  explanationFeedback.push(entry);
  saveExplanationFeedback();

  return res.status(201).json({
    message: "Feedback recorded",
    feedback: entry,
  });
});

// POST /checkout  { "userId": "u1" }
// Converts all current cart items into "purchase" events
app.post("/checkout", (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in body" });
  }

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const cartItems = getUserCartProducts(userId);
  if (cartItems.length === 0) {
    return res
      .status(400)
      .json({ error: "Cart is empty, nothing to checkout" });
  }

  const now = new Date().toISOString();

  for (const p of cartItems) {
    interactions.push({
      userId,
      productId: p.id,
      event: "purchase",
      timestamp: now,
    });
  }

  saveInteractions();

  return res.json({
    message: "Order placed successfully",
    userId,
    items: cartItems,
  });
});

// ================== /recommend (baseline) ======================

// Example: GET http://localhost:8080/recommend?userId=u1&k=5
app.get("/recommend", (req, res) => {
  const userId = req.query.userId;
  const k = parseInt(req.query.k || "5", 10);

  if (!userId) {
    return res.status(400).json({ error: "Missing userId query param" });
  }

  console.time(`recommend_${userId}_${k}`);
  const recs = getRecommendationsForUser(userId, k);
  console.timeEnd(`recommend_${userId}_${k}`);

  return res.json({ userId, recommendations: recs });
});

// ================== LLM INTEGRATION WITH OLLAMA (LLAMA3) ============================

// Example: POST http://localhost:8080/recommend_llm
app.post("/recommend_llm", async (req, res) => {
  const { userId, k = 5 } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId in body" });
  }

  // start timing
  const label = `recommend_llm_${userId}_${k}`;
  console.time(label);

  // Baseline candidates (classic recommender)
  // Use fewer candidates to keep the prompt small
  const baseline = getRecommendationsForUser(userId, 6); // 6 candidates for re-ranking
  const userHistory = getUserLikedProducts(userId);

  const historyForPrompt = userHistory.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags,
    price: p.price,
    rating: p.rating,
  }));

  const candidatesForPrompt = baseline.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags,
    price: p.price,
    rating: p.rating,
  }));

  const prompt = `
You are a recommendation assistant for an online e-commerce store (similar to eMAG/Amazon).

Here is the user's interaction history (products they liked, added to cart, or purchased):
${JSON.stringify(historyForPrompt, null, 2)}

Here are the candidate products generated by the baseline recommender:
${JSON.stringify(candidatesForPrompt, null, 2)}

Your job:

1. Re-rank ONLY these candidate products so that they best match THIS SPECIFIC USER'S preferences.
   Use ONLY the real attributes in the data: category, tags, price, and rating.
   Pay special attention to:
   - categories the user interacted with before,
   - tags (keywords) that appear often in previously liked or purchased products,
   - similar price range and rating.

2. Return ONLY the top ${k} products from the candidate list.
   - Do not invent new products.
   - Do not recommend more than ${k} products.
   - If there are fewer than ${k} candidates, return all of them.

3. For each recommended product, generate a SHORT explanation (1 sentence)
   that clearly states WHY this product matches the user's preferences.
   Use ONLY real attributes from the data (category, tags, price, rating, similarity with previous products).

IMPORTANT LANGUAGE RULES:
- You MUST answer in ENGLISH only.
- Do NOT use any Romanian words or Romanian diacritics.
- Example explanation (English only):
  "This product is recommended because it belongs to a category you interacted with before and has a similar price range."

IMPORTANT OUTPUT FORMAT:
Respond ONLY with valid JSON with this exact structure:
{
  "recommendations": [
    {
      "id": "product_id_here",
      "reason": "the explanation here"
    }
  ]
}
No extra text, no markdown, no comments, no other fields.
`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        format: "json",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      console.error("Ollama error response:", text);
      console.timeEnd(label); // end timing on error path
      return res.status(500).json({
        error: "LLM request failed",
        details: `Ollama HTTP ${response.status}: ${text}`,
      });
    }

    const data = await response.json();
    let content = data?.message?.content;

    if (Array.isArray(content)) {
      content = content
        .map((c) => (typeof c === "string" ? c : c.text || ""))
        .join("");
    }

    if (typeof content !== "string") {
      console.timeEnd(label); 
      throw new Error(
        "Unexpected LLM response format: content is not a string"
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse LLM JSON:", content);
      console.timeEnd(label);
      throw new Error("LLM did not return valid JSON");
    }

    const result = (parsed.recommendations || [])
      .slice(0, k)
      .map((item) => {
        const full = products.find((p) => p.id === item.id);
        if (!full) return null;
        return {
          ...full,
          explanation: item.reason,
        };
      })
      .filter(Boolean);

    console.timeEnd(label); // end timing on success

    return res.json({
      userId,
      recommendations: result,
    });
  } catch (err) {
    console.error("LLM/Ollama error:", err);
    console.timeEnd(label); // end timing on exception

    if (err.name === "AbortError") {
      return res.status(504).json({
        error: "LLM request timed out",
        details: "Ollama did not respond within 60 seconds",
      });
    }
    return res.status(500).json({
      error: "LLM request failed",
      details: err.message,
    });
  }
});

app.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);
