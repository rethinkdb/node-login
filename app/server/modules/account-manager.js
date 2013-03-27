var crypto = require('crypto'),
    moment = require('moment'),
    dbConfig = require('../config').dbConfig,
    util = require('util'),
    r = require('rethinkdb'),
    useConnectionPooling = false,
    connectionPool = null;


/* login validation methods */

/**
 * TODO
 *
 * Retrieve an user by the username and check 
 */
exports.autoLogin = function(user, pass, callback) {
  console.log("autoLogin: {%s, %s}", user, pass);

  onConnection(function(err, connection) {
    if(err) { 
      callback(null);
      return;
    }
    connection.run(r.table('accounts').filter({user: user}), function(result){
      if(result === undefined) {
        console.log("[INFO ]: User not found '%s'", user);
        callback(null);
      }
      else if(result && result['name'] === 'Runtime Error') {
        console.log("[ERROR]: %s", result['message']);
        callback(null);
      }
      else if (result['pass'] === pass){
        callback(result);
      }
      else {
        console.log("[INFO ]: User '%s' found but pass doesn't match", user);
        callback(null);
      }
      return false; // get only the first result
    });    
  });
}

/**
 * TODO: see if the password check can be performed in the query
 */
exports.manualLogin = function(user, pass, callback) {
  console.log("manualLogin: {%s, %s}", user, pass);

  onConnection(function(err, connection) {
    if(err) { 
      callback(null);
      return;
    }

    connection.run(r.table('accounts').filter({user: user}).limit(1), function(result) {
      if(result === undefined) {
        console.log("[INFO ]: User not found '%s'", user);
        callback('user-not-found');
      }    
      else if(result && result['name'] === 'Runtime Error') {
        console.log("[ERROR]: %s", result['message']);
        callback(null);
      }
      else {
        validatePassword(pass, result.pass, function(err, res) {
          if (res) {
            callback(null, result);
          }
          else {
            callback('invalid-password');
          }
        });
      }
      return false; // process only the first result
    });
  });
}

/* CRUD operations: record insertion, update & deletion methods */

/**
 * Create a new account using [`insert`]
 *
 * @param {Object} newData
 *
 * @param {Function} callback
 */
exports.addNewAccount = function(newData, callback) {
  onConnection(function(err, connection) {
    if(err) {
      callback(err);
      return
    }
    connection.run(r.table('accounts').filter(
      function(doc) {
        return doc('user').eq(newData.user).or(doc('email').eq(newData.email))
      }).limit(1), function(result) {
        // nothing found: we can insert
        if(result === undefined) {
          console.log("[DEBUG]: Inserting: %j", newData);
          saltAndHash(newData.pass, function(hash){
            newData.pass = hash;
            // append date stamp when record was created //
            newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
            connection.run(r.table('accounts').insert(newData), function(result) {
              if(result && result['inserted'] === 1) {
                newData['id'] = result['generated_keys'][0];
                callback(null, newData);
              }
              else {
                callback(null);
              }
            });
          });          
        }
        else if(result['name'] !== 'Runtime Error') {
          if (result['user'] == newData.user) {
            callback('username-taken');
          }
          else {
            callback('email-taken');
          }
        }
        return false;
      }
    );
  });
}

exports.updateAccount = function(newData, callback) {
  if (newData.pass === '') {
    delete newData.pass;
    update(newData, callback);
  }
  else {
    saltAndHash(newData.pass, function(hash) {
      newData.pass = hash;
      update(newData, callback);
    })
  }
}

function update(newUserData, callback) {
  console.log("[DEBUG] update: %j", newUserData);
  onConnection(function(err, connection) {
    if(err) {
      return callback(err);
    }
    connection.run(r.table('accounts').filter({user: newUserData.user}).limit(1).update(newUserData),
      function(result) {
        console.log("[DEBUG] update: %j", result);

        if(result && result.name === 'Runtime Error') {
          console.log("[ERROR] update: %s", result.message);
          callback(result.message);
        }
        else if (result.updated === 1) {
          callback(null, newUserData);
        }
        else {
          callback(false);
        }
        return false;
      }
    );
  });
}

/**
 * Update the password retrieving firstly the account by the given `email`
 * using [`filter`] and than [`update`].
 *
 * @param {String} email
 *    the email of the account
 *
 * @param {String} newPass
 *    the new password (non-hashed yet)
 *
 * @param {Function} callback
 */ 
exports.updatePassword = function(email, newPass, callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(false) }

    saltAndHash(newPass, function(hash){
      connection.run(r.table('accounts').filter({email: email}).limit(1).update({pass: hash}), function(result) {
        if(result && result['name'] === 'Runtime Error') {
          console.log("[ERROR] updatePassword: %s", result['message']);
          callback(false);
        }
        else if (result['updated'] === 1) {
          callback(true);
        }
        else {
          callback(false);
        }
        return false;
      });    
    });
  });
}

/* account lookup methods */

/**
 * Retrieve an account given the `email` using [`filter`].
 *
 * @param {String} email
 *    the account email
 *
 * @param {Function} callback
 */
exports.getAccountByEmail = function(email, callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(false)}
    connection.run(r.table('accounts').filter({email: email}).limit(1), function(result) {
      if(result && result['name'] === 'Runtime Error') {
        console.log("[ERROR] getAccountByEmail(%s): %s", email, result['message']);
        callback(false);
      }
      else {
        callback(result);
      }
      return false;
    });
  });
}

