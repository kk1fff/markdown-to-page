var express = require("express"),
    markdown = require("markdown").markdown;
var app = express();
var server = require('http').createServer(app),
    io = require('socket.io').listen(server);

app.use(express.logger());
app.use('/static', express.static(__dirname + '/static'));
app.use(express.bodyParser());

app.set('view engine', 'ejs');

var Utils = {
  formatMessageFor: function(code, msg) {
    if (typeof(msg) === 'string') {
      return msg;
    }
    switch (msg) {
    case 404:
      return 'Page not found';
    case 500:
      return 'Internal error';
    default:
      return 'Unknown error';
    }
  }, 
  sendErrorResponse: function(resp, errorObj) {
    if (errorObj.code) {
      resp.statusCode = errorObj.code;
      resp.end(Utils.formatMessageFor(errorObj.code, errorObj.message));
    }
  }
};

var Config = {
  DEFAULT_ERROR: 500
};

var UpdateNotifier = function(io) {
  this._io = io;
  io.on('connection', function(sock) {
    sock.on('bindid', function(data) {
      console.log(data);
    });
  });
};

UpdateNotifier.prototype = {
  _socks: {},

  addNotifySocket: function(id, sock) {
    if (!this._socks[id]) {
      this._socks[id] = [];
    }

    this._socks[id].push(sock);
  },

  notifyUpdateById: function(id) {
    var socks;
    if (this._socks[id]) {
      socks = this._socks[id];
      socks.forEach(function(sock) {
        try {
          sock.emit('update');
        } catch (e) {
          self.removeNotifySocket(id, sock);
        }
      });
    }
  },

  removeNotifySocket: function(id, sock) {
    if (this._socks[id]) {
      var i = this._socks[id].indexOf(sock);
      if (i != -1) {
        this._socks[id].splice(i, 1);
      }
      if (this._socks[id].length == 0) {
        delete this._socks[id];
      }
    }
  }
};

var updateNotifier = new UpdateNotifier(io);

var Storage = function() {
  this._data = {};
  this._id = 0;
};

Storage.prototype = {
  // Expected callback function(error, id)
  insert: function(content, callback) {
    var id = this._id++;
    this._data[id] = content;
    setTimeout(callback, 0, null, id);
  },

  // Expected callback function(error)
  update: function(id, content, callback) {
    if (!this._data[id]) {
      setTimeout(callback, 0, new Error("no such file"));
      return;
    }
    this._data[id] = content;
    setTimeout(callback, 0);
  },

  // Expected callback function(error, content).
  get: function(id, callback) {
    setTimeout(callback, 0, null, this._data[id]);
  }
};

var DBStore = function() {
  this._mongo = require('mongodb');
  this._client = this._mongo.MongoClient;
  this._objId = this._mongo.ObjectID;
 
  var dbUri = process.env.MONGOLAB_URI || 'mongodb://localhost/mtp';
  var self = this;

  this._client.connect(dbUri, function(err, db) {
    if (err) {
      console.error("Error connecting to mongodb: " + err);
      throw err;
    }

    console.log("Database connected");
    self._db = db;
    self._postCollection = db.collection('post');
    self._started = true;
    self._processQueue();
  });
};

DBStore.prototype = {
  _started: false,

  _padding: [],

  _processQueue: function() {
    while(this._padding.length > 0) {
      this._padding.shift()();
    }
  },

  insert: function(content, opt, cb) {
    if (!this._started) {
      this._padding.push(this.insert.bind(this, content, opt, cb));
      return;
    }

    var id = new this._objId();
    var gs = new this._mongo.GridStore(this._db, id, "w");
    var self = this;
    gs.open(function(err, gs) {
      if (err) {
        console.error("Error open file for insert: " + err);
        cb(err);
        return;
      }
      gs.write(content, function(err, gs) {
        if (err) {
          console.log("Error inserting into db: " + err);
          cb(err);
          return;
        }

        gs.close(function() {
          // Now, save post with file id into our database.
          self._postCollection.insert({
            fileId: id,
            notInPublicList: !!opt.notInPublicList
          }, function(err, doc) {
            if (err) {
              console.error("Error inserting post: " + err);
              cb(err);
              return;
            }
            cb(null, doc[0]._id.toHexString());
          });
        });
      });
    });
  },

  update: function(id, content, cb) {
    if (!this._started) {
      this._padding.push(this.update.bind(this, id, content, cb));
      return;
    }

    var objId;
    try {
      objId = new this._objId(id);
    } catch (e) {
      console.log("Error creating objId: " + e + ", id: " + id);
      cb(e);
      return;
    }

    var self = this;

    // Get object id for file.
    this._postCollection.findOne({ _id: objId }, function(err, post) {
      if (err) {
        console.error("Cannot get post, id: " + id + ", error: " + err);
        cb(err);
        return;
      }

      // Now we can read file.
      var gs = new self._mongo.GridStore(self._db, post.fileId, "w");
      gs.open(function(err, gs) {
        if (err) {
          console.error("Error open file for update: " + err);
          cb(err);
        return;
        }
        gs.write(content, function(err, gs) {
          if (err) {
            console.log("Error updating db: " + err);
            cb(err);
            return;
          }

          gs.close(function() {
            cb(null);
          });
        });
      });
    });
  },

  get: function(id, cb) {
    if (!this._started) {
      this._padding.push(this.get.bind(this, id, cb));
      return;
    }

    var objId;
    try {
      objId = new this._objId(id);
    } catch (e) {
      console.log("Error creating objId: " + e + ", id: " + id);
      cb(e);
      return;
    }

    var self = this;
    // Get object id for file.
    this._postCollection.findOne({ _id: objId }, function(err, post) {
      if (err) {
        console.error("Cannot get post, id: " + id + ", error: " + err);
        cb(err);
        return;
      }

      // Now we can read file.
      var gs = new self._mongo.GridStore(self._db, post.fileId, "r");
      gs.open(function(err, gs) {
        if (err) {
          console.error("Error open file for get: " + err);
          cb(err);
          return;
        }
        gs.read(function(err, data) {
          if (err) {
            console.error("Error reading file: " + err);
            cb(err);
            return;
          }
          gs.close(function() {
            cb(null, data.toString('utf8'));
          });
        });
      });
    });
  },

  // Expecting a callback: function(err, idList), idList is an array of strings.
  // If hideInvisible is true, we should only list the documents that is allowed
  // to be listed in public.
  listAllIds: function(hideInvisible, cb) {
    var cond = {};

    if (hideInvisible) {
      cond.notInPublicList = false;
    }

    this._postCollection.find(cond, function(err, posts) {
      if (err) {
        console.error("Cannot get ids: " + err);
        cb(err);
        return;
      }
      var ids = [];
      posts.each(function(err, post) {
        if (!post) {
          cb(err, ids);
          return;
        }
        ids.push(post._id.toHexString());
      });
    });
  }
};

