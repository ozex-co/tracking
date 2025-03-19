const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../finance.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error connecting to finance database:", err.message);
  else console.log("✅ Connected to finance SQLite database.");
});

// إنشاء جدول الرصيد إذا لم يكن موجودًا
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL DEFAULT 0.0
    )`,
    (err) => {
      if (err) console.error(err.message);
      else {
        // التأكد من وجود سجل أولي للرصيد
        db.get("SELECT COUNT(*) AS count FROM balance", (err, row) => {
          if (err) console.error(err.message);
          if (row.count == 0) {
            db.run("INSERT INTO balance (total) VALUES (0)", (err) => {
              if (err) console.error(err.message);
              else console.log("✅ Initialized balance with 0.");
            });
          }
        });
      }
    }
  );

  // إنشاء جدول المعاملات المالية
  db.run(
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) console.error(err.message);
      else console.log("✅ Transactions table is ready.");
    }
  );

   db.run(
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    old_value REAL,
    new_value REAL,
    action TEXT CHECK(action IN ('add', 'update', 'delete')) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  (err) => {
    if (err) console.error(err.message);
    else console.log("✅ Logs table is ready.");
  }
);
 
});



module.exports = db;
