const { Sequelize } = require("sequelize");

// إنشاء اتصال بقاعدة البيانات SQLite
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite", // تأكد من أن المسار صحيح
  logging:true, // تعطيل السجلات في الكونسول
});

module.exports = sequelize;
