import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { MongoClient } from "mongodb";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("MONGO_URI environment variable not set!");
  process.exit(1);
}

const client =new MongoClient(mongoUri);;
await client.connect();
const db = client.db("bint");
const collection = db.collection("stringAnalyzers");

// Basic logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Serve static files
app.use(express.static(path.join(__dirname, "views")));

// Helper function to analyze string
function analyzeString(value) {
  const lower = value.toLowerCase();
  const reversed = lower.split("").reverse().join("");
  const is_palindrome = lower === reversed;
  const length = value.length;
  const unique_characters = new Set(lower).size;
  const word_count = value.trim().split(/\s+/).filter(Boolean).length;
  const sha256_hash = crypto.createHash("sha256").update(value).digest("hex");

  const character_frequency_map = {};
  for (const char of lower) {
    character_frequency_map[char] = (character_frequency_map[char] || 0) + 1;
  }

  return {
    length,
    is_palindrome,
    unique_characters,
    word_count,
    sha256_hash,
    character_frequency_map,
  };
}

//analyze and store strings
app.post("/strings", async (req, res) => {
  try {
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: "Missing 'value' field" });
    }
    if (typeof value !== "string") {
      return res.status(422).json({ error: "'value' must be a string" });
    }

    const properties = analyzeString(value);

    const exists = await collection.findOne({
      "properties.sha256_hash": properties.sha256_hash,
    });
    if (exists) {
      return res
        .status(409)
        .json({ error: "String already exists in the system" });
    }

    const newEntry = {
      id: properties.sha256_hash,
      value,
      properties,
      created_at: new Date().toISOString(),
    };

    await collection.insertOne(newEntry);
    res.status(201).json(newEntry);
  } catch (error) {
    console.error("POST /strings error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// natural language Filtering
app.get("/strings/filter-by-natural-language", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'query' parameter" });
    }

    const lowerQuery = query.toLowerCase();
    const parsedFilters = {};

    // Palindrome
    if (
      lowerQuery.includes("palindromic") ||
      lowerQuery.includes("palindrome")
    ) {
      parsedFilters.is_palindrome = true;
    }

    //Word count
    const singleWordMatch = lowerQuery.match(/\bsingle word\b/);
    if (singleWordMatch) parsedFilters.word_count = 1;

    const multiWordMatch = lowerQuery.match(/(\d+)\s+word/);
    if (multiWordMatch) parsedFilters.word_count = parseInt(multiWordMatch[1]);

    // String length
    const longerThanMatch = lowerQuery.match(/longer than (\d+)/);
    if (longerThanMatch)
      parsedFilters.min_length = parseInt(longerThanMatch[1]) + 1;

    const shorterThanMatch = lowerQuery.match(/shorter than (\d+)/);
    if (shorterThanMatch)
      parsedFilters.max_length = parseInt(shorterThanMatch[1]) - 1;

    //  Contains character (simple heuristic: first letter after 'contains' or 'letter')
    const containsMatch = lowerQuery.match(/(?:contains|letter)\s+([a-z])/);
    if (containsMatch) parsedFilters.contains_character = containsMatch[1];

    // Validate
    if (Object.keys(parsedFilters).length === 0) {
      return res
        .status(400)
        .json({ error: "Unable to parse natural language query" });
    }

    // Build MongoDB query
    const mongoQuery = {};
    if (parsedFilters.is_palindrome !== undefined) {
      mongoQuery["properties.is_palindrome"] = parsedFilters.is_palindrome;
    }
    if (parsedFilters.word_count !== undefined) {
      mongoQuery["properties.word_count"] = parsedFilters.word_count;
    }
    if (parsedFilters.min_length !== undefined) {
      mongoQuery["properties.length"] = { $gte: parsedFilters.min_length };
    }
    if (parsedFilters.max_length !== undefined) {
      mongoQuery["properties.length"] = {
        ...(mongoQuery["properties.length"] || {}),
        $lte: parsedFilters.max_length,
      };
    }
    if (parsedFilters.contains_character) {
      mongoQuery[
        `properties.character_frequency_map.${parsedFilters.contains_character}`
      ] = {
        $exists: true,
      };
    }

    const data = await collection.find(mongoQuery).toArray();

    res.status(200).json({
      data,
      count: data.length,
      interpreted_query: {
        original: query,
        parsed_filters: parsedFilters,
      },
    });
  } catch (error) {
    console.error("GET /strings/filter-by-natural-language error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// get string by value
app.get("/strings/:string_value", async (req, res) => {
  try {
    const { string_value } = req.params;
    const hash = crypto.createHash("sha256").update(string_value).digest("hex");

    const found = await collection.findOne({ "properties.sha256_hash": hash });
    if (!found) {
      return res.status(404).json({ error: "String not found" });
    }

    res.status(200).json(found);
  } catch (error) {
    console.error("GET /strings/:string_value error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// get and filter strings
app.get("/strings", async (req, res) => {
  try {
    const {
      is_palindrome,
      min_length,
      max_length,
      word_count,
      contains_character,
    } = req.query;

    const query = {};

    if (is_palindrome !== undefined) {
      query["properties.is_palindrome"] = is_palindrome === "true";
    }

    if (min_length) query["properties.length"] = { $gte: parseInt(min_length) };
    if (max_length)
      query["properties.length"] = {
        ...(query["properties.length"] || {}),
        $lte: parseInt(max_length),
      };

    if (word_count) query["properties.word_count"] = parseInt(word_count);
    if (contains_character)
      query[`properties.character_frequency_map.${contains_character}`] = {
        $exists: true,
      };

    const data = await collection.find(query).toArray();

    res.status(200).json({
      data,
      count: data.length,
      filters_applied: {
        is_palindrome,
        min_length,
        max_length,
        word_count,
        contains_character,
      },
    });
  } catch (error) {
    console.error("GET /strings error:", error);
    res.status(400).json({ error: "Invalid query parameters" });
  }
});

// delete string
app.delete("/strings/:string_value", async (req, res) => {
  try {
    const { string_value } = req.params;
    const hash = crypto.createHash("sha256").update(string_value).digest("hex");

    const result = await collection.deleteOne({
      "properties.sha256_hash": hash,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "String not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("DELETE /strings/:string_value error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
