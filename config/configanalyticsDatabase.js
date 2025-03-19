const { Sequelize } = require("sequelize");

const analyticsDB = new Sequelize({
    dialect: "sqlite",
    storage: "./analytics.sqlite", // قاعدة بيانات منفصلة
    logging: false, // تعطيل السجلات لتحسين الأداء
});

module.exports = analyticsDB;
