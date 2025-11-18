import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import WishlistPage from "./pages/WishlistPage";
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";
import Toast from "./components/Toast";

function App() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "" });

  const handleLogout = () => {
    setLoggedInUser(null);
  };

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast({ show: false, message: "" });
    }, 2500);
  };

  return (
    <Router>
      <Navbar loggedInUser={loggedInUser} onLogout={handleLogout} />

      <div className="container">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage loggedInUser={loggedInUser} showToast={showToast} />
            }
          />
          <Route
            path="/login"
            element={
              <LoginPage onLogin={setLoggedInUser} showToast={showToast} />
            }
          />
          <Route
            path="/signup"
            element={
              <SignupPage onSignup={setLoggedInUser} showToast={showToast} />
            }
          />
          <Route
            path="/wishlist"
            element={
              <WishlistPage loggedInUser={loggedInUser} showToast={showToast} />
            }
          />
          <Route
            path="/cart"
            element={
              <CartPage loggedInUser={loggedInUser} showToast={showToast} />
            }
          />
          <Route
            path="/orders"
            element={
              <OrdersPage loggedInUser={loggedInUser} showToast={showToast} />
            }
          />
        </Routes>
      </div>

      {/* Global toast */}
      <Toast
        show={toast.show}
        message={toast.message}
        onClose={() => setToast({ show: false, message: "" })}
      />
    </Router>
  );
}

export default App;
