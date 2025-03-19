const Analytics = require("../models/Analytics");
const geoip = require("geoip-lite");
const useragent = require("user-agent");

exports.trackVisitor = async (req, res) => {
    try {
        const { ip, pagesVisited, buttonsClicked, mouseMovements, duration, clickCount, downloadedFiles, formSubmissions } = req.body;

        const geo = geoip.lookup(ip) || {};
        const agent = useragent.parse(req.headers["user-agent"]);

        const visitorData = await Analytics.create({
            ip,
            country: geo.country || "Unknown",
            city: geo.city || "Unknown",
            isp: geo.org || "Unknown",
            browser: agent.browser,
            os: agent.platform,
            device: agent.deviceCategory || "Unknown",
            screen_resolution: req.body.screenResolution,
            referrer: req.body.referrer,
            pages_visited: JSON.stringify(pagesVisited),
            buttons_clicked: JSON.stringify(buttonsClicked),
            mouse_movements: JSON.stringify(mouseMovements),
            duration,
            click_count: clickCount,
            downloaded_files: JSON.stringify(downloadedFiles),
            form_submissions: JSON.stringify(formSubmissions),
        });

        res.json({ success: true, visitorData });
    } catch (error) {
        console.error("❌ Error tracking visitor:", error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const totalVisits = await Analytics.count();
        const uniqueVisitors = await Analytics.count({ distinct: true, col: "ip" });

        const analyticsData = await Analytics.findAll({
            attributes: ["country", "browser", "device"],
        });

        res.json({ totalVisits, uniqueVisitors, analyticsData });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
};
