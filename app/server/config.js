// DB configuration
module.exports.dbConfig = {
  host: process.env.RDB_HOST || 'localhost',
  port: parseInt(process.env.RDB_PORT) || 28015,
  db  : process.env.RDB_DB || 'nodelogin',
  // comment out for disabling the DB connection pool
  pool: {
    min: 5,
    max: 100,
    log: true,
    idleTimeoutMillis : 1 * 60 * 1000, // 1 minute
    reapIntervalMillis: 30 * 1000,  // 30 seconds
  }
}

// email configuration
module.exports.emailConfig = {
  host      : 'smtp.gmail.com',
  user      : 'your-email-address@gmail.com',
  password  : 'your-email-password',
  sender    : 'Your Name <your-email-address@gmail.com>',
  resetLink : 'http://localhost:8080/reset-password?e=%s&p=%s' // 2 placeholders for email and password hash
}