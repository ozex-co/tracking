const express = require("express");
const router = express.Router();
const { trackVisitor, getAnalytics } = require("../controllers/analyticsController");

router.post("/track", trackVisitor);
router.get("/stats", getAnalytics);

module.exports = router;
