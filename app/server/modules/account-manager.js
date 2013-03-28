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
  console.log("autoLogin: {%s, %s}", user);

  onConnection(function(err, connection) {
    if(err) {
      console.log("[ERROR][autoLogin]: %s:%s\n%s", err.name, err.msg, err.message);
      return callback(null);
    }
    r.table('accounts').filter({user: user}).run(connection, function(err, cursor) {
      if(err) {
        console.log("[ERROR][autoLogin][filter]: %s:%s\n%s", err.name, err.msg, err.message);
        return callback(null)
      }
      if(!cursor.hasNext()) {
        console.log("[INFO ]: User not found '%s'", user);
        release(connection);
        return callback(null);
      }
      cursor.next(function(err, result) {
        if(err) {
          console.log("[ERROR][autoLogin][next]: %s:%s\n%s", err.name, err.msg, err.message);
          callback(null);
        }
        else {
          if(result.pass === pass) {
            callback(result);
          }
          else {
            console.log("[INFO ]: User '%s' found but pass doesn't match", user);
            callback(null);
          }
        }
        release(connection);
      });
    });
  });
}

/**
 * TODO: see if the password check can be performed in the query
 */
exports.manualLogin = function(user, pass, callback) {
  console.log("manualLogin: {%s, %s}", user);

  onConnection(function(err, connection) {
    if(err) { 
      console.log("[ERROR][manualLogin]: %s:%s\n%s", err.name, err.msg, err.message);
      callback(null);
      return;
    }

    r.table('accounts').filter({user: user}).limit(1).run(connection, function(err, cursor) {
      if(err) {
        console.log("[ERROR][manualLogin]: %s:%s\n%s", err.name, err.msg, err.message);
        callback(null);
      }
      else {
        if(cursor.hasNext()) {
          cursor.next(function(err, o) {
            if(err) {
              console.log("[ERROR][manualLogin]: %s:%s\n%s", err.name, err.msg, err.message);
              release(connection);
            }
            else {
              validatePassword(pass, o.pass, function(err, res) {
                if (res) {
                  callback(null, o);
                }
                else {
                  callback('invalid-password');
                }
                release(connection);
              });              
            }
          });
        }
        else {
          console.log("[INFO ][manualLogin]: User not found '%s'", user);
          callback('user-not-found');
          release(connection);
        }
      }
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
      console.log("[ERROR][addNewAccount]: %s:%s\n%s", err.name, err.msg, err.message);
      callback(err);
      return
    }

    r.table('accounts').filter(function(doc) { return r.or(doc('user').eq(newData.user), doc('email').eq(newData.email));})
     .limit(1).run(connection, function(err, cursor) {
        if(err) {
          console.log("[ERROR][addNewAccount]: %s:%s\n%s", err.name, err.msg, err.message);
        }
        else {
          if(cursor.hasNext()) {
            cursor.next(function(err, result) {
              if(err) {
                console.log("[ERROR][addNewAccount][next]: %s:%s\n%s", err.name, err.msg, err.message);
              }
              else {
                if (result.user == newData.user) {
                  callback('username-taken');
                }
                else {
                  callback('email-taken');
                }
              }
              release(connection);
            });
          }
          else {
            saltAndHash(newData.pass, function(hash) {
              newData.pass = hash;
              // append date stamp when record was created //
              newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
            
              r.table('accounts').insert(newData).run(connection, function(err, result) {
                if(result && result.inserted === 1) {
                  newData['id'] = result['generated_keys'][0];
                  callback(null, newData);
                }
                else {
                  console.log("[ERROR][addNewAccount][insert]: %s:%s\n%s", err.name, err.msg, err.message);
                  callback(null);
                }
                release(connection);
              });
            }); 
          }
        }
      });
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
      console.log("[ERROR][update]: %s:%s\n%s", err.name, err.msg, err.message);
      return callback(err);
    }
    
    r.table('accounts').filter({user: newUserData.user}).limit(1)
     .update(newUserData)
     .run(connection, function(err, result) {
        if(err) {
          console.log("[ERROR][update]: %s:%s\n%s", err.name, err.msg, err.message);
          callback(err.msg);
        }
        else if(result.replaced === 1) {
          callback(null, newUserData);
        }
        else {
          callback(false);
        }
        release(connection);
      }
    )
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
  saltAndHash(newPass, function(hash){
    onConnection(function(err, connection) {
      if(err) {
        console.log("[ERROR][updatePassword]: %s:%s\n%s", err.name, err.msg, err.message);
        return callback(err);
      }

      r.table('accounts').filter({email: email}).limit(1).update({pass: hash}).run(connection,
        function(err, result) {
          if(result && result.replaced === 1) {
            callback(true);
          }
          else {
            callback(false);
          }
          release(connection);
        }
      );
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

    r.table('accounts').filter({email: email}).limit(1).run(connection,
      function(err, cursor) {
        if(err) {
          console.log("[ERROR][getAccountByEmail]: %s:%s\n%s", err.name, err.msg, err.message);
          return callback(false);
        }
        cursor.next(function(err, result) {
          if(err) {
            console.log("[ERROR][getAccountByEmail][next]: %s:%s\n%s", err.name, err.msg, err.message);
            callback(false);
          }
          else {
            callback(result);
          }
          release(connection);
        });
      }
    )
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

    r.table('accounts').filter({email: email, pass: passHash}).limit(1).run(connection,
      function(err, cursor) {
        if(err) {
          console.log("[ERROR][validateResetLink] %s:%s\n%s", err.name, err.msg, err.message);
          callback(null);
          release(connection);
        }
        else {
          cursor.next(function(err, result) {
            if(err) {
              callback(null);
            }
            else {
              callback('ok');
            }
            release(connection);
          });
        }
      }
    )
  });
}

/**
 * Retrieve all accounts using [`table`]
 *
 * @param {Function} callback
 */
exports.getAllRecords = function(callback) {
  onConnection(function(err, connection) {
    if(err) { return callback(err) }

    r.table('accounts').run(connection, function(err, cursor) {
      if(err) {
        release(connection);
        return callback(err);
      }
      cursor.toArray(function(err, results) {
        if(err) {
          callback(err);
        }
        else {
          callback(null, results);
        }
        release(connection);
      });
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

    r.table('accounts').get(id).delete().run(connection, function(err, result) {
      if(err || result.deleted !== 1) {
        callback(false);
      }
      else {
        callback(null, true);
      }
      release(connection);
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
    r.table('accounts').delete().run(connection, function(err, result) {
      if(err) {
        console.log("[ERROR] delAllRecords: %s", result['message']);
        callback(err.msg);
      }
      else {
        console.log("[INFO] delAllRecords: Removed %s accounts", result.deleted);
        callback(null, result.deleted);
      }
      release(connection);
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
      r.connect({host: dbConfig.host, port: dbConfig.port}, function(err, connection) {
          if(err) {
            var errMsg = util.format("Failed connecting to RethinkDB instance on {host: %s, port: %s}", dbConfig.host, dbConfig.port);
            console.log("[ERROR]: " + errMsg);
            return callback(new Error(errMsg));
          }
          connection._id = Math.floor(Math.random()*10001);
          connection.use(dbConfig.db);
          console.log("[DEBUG]: Connection created: %s", connection._id);
          callback(null, connection);
      });
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
        console.log("[DEBUG]: Pooled connection: %s", connection._id);
        callback(null, connection);
      }
    });
  }
  else {
    r.connect({host: dbConfig.host, port: dbConfig.port}, function(err, connection) {
      if(err) {
        console.log("[ERROR]: Cannot connect to RethinkDB database: %s on port %s", dbConfig['host'], dbConfig['port']);
        callback(err);
      }
      else {
        connection._id = Math.floor(Math.random()*10001);
        connection.use(dbConfig.db);
        console.log("[DEBUG]: Connection created: %s", connection._id);
        callback(null, connection);
      }
    });
  }
}

/**
 * Closing the connection or returning it to the connection pool
 * if using it.
 */ 
function release(connection) {
  console.log("[DEBUG]: Releasing connection: %s", connection._id);
  if(useConnectionPooling) {
    connectionPool.release(connection);
  }
  else {
    connection.close();
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
