# Product Recommendation System – Demo

This project is a simple full-stack demo of an e-commerce recommendation system.  
It includes a Node.js backend (with recommendations and user interactions) and a React frontend for browsing products, wishlist, cart, and orders.

---

## 📌 Features

- Product browsing + sorting + category filtering  
- Wishlist, Cart & Orders pages  
- Login & Signup (local JSON users)  
- Baseline recommendation system  
- Optional LLM-based re-ranking (via Ollama)  
- Product similarity search (`/similar`)  
- Feedback collection for explanations  
- Offline evaluation (Precision@5, Recall@5)

---

## 🚀 How to Run

### 1. Start the backend (Node.js API)
```bash
cd backend
npm install
node index.js
```

### 2. (Optional) Enable LLM recommendations
Install and start Ollama: https://ollama.como 
Download model:
```bash
ollama pull llama3
```

### 3. Start the frontend (React)
```bash
cd frontend
npm install
npm start
```


### 4. Evaluation script
To compute Precision@5 and Recall@5 for the baseline recommender:
```bash
node evaluate.js
```
