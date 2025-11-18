import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8080";

const OrdersPage = ({ loggedInUser }) => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loggedInUser) return;
    const loadOrders = async () => {
      try {
        const res = await fetch(`${API_BASE}/orders?userId=${loggedInUser.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load orders");
        }
        setItems(data.items || []);
      } catch (err) {
        console.error("Orders error:", err);
        setError(err.message);
      }
    };
    loadOrders();
  }, [loggedInUser]);

  if (!loggedInUser) {
    return (
      <div className="mt-4">
        <div className="alert alert-info">
          Please log in to see your orders.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h2>My Orders</h2>
      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p className="mt-3">You have no orders yet.</p>
      ) : (
        <ul className="list-group mt-3">
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
                  {typeof p.price === "number" ? p.price.toFixed(2) : "N/A"} Lei
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OrdersPage;