var storage = new DBStore(); // Storage();

// User interface
app.get("/", function(req, resp) {
  resp.redirect('/static/index.html');
});

app.get(/\/editor\/([a-z0-9]+)/, function(req, resp) {
  app.render('editor', { articleId: req.params[0] }, function(err, html) {
    resp.send(html);
  });
});

app.get("/new", function(req, resp) {
  app.render('editor', { articleId: null }, function(err, html) {
    if (err) {
      console.error("Error rendering page: " + err);
    }
    resp.send(html);
  });
});

app.get(/\/viewer\/([a-z0-9]+)/, function(req, resp) {
  app.render('viewer', { articleId: req.params[0] }, function(err, html) {
    resp.send(html);
  });
});

// API

var APIRequestHelper = function(req, resp) {
  this._req = req;
  this._resp = resp;
};

APIRequestHelper.prototype = {
  sendResponse: function(isOk, payload) {
    this._resp.end(JSON.stringify({
      ok: isOk,
      payload: payload
    }));
  },
  sendErrorResponse: function(code, msg) {
    Utils.sendErrorResponse(this._resp, {
      code: code,
      message: msg
    });
  }
};

app.post('/api/insert', function(req, resp) {
  var helper = new APIRequestHelper(req, resp);
  storage.insert(req.body.content, {}, function(err, id) {
    if (err) {
      helper.sendErrorResponse(500, 'cannot add file: ' + err);
      return;
    }
    helper.sendResponse(true, { id: id });
  });
});

app.get('/api/list', function(req, resp) {
  var helper = new APIRequestHelper(req, resp);
  storage.listAllIds(true, function(err, ids) {
    if (err) {
      helper.sendErrorResponse(500, 'cannot get id list: ' + err);
      return;
    }

    helper.sendResponse(true, { ids: ids });
  });
});

// File API and helper functions

var FileAPIRequestHelper = function(id, req, resp) {
  this._id = id;
  this._req = req;
  this._resp = resp;
};

FileAPIRequestHelper.prototype = {
  sendResponse: function(isOk, payload) {
    this._resp.end(JSON.stringify({
      ok: isOk,
      id: this._id,
      payload: payload
    }));
  },
  sendErrorResponse: function(code, msg) {
    Utils.sendErrorResponse(this._resp, {
      code: code,
      message: msg
    });
  }
};

var FileAPI = function(app, action, name) {
  this._action = action;
  this._app = app;
  this._name = name;
  this._pattern = new RegExp('/api/file/([a-z0-9]+)/' + name);
  app[action](this._pattern, this._requestHandler.bind(this));
};

FileAPI.prototype = {
  _requestHandler: function _requestHandler(req, resp) {
    if (this.onRequest) {
      var helper = new FileAPIRequestHelper(req.params[0], req, resp);
      try {
        this.onRequest(req.params[0], // id
                       helper, // Helper
                       req, resp);
      } catch (e) {
        // Handle errors thrown from actual handler.
        helper.sendErrorResponse(500, e);
      }
    } else {
      console.error('Cannot handle ' + this._name + ' on ' + this._action + ': no handler');
      resp.statusCode = 500;
      resp.end('unable to handle this request');
    }
  }
};

var updateApi = new FileAPI(app, 'post', 'update');
updateApi.onRequest = function(id, helper, req, resp) {
  storage.update(id, req.body.content, function(err) {
    helper.sendResponse(true);
    setTimeout(function() { updateNotifier.notifyUpdateById(id); }, 0);
  });
};

var sourceApi = new FileAPI(app, 'get', 'source');
sourceApi.onRequest = function(id, helper, req, resp) {
  storage.get(id, function(err, content) {
    if (err || !content) {
      helper.sendErrorResponse(404, 'cannot get file, id: ' + id);
      return;
    }
    helper.sendResponse(true, {
      source: content
    });
  });
};

var htmlApi = new FileAPI(app, 'get', 'html');
htmlApi.onRequest = function(id, helper, req, resp) {
  storage.get(id, function(err, content) {
    if (err || !content) {
      helper.sendErrorResponse(404, 'cannot get file, id: ' + id);
      return;
    }
    helper.sendResponse(true, {
      html: markdown.toHTML(content)
    });
  });  
};

var port = process.env.PORT || 5000;
server.listen(port, function() {
  console.log("Listening on " + port);
});