/**
 * Validate a reset password link by finding the account
 * associated with the `email` and password hash using
 * [`filter`] with an [`and`] condition.
 *
 * @param {String} email
 *    the account email
 *
 * @param {String} passHash
 *    the account hashed password
 *
 * @param {Function} callback
 */
exports.validateResetLink = function(email, passHash, callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(null) }
    connection.run(r.table('accounts').filter({email: email, pass: passHash}).limit(1), function(result) {
      if(result && result['name'] === 'Runtime Error') {
        console.log("[ERROR] validateResetLink: %s", result['message']);
        callback(null);
      }
      else {
        callback('ok')
      }
    });
  });
}

/**
 * Retrieve all accounts using [`table`]
 *
 * @param {Function} callback
 */
exports.getAllRecords = function(callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(err, []) }
    connection.run(r.table('accounts'), {}).collect(function(results) {
      if(results.length === 1 && results[0]['name'] === 'Runtime Error') {
        console.log("[ERROR] getAllRecords: %s", results[0]['message']);
        callback(results[0]['message'], [])
      }
      else {
        callback(null, results);
      }
    });
  })
};

/**
 * Delete an account by `id` using [`get`] followed by [`del`].
 *
 * @param {String} id
 *    the account id
 *
 * @param {Function} callback
 */
exports.deleteAccount = function(id, callback) {
  console.log("deleteAccount: %s", id);
  onConnection(function(err, connection) {
    if(err) { return callback(err) }
    connection.run(r.table('accounts').get(id).del(), function(result) {
      if(result['name'] === 'Runtime Error') {
        console.log("[ERROR]: %s", result['message']);
        callback(result['message']);
      }
      else {
        if(result['deleted'] === 1) {
          callback(null, true);
        }
        else {
          callback(false);
        }
      }
      return false;
    });
  });
}

/**
 * Delete all records using [`table`].[`del`]
 *
 * @param {Function} callback
 */
exports.delAllRecords = function(callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(err) }
    connection.run(r.table('accounts').del(), function(result) {
      if(result && result['name'] === 'Runtime Error') {
        console.log("[ERROR] delAllRecords: %s", result['message']);
        callback(result['message']);
      }
      else {
        console.log("[INFO] delAllRecords: Removed %s accounts", result['deleted']);
        callback(null, result['deleted']);
      }
      return false;
    });
  })
}

// utility functions

// configure connection pooling if settings are provided in `config`
if (typeof dbConfig.pool === 'object') {
  var pool = require('generic-pool');
  useConnectionPooling = true;

  connectionPool = pool.Pool({
    name: 'rethinkdb',
    max : dbConfig.pool.max || 1000,
    min : dbConfig.pool.min || 2,
    log : dbConfig.pool.log || true,
    idleTimeoutMillis : dbConfig.pool.idleTimeoutMillis || 1 * 60 * 1000,
    reapIntervalMillis: dbConfig.pool.reapIntervalMillis || 30 * 1000, 

    create: function(callback) {
      r.connect({host: dbConfig['host'] || 'localhost', port: dbConfig['port'] || 28015 }, 
        function(connection){
          connection._id = Math.floor(Math.random()*10001);
          connection.use(dbConfig.db);
          console.log("[DEBUG]: Connection created: %s", connection._id);
          return callback(null, connection);
        }, 
        function() {
          var errMsg = util.format("Failed connecting to RethinkDB instance on {host: %s, port: %s}", dbConfig.host, dbConfig.port);
          console.log("[ERROR]: " + errMsg);
          return callback(new Error(errMsg));
        }
      );
    },

    destroy: function(connection) {
      console.log("[DEBUG]: Connection closed: %s", connection._id);

      connection.close();
    }
  });

}

/**
 * Get a database connection. If a connection pool is
 * configured in `config` then the connection is
 * retrieved from the pool. Otherwise a new connection
 * is created.
 */
function onConnection(callback) {
  if(useConnectionPooling) {
    connectionPool.acquire(function(err, connection) {
      if(err) {
        callback(err);
      }
      else {
        try {
          callback(null, connection);
        }
        finally {
          connectionPool.release(connection);
        }
      }
    });
  }
  else {
    r.connect({host: dbConfig.host, port: dbConfig['port']}, function(connection) {
        connection['_id'] = Math.floor(Math.random()*10001);
        connection.use(dbConfig.db);
        callback(null, connection);
      },
      function(err) {
        console.log("[ERROR]: Cannot connect to RethinkDB database: %s on port %s", dbConfig['host'], dbConfig['port']);
        callback(err);
      }
    )
  }
}

/* private encryption & validation methods */

var generateSalt = function()
{
  var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
  var salt = '';
  for (var i = 0; i < 10; i++) {
    var p = Math.floor(Math.random() * set.length);
    salt += set[p];
  }
  return salt;
}

var md5 = function(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function(pass, callback)
{
  var salt = generateSalt();
  callback(salt + md5(pass + salt));
}

var validatePassword = function(plainPass, hashedPass, callback)
{
  var salt = hashedPass.substr(0, 10);
  var validHash = salt + md5(plainPass + salt);
  callback(null, hashedPass === validHash);
}
