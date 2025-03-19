const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const geoip = require("geoip-lite");
const path = require("path");
const requestIp = require("request-ip");
const helmet = require("helmet");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// استخدام helmet لتعزيز أمان التطبي
app.use(helmet());

// في بيئة التطوير نسمح لجميع الأصول لتفادي مشاكل CORS
app.use(cors({
  origin: '*'
}));

// إعداد JSON
app.use(express.json());

// تقديم الملفات الثابتة من مجلد public مع إضافة رأس CORS لجميع الطلبات
app.use(express.static("public", {
  setHeaders: (res, path, stat) => {
    res.set("Access-Control-Allow-Origin", "*");
  }
}));


// Middleware للحصول على IP العميل
app.use(requestIp.mw());

// إنشاء اتصال بقاعدة البيانات
const db = new sqlite3.Database("./tracking.db", (err) => {
  if (err) console.error("Error connecting to the database:", err.message);
  else console.log("Connected to SQLite database.");
});

// إنشاء الجداول والفهارس لتحسين الأداء
db.serialize(() => {
  // جدول الزيارات
  db.run(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      page TEXT,
      user_ip TEXT,
      country TEXT,
      city TEXT,
      isp TEXT,
      user_agent TEXT,
      device TEXT,
      referrer TEXT,
      duration INTEGER,
      load_time INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => { if (err) console.error("Error creating visits table:", err.message); });

  // إنشاء فهارس
  db.run(`CREATE INDEX IF NOT EXISTS idx_session_id ON visits(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON visits(timestamp)`);

  // حذف وإنشاء جدول الأفعال
  db.run("DROP TABLE IF EXISTS actions", (err) => { if (err) console.error("Error dropping actions table:", err.message); });
  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      action TEXT,
      element TEXT,
      element_id TEXT,
      element_class TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => { if (err) console.error("Error creating actions table:", err.message); });
});

// =====================
// Endpoint لتقديم ملف tracking.js الخاص بالعميل
// =====================
app.get("/tracking.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  const trackingScript = `
(function() {
  // إنشاء session_id وتخزينه في localStorage
  let session_id = localStorage.getItem('session_id') || (Date.now() + '-' + Math.random().toString(36).substr(2, 9));
  localStorage.setItem('session_id', session_id);

  let startTime = Date.now();
  let visit_id = null;
  let pageLoadTime = performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart;

  function sendData(endpoint, data) {
      const serverURL = "http://localhost:8800";
      if (endpoint === '/track-visit') {
          fetch(serverURL + endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify(data)
          })
          .then(response => response.json())
          .then(respData => {
              console.log("Visit tracked:", respData);
              visit_id = respData.visit_id;
          })
          .catch(err => console.error("Error tracking visit:", err));
      } else {
          navigator.sendBeacon(serverURL + endpoint, JSON.stringify(data));
      }
  }

  // عند مغادرة الصفحة، إرسال مدة التواجد
  window.addEventListener('beforeunload', function() {
      const data = { visit_id: visit_id, session_id: session_id, duration: Date.now() - startTime };
      navigator.sendBeacon("http://localhost:8800/track-duration", JSON.stringify(data));
  });

  // إرسال بيانات الزيارة عند تحميل الصفحة
  sendData('/track-visit', {
      session_id: session_id,
      page: window.location.pathname,
      user_agent: navigator.userAgent,
      referrer: document.referrer,
      device: navigator.platform,
      load_time: pageLoadTime
  });

  // تتبع نقرات المستخدم وإرسال بياناتها
  document.addEventListener('click', function(event) {
      const elementDetails = getElementDetails(event.target);
      const data = {
          session_id: session_id,
          action: 'click',
          element: elementDetails,
          element_id: event.target.id || null,
          element_class: event.target.className || null
      };
      navigator.sendBeacon("http://localhost:8800/track-action", JSON.stringify(data));
  });

  function getElementDetails(element) {
      let path = [];
      while (element) {
          let tagName = element.tagName.toLowerCase();
          let id = element.id ? '#' + element.id : '';
          let classNames = element.className ? '.' + element.className.split(' ').join('.') : '';
          path.unshift(tagName + id + classNames);
          element = element.parentElement;
      }
      return path.join(' > ');
  }
})();
`;
  res.send(trackingScript);
});

// =====================
// Endpoint لتسجيل الأفعال (track-action)
// =====================
app.post("/track-action", express.text(), (req, res) => {
  let data;
  try {
    data = JSON.parse(req.body);
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const { session_id, action, element, element_id, element_class } = data;
  if (!session_id || !action || !element) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  db.run(
    `INSERT INTO actions (session_id, action, element, element_id, element_class) VALUES (?, ?, ?, ?, ?)`,
    [session_id, action, element, element_id, element_class],
    function (err) {
      if (err) {
        console.error("Error inserting action:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: "Action tracked successfully", session_id });
    }
  );
});

// =====================
// Endpoint لتسجيل الزيارات (track-visit)
// =====================
app.post("/track-visit", express.text(), (req, res) => {
  let data;
  try {
    data = JSON.parse(req.body);
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (!data.session_id || !data.page) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // الحصول على IP العميل ومعالجة حالة الـ IP المحلي (loopback)
  let user_ip = req.clientIp || requestIp.getClientIp(req);
  if (user_ip === "::1" || user_ip === "127.0.0.1") {
    // في حالة الاختبار المحلي، استخدم IP افتراضي خارجي لتحديد البلد بشكل صحيح
    user_ip = "8.8.8.8";
  }

  const geo = geoip.lookup(user_ip);
  const country = geo && geo.country ? geo.country : "Unknown";
  const city = geo && geo.city ? geo.city : "Unknown";
  // ملاحظة: geoip-lite لا يوفر بيانات ISP بشكل موثوق، لذا نستخدم قيمة افتراضية
  const isp = "Unknown";

  db.run(
    `INSERT INTO visits (session_id, page, user_ip, country, city, isp, user_agent, device, referrer, duration, load_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [data.session_id, data.page, user_ip, country, city, isp, data.user_agent, data.device, data.referrer, data.load_time],
    function (err) {
      if (err) {
        console.error("Error inserting visit:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: "Visit tracked successfully", session_id: data.session_id, visit_id: this.lastID });
    }
  );
});

