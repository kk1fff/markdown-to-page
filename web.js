var express = require("express"),
    markdown = require("markdown").markdown;
var app = express();
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

var storage = new Storage();

// User interface
app.get(/\/editor\/([a-z0-9]+)/, function(req, resp) {
  app.render('editor', function(err, html) {
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
  storage.insert(req.body.content, function(err, id) {
    if (err) {
      helper.sendErrorResponse(500, 'cannot add file: ' + err);
      return;
    }
    helper.sendResponse(true, { id: id });
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
app.listen(port, function() {
  console.log("Listening on " + port);
});
