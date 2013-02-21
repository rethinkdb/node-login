module.exports.dbConfig = {
  'host': process.env.RDB_HOST || 'localhost',
  'port': parseInt(process.env.RDB_PORT) || 28015,
  'db'  : process.env.RDB_DB || 'nodelogin',
  'pool' : {
    'max': 100
  }
}
