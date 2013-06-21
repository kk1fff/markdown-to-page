var Editor = function() {
};

Editor.prototype = {

  // A function that returns the value. This function is expected to accept a callback
  // function: function (error, content). When the |markdownGetter| is called, it is expected
  // to call the callback when content is ready, or return an error string for error reporting.
  markdownGetter: null,

  // A function that takes callback of content. The content is fed as HTML string.
  // Expected signature is function(error, content).
  viewUpdater: null,

  _waitingForMarkdownData: false,

  _currentId: -1,

  update: function() {
    if (!this.markdownGetter) {
      throw new Error("No markdownGetter");
    }

    if (this._waitingForMarkdownData) {
      return;
    }

    this._waitingForMarkdownData = true;
    this.markdownGetter(this._gotMarkdown.bind(this));
  },

  _gotMarkdown: function(err, content) {
    var url;
    if (this._currentId == -1) {
      url = "/api/insert";
    } else {
      url = "/api/file/" + this._currentId + "/update";
    }

    this._waitingForMarkdownData = false;
    $.post(url, {
      content: content
    }, this._updatedMarkdown.bind(this), 'json');
  },

  _updatedMarkdown: function(data) {
    if (this._currentId == -1) {
      // Update id if needed.
      this._currentId = data.payload.id;
    }

    // update view.
    this.updateView();
  },

  updateView: function() {
    if (this._currentId == -1) {
      // can't update view for a article that is not stored.
      return;
    }

    $.get('/api/file/' + this._currentId + '/html', this._gotHtml.bind(this), 'json');
  },

  _gotHtml: function(data) {
    if (this.viewUpdater) {
      this.viewUpdater(null, data.payload.html);
    }
  }
};

var AutoUpdater = function(textElement) {
  textElement.bind("keypress", this._onContentUpdated.bind(this));
};

AutoUpdater.prototype = {
  // A callback is called when target text element is ready to update. It takes no arguemnt.
  onUpdate: null,

  _timer: null,

  _onContentUpdated: function() {
    if (this._timer) {
      return;
    }

    this._timer = setTimeout(this._tryUpdate.bind(this),
                             1000 /* 1 sec after user updated content */);
  },

  _tryUpdate: function() {
    this._timer = null;
    if (this.onUpdate) {
      this.onUpdate();
    }
  }
};

var editor, editorUpdater;

$(document).ready(function() {
  editor = new Editor();

  editor.markdownGetter = function(callback) {
    setTimeout(callback, 0, null, $("#input-md").val());
  };

  editor.viewUpdater = function(error, content) {
    $("#result-html").html(content);
  };

  $('#update-input').click(function() {
    editor.update();
  });

  $("#input-md").autosize();

  editorUpdater = new AutoUpdater($("#input-md"));
  editorUpdater.onUpdate = function() {
    editor.update();
  };
});
