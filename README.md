# String Analyzer API

A Node.js & Express API for analyzing, storing, filtering, and retrieving strings. Supports palindrome detection, word count, character frequency analysis, SHA-256 hashing, and natural language filtering.

---

## Features

- Analyze strings for:
  - Length
  - Palindrome check
  - Unique characters
  - Word count
  - SHA-256 hash
  - Character frequency
- Store analyzed strings in MongoDB
- Retrieve, filter, and delete strings
- Natural language query filtering (e.g., "all single word palindromic strings")
- RESTful API with JSON responses
- CORS enabled

---

## Technologies

- Node.js
- Express
- MongoDB
- dotenv
- crypto
- cors

---

## Setup & Installation

1. Clone the repository:

```bash
git clone <repo-url>
cd <repo-folder>
```

npm install
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/<db_name>?retryWrites=true&w=majority

endpoints
POST /strings
GET /strings/:string_value
GET /strings
DELETE /strings/:string_value
GET /strings/filter-by-natural-language?query=<your-query>
