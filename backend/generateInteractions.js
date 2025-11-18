const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "data", "emag_products.json");
const interactionsPath = path.join(__dirname, "data", "interactions.json");
const usersPath = path.join(__dirname, "data", "users.json");

const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
const users = JSON.parse(fs.readFileSync(usersPath, "utf-8"));

// Group products by category slug (e.g. "laptopuri", "televizoare", etc.)
const productsByCategory = products.reduce((acc, p) => {
  const cat = p.category || "other";
  if (!acc[cat]) acc[cat] = [];
  acc[cat].push(p);
  return acc;
}, {});

console.log("Categories found:", Object.keys(productsByCategory));

// Small helper: random sample without replacement
function sample(array, n) {
  const copy = [...array];
  const result = [];
  n = Math.min(n, copy.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

// Map your existing users to preference profiles
const userProfiles = [
  {
    userId: "u1",
    preferredCategories: [
      "laptopuri",
      "telefoane-mobile",
      "perii-par-electrice",
    ],
  },
  {
    userId: "u2",
    preferredCategories: [
      "televizoare",
      "casti-bluetooth-telefoane",
      "jocuri-consola-pc",
    ],
  },
  {
    userId: "u3",
    preferredCategories: ["espressoare", "friteuze", "blendere----tocatoare"],
  },
  {
    userId: "u4",
    preferredCategories: [
      "masini-spalat-rufe",
      "frigidere",
      "roboti-bucatarie",
    ],
  },
  {
    userId: "u5",
    preferredCategories: [
      "smartwatch",
      "periute-dinti-electrice",
      "epilatoare",
    ],
  },
];

// Make sure every userId exists in users.json
for (const profile of userProfiles) {
  const exists = users.some((u) => u.id === profile.userId);
  if (!exists) {
    console.warn(
      `Warning: userId ${profile.userId} from userProfiles not in users.json`
    );
  }
}

// Generate interactions based on wishlist / cart / purchase actions
const interactions = [];

for (const profile of userProfiles) {
  const { userId, preferredCategories } = profile;

  preferredCategories.forEach((catSlug) => {
    const catProducts = productsByCategory[catSlug];
    if (!catProducts || catProducts.length === 0) {
      console.log(
        `No products for category "${catSlug}", skipping for user ${userId}`
      );
      return;
    }

    // pick up to 8 products from this category for this user
    const picked = sample(catProducts, 8);

    picked.forEach((p, idx) => {
      // pattern:
      // - index 0: purchase (past order)
      // - index 1-2: add_to_cart
      // - rest: wishlist (liked)
      let event = "wishlist";
      if (idx === 0) event = "purchase";
      else if (idx === 1 || idx === 2) event = "add_to_cart";

      interactions.push({
        userId,
        productId: p.id,
        event,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

console.log(
  `Generated ${interactions.length} interactions for ${userProfiles.length} users.`
);

// Save interactions.json
fs.writeFileSync(
  interactionsPath,
  JSON.stringify(interactions, null, 2),
  "utf-8"
);
console.log(`Saved interactions to ${interactionsPath}`);
