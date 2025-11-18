const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "data", "emag_products.json");
const interactionsPath = path.join(__dirname, "data", "interactions.json");

const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
const interactions = JSON.parse(fs.readFileSync(interactionsPath, "utf-8"));

// Map productId -> product
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluateLLM(K = 5, maxUsers = 5) {
  const baseUrl = "http://localhost:8080";

  let usersEvaluated = 0;
  let sumPrecision = 0;
  let sumRecall = 0;

  const userIds = Object.keys(positivesByUser);

  for (const userId of userIds) {
    if (usersEvaluated >= maxUsers) break;

    const positivesSet = positivesByUser[userId];
    if (!positivesSet || positivesSet.size === 0) continue;

    const positives = Array.from(positivesSet);
    const groundTruthSet = new Set(positives);

    console.log(`\n=== Evaluating user ${userId} ===`);
    console.log(`Positive items count: ${positives.length}`);

    try {
      const res = await fetch(`${baseUrl}/recommend_llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, k: K }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(
          `  LLM recommend failed for user ${userId}:`,
          data.error || res.statusText
        );
        continue;
      }

      const recs = (data.recommendations || []).map((r) => r.id);
      if (recs.length === 0) {
        console.log("  No LLM recommendations returned, skipping.");
        continue;
      }

      const hits = recs.filter((id) => groundTruthSet.has(id)).length;
      const precision = hits / recs.length;
      const recall = hits / positives.length;

      console.log(`  Recommended IDs: ${recs.join(", ")}`);
      console.log(`  Hits: ${hits}`);
      console.log(`  Precision@${K}: ${precision.toFixed(3)}`);
      console.log(`  Recall@${K}: ${recall.toFixed(3)}`);

      usersEvaluated += 1;
      sumPrecision += precision;
      sumRecall += recall;

      await sleep(1500);
    } catch (err) {
      console.error(`  Error evaluating user ${userId}:`, err.message);
    }
  }

  if (usersEvaluated === 0) {
    console.log("No users could be evaluated (no positives or LLM errors).");
    return;
  }

  const avgPrecision = sumPrecision / usersEvaluated;
  const avgRecall = sumRecall / usersEvaluated;

  console.log("\n================ LLM EVALUATION SUMMARY ================");
  console.log(`Evaluated users: ${usersEvaluated}`);
  console.log(`Average Precision@${K}: ${avgPrecision.toFixed(3)}`);
  console.log(`Average Recall@${K}: ${avgRecall.toFixed(3)}`);
  console.log("========================================================");
}

evaluateLLM(5, 5);
