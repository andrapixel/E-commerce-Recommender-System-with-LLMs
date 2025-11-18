import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8080";

const HomePage = ({ loggedInUser, showToast }) => {
  const [products, setProducts] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const [allCategories, setAllCategories] = useState([]);

  const [error, setError] = useState("");

  const [baselineRecs, setBaselineRecs] = useState([]);
  const [llmRecs, setLLMRecs] = useState([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [isLoadingLLMRecs, setIsLoadingLLMRecs] = useState(false);

  const pageSize = 20;

  useEffect(() => {
    if (!loggedInUser) return;

    const loadCategories = async () => {
      try {
        const res = await fetch(`${API_BASE}/categories`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load categories");
        }
        setAllCategories(data.categories || []);
      } catch (err) {
        console.error("Error loading categories:", err);
      }
    };

    loadCategories();
  }, [loggedInUser]);
  useEffect(() => {
    if (!loggedInUser) return;
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInUser, categoryFilter, sortBy, sortOrder, page]);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("pageSize", pageSize.toString());
      if (categoryFilter) params.append("category", categoryFilter);
      if (sortBy) {
        params.append("sortBy", sortBy);
        params.append("sortOrder", sortOrder);
      }

      const res = await fetch(`${API_BASE}/products?` + params.toString());
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load products");
      }
      const data = await res.json();
      setProducts(data.items || []);
      setTotalProducts(data.total || 0);
    } catch (err) {
      console.error("Error loading products:", err);
      setError("Failed to load products");
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleInteraction = async (productId, event) => {
    if (!loggedInUser) {
      setError("You must be logged in to interact with products.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: loggedInUser.id,
          productId,
          event,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record interaction");
      }

      showToast(
        event === "wishlist" ? "Added to wishlist ❤️" : "Added to cart 🛒"
      );
    } catch (err) {
      console.error("Interaction error:", err);
      setError(err.message);
    }
  };

  const fetchBaselineRecs = async () => {
    if (!loggedInUser) {
      setError("You must be logged in to get recommendations.");
      return;
    }
    setIsLoadingRecs(true);
    setError("");
    setBaselineRecs([]);

    try {
      const k = 5;
      const res = await fetch(
        `${API_BASE}/recommend?userId=${loggedInUser.id}&k=${k}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to get baseline recommendations");
      }
      const data = await res.json();
      setBaselineRecs(data.recommendations || []);
    } catch (err) {
      console.error("Baseline recs error:", err);
      setError("Failed to load baseline recommendations");
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const fetchLLMRecs = async () => {
    if (!loggedInUser) {
      setError("You must be logged in to get LLM recommendations.");
      return;
    }
    setIsLoadingLLMRecs(true);
    setError("");
    setLLMRecs([]);

    try {
      const k = 3;
      const res = await fetch(`${API_BASE}/recommend_llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loggedInUser.id, k }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get LLM recommendations");
      }

      setLLMRecs(data.recommendations || []);
    } catch (err) {
      console.error("LLM recs error:", err);
      setError(err.message);
    } finally {
      setIsLoadingLLMRecs(false);
    }
  };

  const sendExplanationFeedback = async (productId, helpful) => {
    if (!loggedInUser) {
      setError("You must be logged in to send feedback.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/explanation_feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: loggedInUser.id,
          productId,
          model: "llm",
          helpful,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send feedback");
      }

      showToast("Thank you for your feedback!");
    } catch (err) {
      console.error("Feedback error:", err);
      setError(err.message);
    }
  };

  const totalPages = Math.ceil(totalProducts / pageSize);

  return (
    <div className="mt-4">
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {!loggedInUser ? (
        <div className="alert alert-info">
          Please log in to browse products and get recommendations.
        </div>
      ) : (
        <>
          {/* Products section */}
          <div className="card mb-4">
            <div className="card-body">
              <h2 className="card-title">Products</h2>

              {/* Filters */}
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label">
                    Category
                    <select
                      className="form-select"
                      value={categoryFilter}
                      onChange={(e) => {
                        setCategoryFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All</option>
                      {allCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="col-md-4">
                  <label className="form-label">
                    Sort by
                    <select
                      className="form-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="price">Price</option>
                      <option value="rating">Rating</option>
                    </select>
                  </label>
                </div>
                <div className="col-md-4">
                  {sortBy && (
                    <label className="form-label">
                      Order
                      <select
                        className="form-select"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {/* Pagination */}
              <div className="d-flex align-items-center mb-3">
                <button
                  className="btn btn-outline-secondary me-2"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <span>
                  Page {page} / {totalPages || 1}
                </span>
                <button
                  className="btn btn-outline-secondary ms-2"
                  onClick={() =>
                    setPage((p) =>
                      totalPages ? Math.min(totalPages, p + 1) : p + 1
                    )
                  }
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>

              {/* Products grid */}
              {isLoadingProducts ? (
                <p>Loading products...</p>
              ) : products.length === 0 ? (
                <p>No products found.</p>
              ) : (
                <div className="row g-3">
                  {products.map((p) => (
                    <div className="col-md-4" key={p.id}>
                      <div className="card h-100">
                        {/* IMAGE ON TOP */}
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="card-img-top product-card-img"
                          />
                        ) : (
                          <div className="product-card-img d-flex align-items-center justify-content-center text-muted">
                            No image
                          </div>
                        )}

                        {/* TEXT / INFO */}
                        <div className="card-body">
                          {/* Truncated title with tooltip */}
                          <h5
                            className="card-title"
                            title={p.name} // full title on hover
                          >
                            {p.name && p.name.length > 60
                              ? p.name.slice(0, 60) + "..."
                              : p.name}
                          </h5>

                          <h6 className="card-subtitle mb-2 text-muted">
                            {p.category}
                          </h6>

                          <p className="card-text mb-1">
                            <strong>
                              {typeof p.price === "number"
                                ? p.price.toFixed(2)
                                : "N/A"}{" "}
                              Lei
                            </strong>
                          </p>
                          <p className="card-text">
                            Rating:{" "}
                            <strong>
                              {typeof p.rating === "number" ? p.rating : "N/A"}
                            </strong>
                          </p>
                        </div>
                        <div className="card-footer d-flex gap-2">
                          <button
                            className="btn btn-outline-danger flex-grow-1"
                            onClick={() => handleInteraction(p.id, "wishlist")}
                          >
                            ❤️ Wishlist
                          </button>
                          <button
                            className="btn btn-primary flex-grow-1"
                            onClick={() =>
                              handleInteraction(p.id, "add_to_cart")
                            }
                          >
                            🛒 Add to cart
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recommendations section */}
          <div className="card">
            <div className="card-body">
              <h2 className="card-title">Recommendations</h2>
              <div className="mb-3">
                <button
                  className="btn btn-outline-secondary me-2"
                  onClick={fetchBaselineRecs}
                  disabled={isLoadingRecs}
                >
                  {isLoadingRecs
                    ? "Loading baseline..."
                    : "Get baseline recommendations"}
                </button>
                <button
                  className="btn btn-outline-primary"
                  onClick={fetchLLMRecs}
                  disabled={isLoadingLLMRecs}
                >
                  {isLoadingLLMRecs
                    ? "Loading LLM..."
                    : "Get LLM recommendations"}
                </button>
              </div>

              <div className="row">
                <div className="col-md-6">
                  <h5>Baseline (/recommend)</h5>
                  {baselineRecs.length === 0 ? (
                    <p>No baseline recommendations yet.</p>
                  ) : (
                    <ul className="list-group">
                      {baselineRecs.map((r) => (
                        <li className="list-group-item" key={r.id}>
                          <strong>{r.name}</strong> ({r.category}) – score:{" "}
                          {typeof r.score === "number"
                            ? r.score.toFixed(2)
                            : "N/A"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="col-md-6">
                  <h5>LLM (/recommend_llm)</h5>
                  {llmRecs.length === 0 ? (
                    <p>No LLM recommendations yet.</p>
                  ) : (
                    <ul className="list-group">
                      {llmRecs.map((r) => (
                        <li className="list-group-item" key={r.id}>
                          <div>
                            <strong>{r.name}</strong> ({r.category})
                          </div>
                          <div className="text-muted mb-2">
                            💬 {r.explanation}
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-sm btn-outline-success"
                              onClick={() =>
                                sendExplanationFeedback(r.id, true)
                              }
                            >
                              👍 Explanation makes sense
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() =>
                                sendExplanationFeedback(r.id, false)
                              }
                            >
                              👎 Not helpful
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HomePage;
