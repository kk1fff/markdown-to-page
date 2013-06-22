var initEditor = null, editor, editorUpdater;

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

  // Callback function the used for setting source data. Signature function(err, src).
  sourceUpdater: null,

  _waitingForMarkdownData: false,

  _currentId: "",

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
    if (this._currentId == "") {
      url = "/api/insert";
    } else {
      url = "/api/file/" + this._currentId + "/update";
    }

    console.log("Updating: currentId: " + this._currentId + " url: " + url);

    this._waitingForMarkdownData = false;
    $.post(url, {
      content: content
    }, this._updatedMarkdown.bind(this), 'json');
  },

  _updatedMarkdown: function(data) {
    if (this._currentId == "") {
      // Update id if needed.
      this._currentId = data.payload.id;
    }

    // update view.
    this.updateView();
  },

  updateView: function() {
    if (this._currentId == "") {
      // can't update view for a article that is not stored.
      return;
    }

    $.get('/api/file/' + this._currentId + '/html', this._gotHtml.bind(this), 'json');
  },

  _gotHtml: function(data) {
    if (this.viewUpdater) {
      this.viewUpdater(null, data.payload.html);
    }
  },

  fetchSaved: function() {
    if (this._currentId == "") {
      return;
    }

    $.get('/api/file/' + this._currentId + '/source', this._gotSource.bind(this), 'json');
  },

  _gotSource: function(data) {
    if (this.sourceUpdater) {
      this.sourceUpdater(null, data.payload.source);
    }
  },

  setArticleId: function(id) {
    this._currentId = id;
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

function toPixel(input) {
  var m;
  if (typeof input == 'string') {
    if (m = input.match(/^([0-9]+)px$/)) {
      return parseInt(m[1].replace(/^0+/, ''));
    }
  }
}

function initExtentToBottomSize() {
  function extendToButtom(element) {
    var height = window.innerHeight - element.position().top;
    if (height <= 0) {
      element.hide();
    } else {
      element.show();
      element.css('height', height);
    }
  }
  function updateContainerSize() {
    extendToButtom($('.preview-container'));
    extendToButtom($('#input-md'));
  }
  $(window).bind('resize', updateContainerSize);
  $(window).bind('load', updateContainerSize);
}

$(document).ready(function() {
  editor = new Editor();

  editor.markdownGetter = function(callback) {
    setTimeout(callback, 0, null, $("#input-md").val());
  };

  editor.viewUpdater = function(error, content) {
    $("#result-html").html(content);
  };

  editor.sourceUpdater = function(err, src) {
    $("#input-md").val(src); //.trigger('autosize.resize');
  };

  $('#update-input').click(function() {
    editor.update();
  });

  // $("#input-md").autosize();

  editorUpdater = new AutoUpdater($("#input-md"));
  editorUpdater.onUpdate = function() {
    editor.update();
  };

  // This function is expected to be implemented in html file.
  if (initEditor) {
    initEditor();
  }

  initExtentToBottomSize();
});
