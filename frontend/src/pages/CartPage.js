import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8080";

const CartPage = ({ loggedInUser }) => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const loadCart = async () => {
    if (!loggedInUser) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/cart?userId=${loggedInUser.id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load cart");
      }
      setItems(data.items || []);
    } catch (err) {
      console.error("Cart error:", err);
      setError(err.message);
    }
  };

  useEffect(() => {
    loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInUser]);

  const handlePlaceOrder = async () => {
    if (!loggedInUser) return;
    if (items.length === 0) {
      setError("Cart is empty.");
      return;
    }
    setIsPlacingOrder(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loggedInUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      setMessage("Order placed successfully!");
      setItems([]); // cart now empty
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err.message);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (!loggedInUser) {
    return (
      <div className="mt-4">
        <div className="alert alert-info">Please log in to see your cart.</div>
      </div>
    );
  }

  const totalPrice = items.reduce(
    (sum, p) => sum + (typeof p.price === "number" ? p.price : 0),
    0
  );

  return (
    <div className="mt-4">
      <h2>My Cart</h2>

      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success mt-2" role="alert">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-3">Your cart is empty.</p>
      ) : (
        <>
          <ul className="list-group mt-3 mb-3">
            {items.map((p) => (
              <li
                key={p.id}
                className="list-group-item d-flex align-items-center"
              >
                {p.imageUrl && (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    style={{
                      width: 60,
                      height: 60,
                      objectFit: "contain",
                      marginRight: 12,
                    }}
                  />
                )}
                <div>
                  <div title={p.name} style={{ fontWeight: "bold" }}>
                    {p.name && p.name.length > 80
                      ? p.name.slice(0, 80) + "..."
                      : p.name}
                  </div>
                  <div className="text-muted">
                    {p.category} –{" "}
                    {typeof p.price === "number" ? p.price.toFixed(2) : "N/A"}{" "}
                    Lei
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <strong>Total:</strong>{" "}
              {totalPrice.toFixed(2)} Lei
            </div>
            <button
              className="btn btn-success"
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder}
            >
              {isPlacingOrder ? "Placing order..." : "Place order"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CartPage;
