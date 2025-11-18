const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "data", "emag_products.json"); // or products.json if you renamed
const interactionsPath = path.join(__dirname, "data", "interactions.json");

const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
const interactions = JSON.parse(fs.readFileSync(interactionsPath, "utf-8"));

// Build a quick product lookup map
const productById = new Map(products.map((p) => [p.id, p]));
const POSITIVE_EVENTS = ["purchase", "add_to_cart", "wishlist"];

// Group positive interactions by user
const positivesByUser = interactions.reduce((acc, inter) => {
  if (!POSITIVE_EVENTS.includes(inter.event)) return acc;
  const { userId, productId } = inter;
  if (!productById.has(productId)) return acc;

  if (!acc[userId]) acc[userId] = new Set();
  acc[userId].add(productId);
  return acc;
}, {});

// Simple scoring function
function scoreProductForUser(product, likedProducts) {
  if (!likedProducts || likedProducts.length === 0) {
    return 0;
  }

  const likedTags = new Set(likedProducts.flatMap((p) => p.tags || []));
  const likedCategories = new Set(likedProducts.map((p) => p.category));
  const overlap = (product.tags || []).filter((t) => likedTags.has(t)).length;
  const categoryBonus = likedCategories.has(product.category) ? 1 : 0;

  return overlap + categoryBonus;
}

// Recommend top-K for evaluation, using ONLY training positives for profile
function recommendForUserEval(userId, trainProductIds, K = 5) {
  const likedProducts = trainProductIds
    .map((id) => productById.get(id))
    .filter(Boolean);

  const trainSet = new Set(trainProductIds);

  const scored = products
    // Exclude training items so we can "predict" held-out test items
    .filter((p) => !trainSet.has(p.id))
    .map((p) => ({
      product: p,
      score: scoreProductForUser(p, likedProducts),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, K).map((s) => s.product.id);
}

function evaluate(K = 5) {
  let usersEvaluated = 0;
  let sumPrecision = 0;
  let sumRecall = 0;

  for (const [userId, positivesSet] of Object.entries(positivesByUser)) {
    const positives = Array.from(positivesSet);

    // Need at least 2 positives to have train & test
    if (positives.length < 2) continue;

    // Shuffle positives
    const shuffled = [...positives].sort(() => Math.random() - 0.5);

    // 30% test, at least 1
    const testSize = Math.max(1, Math.round(shuffled.length * 0.3));
    const testItems = shuffled.slice(0, testSize);
    const trainItems = shuffled.slice(testSize);

    if (trainItems.length === 0 || testItems.length === 0) continue;

    const recs = recommendForUserEval(userId, trainItems, K);

    const testSet = new Set(testItems);

    const hits = recs.filter((id) => testSet.has(id)).length;

    const precision = hits / K;
    const recall = hits / testItems.length;

    usersEvaluated += 1;
    sumPrecision += precision;
    sumRecall += recall;
  }

  if (usersEvaluated === 0) {
    console.log(
      "Not enough data to evaluate (no users with multiple positives)."
    );
    return;
  }

  const avgPrecision = sumPrecision / usersEvaluated;
  const avgRecall = sumRecall / usersEvaluated;

  console.log(`Evaluated ${usersEvaluated} users`);
  console.log(`Precision@${K}: ${avgPrecision.toFixed(3)}`);
  console.log(`Recall@${K}: ${avgRecall.toFixed(3)}`);
}

evaluate(2);