// =====================
// Endpoint لتحديث مدة الزيارة (track-duration)
// =====================
app.post("/track-duration", express.text(), (req, res) => {
  let data;
  try {
    data = JSON.parse(req.body);
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (data.visit_id) {
    db.run(
      `UPDATE visits SET duration = ? WHERE id = ?`,
      [data.duration, data.visit_id],
      function (err) {
        if (err) {
          console.error("Error updating duration:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Duration tracked successfully", session_id: data.session_id });
      }
    );
  } else {
    db.run(
      `UPDATE visits SET duration = ? WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [data.duration, data.session_id],
      function (err) {
        if (err) {
          console.error("Error updating duration:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Duration tracked successfully", session_id: data.session_id });
      }
    );
  }
});

// =====================
// Endpoint التحليلات الأساسية (analytics)
// =====================
app.get("/analytics", (req, res) => {
  const { start_date, end_date } = req.query;
  let dateFilter = "";
  let params = [];
  if (start_date && end_date) {
    dateFilter = "WHERE timestamp BETWEEN ? AND ?";
    params = [start_date, end_date];
  }
  db.all(
    `SELECT country, COUNT(*) AS visits FROM visits ${dateFilter} GROUP BY country ORDER BY visits DESC`,
    params,
    (err, countryData) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(DISTINCT session_id) AS total_visitors FROM visits ${dateFilter}`, params, (err, totalVisitors) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT SUM(duration) AS total_time FROM visits ${dateFilter}`, params, (err, totalTime) => {
          if (err) return res.status(500).json({ error: err.message });
          db.all(`SELECT strftime('%Y-%m', timestamp) AS month, COUNT(*) AS visits FROM visits ${dateFilter} GROUP BY month ORDER BY month DESC`, params, (err, monthlyStats) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
              total_visitors: totalVisitors.total_visitors || 0,
              total_time_spent: totalTime.total_time || 0,
              country_stats: countryData || [],
              monthly_stats: monthlyStats || []
            });
          });
        });
      });
    }
  );
});

// =====================
// Endpoint التحليلات الموسعة (extended-analytics)
// =====================
app.get("/extended-analytics", (req, res) => {
  const { start_date, end_date } = req.query;
  let dateFilter = "";
  let params = [];
  if (start_date && end_date) {
    dateFilter = "WHERE timestamp BETWEEN ? AND ?";
    params = [start_date, end_date];
  }
  db.get(
    `SELECT COUNT(*) AS total_visits, SUM(duration) AS total_time, AVG(duration) AS avg_duration, AVG(load_time) AS avg_load_time FROM visits ${dateFilter}`,
    params,
    (err, summaryData) => {
      if (err) return res.status(500).json({ error: err.message });

      const total_visits = summaryData.total_visits || 0;
      const total_time = summaryData.total_time || 0;
      const avg_duration = summaryData.avg_duration || 0;
      const avg_load_time = summaryData.avg_load_time || 0;

      // بناء استعلام Bounce بحيث يكون صحيحاً سواء كان dateFilter موجودًا أم لا
      let bounceQuery = "SELECT COUNT(*) AS bounces FROM visits";
      if (dateFilter) {
        bounceQuery += ` ${dateFilter} AND duration < 10000`;
      } else {
        bounceQuery += " WHERE duration < 10000";
      }

      db.get(bounceQuery, params, (err, bounceData) => {
        if (err) return res.status(500).json({ error: err.message });
        const bounces = bounceData.bounces || 0;
        const bounce_rate = total_visits ? (bounces / total_visits) * 100 : 0;

        db.all(`SELECT device, COUNT(*) AS visits FROM visits ${dateFilter} GROUP BY device ORDER BY visits DESC`, params, (err, deviceData) => {
          if (err) return res.status(500).json({ error: err.message });
          db.all(`SELECT referrer, COUNT(*) AS visits FROM visits ${dateFilter} GROUP BY referrer ORDER BY visits DESC`, params, (err, referrerData) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
              total_visits,
              total_time_spent: total_time,
              average_duration: avg_duration,
              average_load_time: avg_load_time,
              bounce_rate,
              device_stats: deviceData || [],
              referrer_stats: referrerData || []
            });
          });
        });
      });
    }
  );
});

// =====================
// Endpoint ترتيب الأفعال (actions-rank)
// =====================
app.get("/actions-rank", (req, res) => {
  db.all(
    `SELECT element, COUNT(*) AS clicks FROM actions GROUP BY element ORDER BY clicks DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// =====================
// إعداد nodemailer لإرسال البريد الإلكتروني (يُستخدم متغيرات البيئة)
// =====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your_email@example.com',
    pass: process.env.EMAIL_PASS || 'your_email_password'
  }
});

// =====================
// Cron Job لإرسال ملخص دوري يومي عند الساعة 4:35 صباحًا (صيغة الكرون: '35 4 * * *')
// =====================
cron.schedule('35 4 * * *', () => {
  console.log('Running daily summary email job...');
  db.get(
    `SELECT COUNT(*) AS total_visits, SUM(duration) AS total_time, AVG(duration) AS avg_duration, AVG(load_time) AS avg_load_time FROM visits`,
    [],
    (err, summaryData) => {
      if (err) return console.error("Error fetching summary for email:", err.message);
      db.get(`SELECT COUNT(*) AS bounces FROM visits WHERE duration < 10000`, [], (err, bounceData) => {
        if (err) return console.error("Error fetching bounce data for email:", err.message);
        const total_visits = summaryData.total_visits || 0;
        const bounceRate = total_visits ? ((bounceData.bounces || 0) / total_visits) * 100 : 0;
        let alertMessage = "";
        if (bounceRate > 50) {
          alertMessage = "Alert: High Bounce Rate detected!";
        }
        const emailContent = `
Daily Summary Report:
Total Visits: ${total_visits}
Total Time Spent: ${summaryData.total_time || 0} ms
Average Duration: ${summaryData.avg_duration || 0} ms
Average Load Time: ${summaryData.avg_load_time || 0} ms
Bounce Rate: ${bounceRate.toFixed(2)}%
${alertMessage}
        `;
        const mailOptions = {
          from: process.env.EMAIL_USER || 'your_email@example.com',
          to: process.env.RECIPIENT_EMAIL || 'your_email@example.com',
          subject: 'Daily Summary Report',
          text: emailContent
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.error("Error sending summary email:", error);
          }
          console.log("Daily summary email sent:", info.response);
        });
      });
    }
  );
});

// بدء تشغيل الخادم
const PORT = process.env.PORT || 8800;
app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
