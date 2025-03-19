const { DataTypes } = require("sequelize");
const analyticsDB = require("../config/analyticsDatabase");

const Analytics = analyticsDB.define("Analytics", {
    ip: { type: DataTypes.STRING, allowNull: false },
    country: { type: DataTypes.STRING },
    city: { type: DataTypes.STRING },
    isp: { type: DataTypes.STRING },
    browser: { type: DataTypes.STRING },
    os: { type: DataTypes.STRING },
    device: { type: DataTypes.STRING },
    screen_resolution: { type: DataTypes.STRING },
    referrer: { type: DataTypes.STRING },
    pages_visited: { type: DataTypes.JSON },
    buttons_clicked: { type: DataTypes.JSON },
    mouse_movements: { type: DataTypes.JSON },
    duration: { type: DataTypes.INTEGER },
    click_count: { type: DataTypes.INTEGER },
    downloaded_files: { type: DataTypes.JSON },
    form_submissions: { type: DataTypes.JSON }
});

module.exports = Analytics;
